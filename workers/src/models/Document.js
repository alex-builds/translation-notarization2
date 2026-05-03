const mongoose = require('mongoose');

const documentSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  originalFile: { type: String, required: true },
  translatedFile: { type: String, default: null },
  status: {
    type: String,
    enum: ['uploaded', 'paid', 'translating', 'translated', 'notarizing', 'notarized', 'done'],
    default: 'uploaded',
  },
  fromLang: { type: String, required: true },
  toLang: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Document', documentSchema);
