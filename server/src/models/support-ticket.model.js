import mongoose from 'mongoose';
import { TICKET_CATEGORIES, TICKET_PRIORITY, TICKET_STATUS, optionValues } from '@ghotok/shared';

const { Schema } = mongoose;

const messageSchema = new Schema(
  {
    author: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    staff: { type: Boolean, default: false },
    body: { type: String, required: true, maxlength: 5000 },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

/**
 * A support conversation between a member and staff.
 * Status: open → answered (staff replied) ⇄ waiting (member replied) → closed
 */
const supportTicketSchema = new Schema(
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

supportTicketSchema.index({ lastMessageAt: -1 });

export const SupportTicket = mongoose.model('SupportTicket', supportTicketSchema);
