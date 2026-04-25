'use strict';

const mongoose = require('mongoose');

const imageSchema = new mongoose.Schema(
  {
    data: { type: Buffer, required: true },
    content_type: { type: String, required: true },
  },
  { _id: false }
);

const messageSchema = new mongoose.Schema(
  {
    chat_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Chat',
      required: true,
    },
    sender_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    sender_role: {
      type: String,
      required: true,
      enum: ['farmer', 'expert', 'system'],
    },
    content_type: {
      type: String,
      required: true,
      enum: ['text', 'image', 'ai_analysis'],
      default: 'text',
    },
    text: { type: String, trim: true, default: null },
    image: { type: imageSchema, default: null },
    // Snapshot of AI diagnosis result shown inline in chat
    ai_analysis: { type: mongoose.Schema.Types.Mixed, default: null },
    is_read: { type: Boolean, default: false },
    sent_at: { type: Date, default: Date.now },
    deleted_at: { type: Date, default: null },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

messageSchema.index({ chat_id: 1, sent_at: 1 });

messageSchema.pre(/^find/, function (next) {
  this.where({ deleted_at: null });
  next();
});

const Message = mongoose.model('Message', messageSchema);
module.exports = Message;
