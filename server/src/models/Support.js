import mongoose from 'mongoose';
import {
  REPORT_REASONS, REPORT_STATUS, RESTORE_STATUS, TICKET_CATEGORIES, TICKET_PRIORITY, TICKET_STATUS, optionValues,
} from '@ghotok/shared';

const { Schema } = mongoose;

const reportSchema = new Schema(
  {
    reporter: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    biodata: { type: Schema.Types.ObjectId, ref: 'Biodata' },
    targetUser: { type: Schema.Types.ObjectId, ref: 'User' },
    reason: { type: String, enum: optionValues(REPORT_REASONS), required: true },
    details: { type: String, maxlength: 2000 },
    status: { type: String, enum: optionValues(REPORT_STATUS), default: 'open', index: true },
    actionTaken: { type: String, maxlength: 500 },
    handledBy: { type: Schema.Types.ObjectId, ref: 'User' },
    handledAt: Date,
  },
  { timestamps: true },
);
reportSchema.index({ createdAt: -1 });
export const Report = mongoose.model('Report', reportSchema);

const messageSchema = new Schema(
  {
    author: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    staff: { type: Boolean, default: false },
    body: { type: String, required: true, maxlength: 5000 },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

const ticketSchema = new Schema(
  {
    ticketNo: { type: String, required: true, unique: true },
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    subject: { type: String, required: true, maxlength: 160 },
    category: { type: String, enum: optionValues(TICKET_CATEGORIES), default: 'other' },
    status: { type: String, enum: optionValues(TICKET_STATUS), default: 'open', index: true },
    priority: { type: String, enum: optionValues(TICKET_PRIORITY), default: 'normal' },
    assignedTo: { type: Schema.Types.ObjectId, ref: 'User' },
    messages: [messageSchema],
    lastMessageAt: { type: Date, default: Date.now },
    closedAt: Date,
  },
  { timestamps: true },
);
ticketSchema.index({ lastMessageAt: -1 });
export const SupportTicket = mongoose.model('SupportTicket', ticketSchema);

const restoreSchema = new Schema(
  {
    biodata: { type: Schema.Types.ObjectId, ref: 'Biodata', required: true },
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    reason: { type: String, maxlength: 1000 },
    status: { type: String, enum: optionValues(RESTORE_STATUS), default: 'pending', index: true },
    note: { type: String, maxlength: 500 },
    decidedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    decidedAt: Date,
  },
  { timestamps: true },
);
export const RestoreRequest = mongoose.model('RestoreRequest', restoreSchema);

const contactSchema = new Schema(
  {
    name: { type: String, required: true, maxlength: 80 },
    email: { type: String, maxlength: 120 },
    phone: { type: String, maxlength: 20 },
    subject: { type: String, maxlength: 160 },
    message: { type: String, required: true, maxlength: 3000 },
    user: { type: Schema.Types.ObjectId, ref: 'User' },
    status: { type: String, enum: ['new', 'read', 'replied', 'archived'], default: 'new', index: true },
    ip: String,
  },
  { timestamps: true },
);
export const ContactMessage = mongoose.model('ContactMessage', contactSchema);
