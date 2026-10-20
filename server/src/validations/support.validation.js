import { z } from 'zod';
import {
  REPORT_STATUS,
  TICKET_CATEGORIES,
  TICKET_PRIORITY,
  TICKET_STATUS,
  optionValues,
} from '@ghotok/shared';
import { CONTACT_MESSAGE_STATUS } from '../models/index.js';
import { optionalEmail } from './common.validation.js';

export const createTicket = z.object({
  subject: z.string().trim().min(4, 'Please add a short subject.').max(160),
  category: z.enum(optionValues(TICKET_CATEGORIES)).default('other'),
  message: z.string().trim().min(10, 'Please describe the problem.').max(5000),
});

export const replyToTicket = z.object({ message: z.string().trim().min(1).max(5000) });

export const contactMessage = z.object({
  name: z.string().trim().min(2, 'Please enter your name.').max(80),
  email: optionalEmail,
  phone: z.string().trim().max(20).optional(),
  subject: z.string().trim().max(160).optional(),
  message: z.string().trim().min(10, 'Please write a little more.').max(3000),
});

// ----- Staff -------------------------------------------------------------------

const list = { page: z.string().optional(), limit: z.string().optional() };

export const ticketsQuery = z.object({
  status: z
    .union([z.enum(optionValues(TICKET_STATUS)), z.literal('active')])
    .optional()
    .catch(undefined),
  category: z.enum(optionValues(TICKET_CATEGORIES)).optional().catch(undefined),
  q: z.string().trim().max(80).optional(),
  ...list,
});

export const staffReply = z.object({
  message: z.string().trim().min(1).max(5000),
  close: z.boolean().optional(),
});

export const updateTicket = z.object({
  status: z.enum(optionValues(TICKET_STATUS)).optional(),
  priority: z.enum(optionValues(TICKET_PRIORITY)).optional(),
  assignToMe: z.boolean().optional(),
});

export const contactMessagesQuery = z.object({
  status: z.enum(CONTACT_MESSAGE_STATUS).optional().catch(undefined),
  ...list,
});

export const updateContactMessage = z.object({ status: z.enum(CONTACT_MESSAGE_STATUS) });

export const reportsQuery = z.object({
  status: z
    .union([z.enum(optionValues(REPORT_STATUS)), z.literal('active')])
    .optional()
    .catch(undefined),
  ...list,
});

export const updateReport = z.object({
  status: z.enum(optionValues(REPORT_STATUS)),
  actionTaken: z.string().trim().max(500).optional(),
});
