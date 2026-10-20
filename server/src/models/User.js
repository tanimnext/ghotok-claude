import mongoose from 'mongoose';
import { optionValues, ROLE_OPTIONS, USER_STATUS_OPTIONS } from '@ghotok/shared';

const { Schema } = mongoose;

const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    email: { type: String, trim: true, lowercase: true, maxlength: 120 },
    phone: { type: String, trim: true, maxlength: 20 },
    passwordHash: { type: String, select: false },
    role: { type: String, enum: optionValues(ROLE_OPTIONS), default: 'user', index: true },
    status: { type: String, enum: optionValues(USER_STATUS_OPTIONS), default: 'active', index: true },
    statusReason: { type: String, maxlength: 500 },
    emailVerified: { type: Boolean, default: false },
    phoneVerified: { type: Boolean, default: false },
    connectionBalance: { type: Number, default: 0, min: 0 },
    connectionsPurchased: { type: Number, default: 0 },
    connectionsUsed: { type: Number, default: 0 },
    language: { type: String, enum: ['en', 'bn'], default: 'en' },
    lastLoginAt: Date,
    deactivatedAt: Date,
  },
  { timestamps: true },
);

userSchema.index({ email: 1 }, { unique: true, partialFilterExpression: { email: { $type: 'string' } } });
userSchema.index({ phone: 1 }, { unique: true, partialFilterExpression: { phone: { $type: 'string' } } });
userSchema.index({ createdAt: -1 });

userSchema.virtual('isVerified').get(function isVerified() {
  return !!(this.emailVerified || this.phoneVerified);
});

/** Fields safe to send to the account owner or to staff. */
userSchema.methods.toSafeJSON = function toSafeJSON() {
  return {
    id: this._id.toString(),
    name: this.name,
    email: this.email ?? null,
    phone: this.phone ?? null,
    role: this.role,
    status: this.status,
    emailVerified: this.emailVerified,
    phoneVerified: this.phoneVerified,
    isVerified: this.isVerified,
    connectionBalance: this.connectionBalance,
    connectionsPurchased: this.connectionsPurchased,
    connectionsUsed: this.connectionsUsed,
    language: this.language,
    lastLoginAt: this.lastLoginAt ?? null,
    createdAt: this.createdAt,
  };
};

export const User = mongoose.model('User', userSchema);
