import mongoose from 'mongoose';
import { LEDGER_TYPES, PAYMENT_METHODS, PAYMENT_STATUS, REFUND_RESOLUTIONS, REFUND_STATUS, optionValues } from '@ghotok/shared';

const { Schema } = mongoose;

const i18n = { en: { type: String, trim: true }, bn: { type: String, trim: true } };

const packageSchema = new Schema(
  {
    name: { en: { type: String, required: true, trim: true }, bn: { type: String, trim: true } },
    description: i18n,
    connections: { type: Number, required: true, min: 1 },
    price: { type: Number, required: true, min: 1 },
    isActive: { type: Boolean, default: true },
    highlight: { type: Boolean, default: false },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true },
);
export const Package = mongoose.model('Package', packageSchema);

const paymentSchema = new Schema(
  {
    invoiceNo: { type: String, required: true, unique: true },
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    package: { type: Schema.Types.ObjectId, ref: 'Package' },
    packageName: i18n,
    connections: { type: Number, required: true, min: 1 },
    amount: { type: Number, required: true, min: 1 },
    method: { type: String, enum: optionValues(PAYMENT_METHODS), required: true },
    mode: { type: String, enum: ['manual', 'gateway'], required: true },
    senderNumber: String,
    trxId: { type: String, trim: true },
    status: { type: String, enum: optionValues(PAYMENT_STATUS), default: 'pending', index: true },
    gateway: {
      paymentId: { type: String, index: true },
      response: Schema.Types.Mixed,
    },
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    reviewedAt: Date,
    rejectReason: { type: String, maxlength: 500 },
    creditedAt: Date,
    refundedAt: Date,
  },
  { timestamps: true },
);
paymentSchema.index({ method: 1, trxId: 1 });
paymentSchema.index({ createdAt: -1 });
export const Payment = mongoose.model('Payment', paymentSchema);

const refundSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    payment: { type: Schema.Types.ObjectId, ref: 'Payment', required: true },
    reason: { type: String, required: true, maxlength: 1000 },
    status: { type: String, enum: optionValues(REFUND_STATUS), default: 'pending', index: true },
    resolution: { type: String, enum: optionValues(REFUND_RESOLUTIONS) },
    connections: Number,
    amount: Number,
    refundTrxId: String,
    note: { type: String, maxlength: 1000 },
    decidedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    decidedAt: Date,
  },
  { timestamps: true },
);
export const RefundRequest = mongoose.model('RefundRequest', refundSchema);

// Append-only ledger. The user's balance is the source of truth for spending;
// this ledger explains every change to it.
const txSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: { type: String, enum: optionValues(LEDGER_TYPES), required: true },
    delta: { type: Number, required: true },
    balanceAfter: { type: Number, required: true },
    payment: { type: Schema.Types.ObjectId, ref: 'Payment' },
    biodata: { type: Schema.Types.ObjectId, ref: 'Biodata' },
    refund: { type: Schema.Types.ObjectId, ref: 'RefundRequest' },
    actor: { type: Schema.Types.ObjectId, ref: 'User' },
    reason: { type: String, maxlength: 500 },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
txSchema.index({ user: 1, createdAt: -1 });
txSchema.index({ type: 1, createdAt: -1 });
export const ConnectionTransaction = mongoose.model('ConnectionTransaction', txSchema);
