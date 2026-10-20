import { Biodata, Proposal, User } from '../models/index.js';
import { ApiError } from '../utils/api-error.js';
import { hashPassword, verifyPassword } from '../utils/crypto.js';
import { revokeAllSessions } from './token.service.js';

// A member managing their own account.

async function assertPassword(userId, password, field) {
  const user = await User.findById(userId).select('+passwordHash');
  if (!(await verifyPassword(password, user.passwordHash))) {
    throw new ApiError(400, 'WRONG_PASSWORD', 'The password is incorrect.', {
      fields: { [field]: 'invalid' },
    });
  }
  return user;
}

export async function updateProfile(user, { name, language }) {
  if (name !== undefined) user.name = name;
  if (language !== undefined) user.language = language;
  await user.save();
  return user;
}

/** Changes the password and signs out every device (the caller signs the current one back in). */
export async function changePassword(userId, { currentPassword, newPassword }) {
  const user = await assertPassword(userId, currentPassword, 'currentPassword');
  user.passwordHash = await hashPassword(newPassword);
  await user.save();
  await revokeAllSessions(user._id);
  return user;
}

/** Deactivates the account: hides the biodata, withdraws proposals and signs out everywhere. */
export async function deactivate(userId, { password, reason }) {
  const user = await assertPassword(userId, password, 'password');
  user.status = 'deactivated';
  user.deactivatedAt = new Date();
  user.statusReason = reason;
  await user.save();
  await Biodata.updateOne(
    { user: user._id, deletedAt: null },
    { deletedAt: new Date(), deleteReason: 'other', deleteNote: 'Account deactivated' },
  );
  await Proposal.updateMany({ from: user._id, status: 'pending' }, { status: 'withdrawn' });
  await revokeAllSessions(user._id);
}
