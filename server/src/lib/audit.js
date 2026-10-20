import { AuditLog, Notification } from '../models/index.js';
import { logger } from './logger.js';

/** Records a staff or system action. Never throws. */
export async function audit(req, action, { targetType, targetId, summary, meta } = {}) {
  try {
    await AuditLog.create({
      actor: req?.user?._id,
      actorRole: req?.user?.role,
      action,
      targetType,
      targetId: targetId ? String(targetId) : undefined,
      summary,
      meta,
      ip: req?.ip,
    });
  } catch (err) {
    logger.error({ err, action }, 'Audit log write failed');
  }
}

/** Creates an in-app notification. Text is rendered by the client from `type` and `data`. Never throws. */
export async function notify(userId, type, data = {}, link) {
  if (!userId) return;
  try {
    await Notification.create({ user: userId, type, data, link });
  } catch (err) {
    logger.error({ err, type }, 'Notification write failed');
  }
}
