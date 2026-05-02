'use strict';

const mongoose = require('mongoose');

const chatSchema = new mongoose.Schema(
  {
    treatment_request_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TreatmentRequest',
      required: true,
      unique: true, // one chat per treatment request
    },
    farmer_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Farmer',
      required: true,
    },
    expert_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Expert',
      required: true,
    },
    last_message_at: { type: Date, default: null },
    is_resolved: { type: Boolean, default: false },
    deleted_for_farmer: { type: Boolean, default: false },
    deleted_for_expert: { type: Boolean, default: false },
    deleted_for_farmer_at: { type: Date, default: null },
    deleted_for_expert_at: { type: Date, default: null },
    deleted_at: { type: Date, default: null },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

chatSchema.index({ treatment_request_id: 1 }, { unique: true });
chatSchema.index({ farmer_id: 1, last_message_at: -1 });
chatSchema.index({ expert_id: 1, last_message_at: -1 });

chatSchema.pre(/^find/, function (next) {
  this.where({ deleted_at: null });
  next();
});

const Chat = mongoose.model('Chat', chatSchema);
module.exports = Chat;
