'use strict';

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const imageSchema = new mongoose.Schema(
  {
    data: { type: Buffer, required: true },
    content_type: { type: String, required: true },
  },
  { _id: false }
);

const userSchema = new mongoose.Schema(
  {
    full_name: { type: String, required: [true, 'Full name is required'], trim: true },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Invalid email format'],
    },
    phone: { type: String, trim: true, default: null },
    password_hash: { type: String, required: [true, 'Password is required'], select: false },
    auth_provider: {
      type: String,
      enum: {
        values: ['local', 'google'],
        message: '{VALUE} is not a valid auth provider',
      },
      default: 'local',
    },
    google_sub: { type: String, default: null },
    password_reset_code_hash: { type: String, default: null, select: false },
    password_reset_expires_at: { type: Date, default: null },
    role: {
      type: String,
      required: true,
      enum: {
        values: ['farmer', 'expert', 'company', 'delivery'],
        message: '{VALUE} is not a valid role',
      },
    },
    avatar: { type: imageSchema, default: null },
    is_active: { type: Boolean, default: true },
    last_login_at: { type: Date, default: null },
    deleted_at: { type: Date, default: null },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

// ─── Indexes ──────────────────────────────────────────────────────────────────
userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ role: 1 });
userSchema.index({ google_sub: 1 }, { unique: true, sparse: true });

// ─── Hooks ────────────────────────────────────────────────────────────────────
// Hash password before saving
userSchema.pre('save', async function (next) {
  if (!this.isModified('password_hash')) return next();
  this.password_hash = await bcrypt.hash(this.password_hash, 12);
  next();
});

// ─── Instance Methods ─────────────────────────────────────────────────────────
userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password_hash);
};

// Soft-delete guard — exclude soft-deleted users from all queries by default
userSchema.pre(/^find/, function (next) {
  this.where({ deleted_at: null });
  next();
});

const User = mongoose.model('User', userSchema);
module.exports = User;
