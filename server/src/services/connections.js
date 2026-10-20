import { ApiError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import { notify } from '../lib/audit.js';
import { Biodata, ConnectionTransaction, ContactUnlock, Payment, User } from '../models/index.js';

/**
 * Atomically changes a user's connection balance and writes a ledger entry.
 * Negative changes never take the balance below zero: they fail with 402, or, with
 * `clamp`, remove only what is left.
 */
export async function changeBalance(userId, delta, { type, reason, payment, biodata, refund, actor, clamp = false } = {}) {
  if (!Number.isInteger(delta) || delta === 0) throw new ApiError(400, 'BAD_QUANTITY', 'Quantity must be a whole number.');
  let applied = delta;
  const inc = { connectionBalance: delta };
  if (type === 'unlock') inc.connectionsUsed = 1;
  if (type === 'purchase') inc.connectionsPurchased = delta;

  let user;
  if (delta > 0) {
    user = await User.findByIdAndUpdate(userId, { $inc: inc }, { new: true });
  } else {
    user = await User.findOneAndUpdate({ _id: userId, connectionBalance: { $gte: -delta } }, { $inc: inc }, { new: true });
    if (!user && clamp) {
      const current = await User.findById(userId);
      if (!current) throw new ApiError(404, 'NOT_FOUND', 'User not found.');
      if (current.connectionBalance === 0) return { user: current, applied: 0, transaction: null };
      applied = -current.connectionBalance;
      user = await User.findOneAndUpdate(
        { _id: userId, connectionBalance: current.connectionBalance },
        { $inc: { connectionBalance: applied } },
        { new: true },
      );
    }
  }
  if (!user) {
    const exists = await User.exists({ _id: userId });
    if (!exists) throw new ApiError(404, 'NOT_FOUND', 'User not found.');
    throw new ApiError(402, 'INSUFFICIENT_CONNECTIONS', 'You do not have enough connections. Please buy a package.');
  }
  const transaction = await ConnectionTransaction.create({
    user: userId, type, delta: applied, balanceAfter: user.connectionBalance, reason, payment, biodata, refund, actor,
  });
  return { user, applied, transaction };
}

/**
 * Marks a payment verified and credits its connections exactly once, even if two
 * admins (or an admin and a gateway callback) act at the same time.
 */
export async function creditPayment(paymentId, { actor, trxId, gatewayResponse } = {}) {
  const set = { status: 'verified', creditedAt: new Date(), reviewedAt: new Date() };
  if (actor) set.reviewedBy = actor;
  if (trxId) set.trxId = trxId;
  if (gatewayResponse) set['gateway.response'] = gatewayResponse;
  const payment = await Payment.findOneAndUpdate(
    { _id: paymentId, status: { $in: ['initiated', 'pending'] }, creditedAt: null },
    { $set: set },
    { new: true },
  );
  if (!payment) return null;
  try {
    await changeBalance(payment.user, payment.connections, { type: 'purchase', payment: payment._id, actor, reason: payment.invoiceNo });
  } catch (err) {
    // Roll the status back so the payment can be verified again.
    await Payment.updateOne({ _id: payment._id }, { $set: { status: 'pending' }, $unset: { creditedAt: 1 } });
    logger.error({ err, payment: payment.invoiceNo }, 'Crediting a payment failed');
    throw err;
  }
  await notify(payment.user, 'payment_verified', { invoiceNo: payment.invoiceNo, connections: payment.connections }, '/dashboard/connections');
  return payment;
}

/**
 * Unlocks a biodata's contact details for a user, charging one connection the
 * first time only. Safe against double clicks and concurrent requests.
 */
export async function unlockContact(user, biodata) {
  const existing = await ContactUnlock.findOne({ user: user._id, biodata: biodata._id });
  if (existing) return { unlock: existing, charged: false, balance: user.connectionBalance };

  let unlock;
  try {
    unlock = await ContactUnlock.create({ user: user._id, biodata: biodata._id });
  } catch (err) {
    if (err?.code === 11000) {
      const again = await ContactUnlock.findOne({ user: user._id, biodata: biodata._id });
      return { unlock: again, charged: false, balance: user.connectionBalance };
    }
    throw err;
  }
  try {
    const { user: updated, transaction } = await changeBalance(user._id, -1, { type: 'unlock', biodata: biodata._id, reason: biodata.biodataNo });
    unlock.transaction = transaction._id;
    await unlock.save();
    await Biodata.updateOne({ _id: biodata._id }, { $inc: { 'stats.unlocks': 1 } });
    return { unlock, charged: true, balance: updated.connectionBalance };
  } catch (err) {
    await ContactUnlock.deleteOne({ _id: unlock._id });
    throw err;
  }
}
