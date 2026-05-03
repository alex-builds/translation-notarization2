const mongoose = require('mongoose');

const documentSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, required: true },
    status: {
      type: String,
      enum: ['pending', 'translating', 'translated', 'notarizing', 'notarized', 'failed'],
      default: 'pending',
    },
    fromLang: { type: String, required: true },
    toLang: { type: String, required: true },
    originalFile: { type: String },
    translatedFile: { type: String },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Document', documentSchema);
