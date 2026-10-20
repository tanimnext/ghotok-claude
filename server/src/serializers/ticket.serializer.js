import { toUserSummary } from './user.serializer.js';

const SUPPORT_NAME = 'Ghotok support';

/** A ticket as its owner sees it. Staff names are hidden behind "Ghotok support". */
export function toTicketDTO(t, { withMessages = false } = {}) {
  return {
    id: t._id.toString(),
    ticketNo: t.ticketNo,
    subject: t.subject,
    category: t.category,
    status: t.status,
    priority: t.priority,
    createdAt: t.createdAt,
    lastMessageAt: t.lastMessageAt,
    closedAt: t.closedAt ?? null,
    messageCount: t.messages?.length ?? 0,
    ...(withMessages
      ? {
          messages: (t.messages ?? []).map((m) => ({
            id: m._id.toString(),
            staff: m.staff,
            author: { name: m.staff ? SUPPORT_NAME : (m.author?.name ?? '') },
            body: m.body,
            createdAt: m.createdAt,
          })),
        }
      : {}),
  };
}

/** A ticket as staff see it, including which team member replied. */
export function toStaffTicketDTO(t, { withMessages = false } = {}) {
  const dto = toTicketDTO(t, { withMessages });
  if (withMessages) {
    dto.messages = t.messages.map((m) => ({
      id: m._id.toString(),
      staff: m.staff,
      author: { name: m.author?.name ?? 'Unknown' },
      body: m.body,
      createdAt: m.createdAt,
    }));
  }
  return { ...dto, user: toUserSummary(t.user), assignedTo: t.assignedTo?.name ?? null };
}
