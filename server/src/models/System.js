import mongoose from 'mongoose';

const { Schema } = mongoose;

const notificationSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, required: true },
    data: { type: Schema.Types.Mixed, default: {} },
    link: String,
    readAt: Date,
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
notificationSchema.index({ user: 1, createdAt: -1 });
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 180 });
export const Notification = mongoose.model('Notification', notificationSchema);

const auditSchema = new Schema(
  {
    actor: { type: Schema.Types.ObjectId, ref: 'User' },
    actorRole: String,
    action: { type: String, required: true, index: true },
    targetType: String,
    targetId: String,
    summary: String,
    meta: Schema.Types.Mixed,
    ip: String,
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
auditSchema.index({ createdAt: -1 });
auditSchema.index({ targetType: 1, targetId: 1 });
export const AuditLog = mongoose.model('AuditLog', auditSchema);

const settingSchema = new Schema(
  { key: { type: String, required: true, unique: true }, value: Schema.Types.Mixed, updatedBy: { type: Schema.Types.ObjectId, ref: 'User' } },
  { timestamps: true },
);
export const Setting = mongoose.model('Setting', settingSchema);

const i18nText = { en: { type: String, default: '' }, bn: { type: String, default: '' } };

const pageSchema = new Schema(
  {
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    title: i18nText,
    body: i18nText,
    isPublished: { type: Boolean, default: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);
export const Page = mongoose.model('Page', pageSchema);

const faqSchema = new Schema(
  {
    question: i18nText,
    answer: i18nText,
    category: { type: String, default: 'general' },
    sortOrder: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);
export const Faq = mongoose.model('Faq', faqSchema);
