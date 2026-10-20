import mongoose from 'mongoose';

const { Schema } = mongoose;

const ref = (model) => ({ type: Schema.Types.ObjectId, ref: model, required: true });

// Favorites ("shortlist") and dislikes ("not interested") are per user and per biodata.
const listSchema = () => {
  const s = new Schema({ user: ref('User'), biodata: ref('Biodata') }, { timestamps: true });
  s.index({ user: 1, biodata: 1 }, { unique: true });
  s.index({ biodata: 1, createdAt: -1 });
  return s;
};

export const Favorite = mongoose.model('Favorite', listSchema());
export const Dislike = mongoose.model('Dislike', listSchema());

// One row per viewer per biodata per day; counts give "visits today / 7 days / 30 days".
const visitSchema = new Schema(
  { biodata: ref('Biodata'), viewerKey: { type: String, required: true }, day: { type: String, required: true } },
  { timestamps: { createdAt: true, updatedAt: false } },
);
visitSchema.index({ biodata: 1, viewerKey: 1, day: 1 }, { unique: true });
visitSchema.index({ biodata: 1, createdAt: -1 });
visitSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 400 });
export const ProfileVisit = mongoose.model('ProfileVisit', visitSchema);

// A contact unlock is permanent: once paid for, the user keeps access.
const unlockSchema = new Schema(
  { user: ref('User'), biodata: ref('Biodata'), transaction: { type: Schema.Types.ObjectId, ref: 'ConnectionTransaction' } },
  { timestamps: true },
);
unlockSchema.index({ user: 1, biodata: 1 }, { unique: true });
unlockSchema.index({ biodata: 1 });
export const ContactUnlock = mongoose.model('ContactUnlock', unlockSchema);

const proposalSchema = new Schema(
  {
    from: ref('User'),
    fromBiodata: { type: Schema.Types.ObjectId, ref: 'Biodata' },
    to: ref('User'),
    toBiodata: ref('Biodata'),
    message: { type: String, maxlength: 1000 },
    status: { type: String, enum: ['pending', 'accepted', 'declined', 'withdrawn'], default: 'pending', index: true },
    respondedAt: Date,
    responseNote: { type: String, maxlength: 500 },
  },
  { timestamps: true },
);
proposalSchema.index({ from: 1, createdAt: -1 });
proposalSchema.index({ to: 1, createdAt: -1 });
proposalSchema.index({ from: 1, toBiodata: 1, status: 1 });
export const Proposal = mongoose.model('Proposal', proposalSchema);
