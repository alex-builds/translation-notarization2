/**
 * Seed script — creates required system accounts if they don't exist.
 * Run once on the production server:
 *   node scripts/seed.js
 *   NOTARY_EMAIL=notary@yourdomain.com NOTARY_PASSWORD=SecurePass123 node scripts/seed.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/translation-notarization';

const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true },
  role: { type: String, enum: ['user', 'notary'], default: 'user' },
  createdAt: { type: Date, default: Date.now },
});
const User = mongoose.models.User || mongoose.model('User', userSchema);

const NOTARY_EMAIL = process.env.NOTARY_EMAIL || 'notary@test.com';
const NOTARY_PASSWORD = process.env.NOTARY_PASSWORD || 'notary123';

async function seed() {
  await mongoose.connect(MONGODB_URI);
  console.log('Connected to MongoDB');

  const existing = await User.findOne({ email: NOTARY_EMAIL });
  if (existing) {
    if (existing.role !== 'notary') {
      existing.role = 'notary';
      await existing.save();
      console.log(`✓ Updated ${NOTARY_EMAIL} → role: notary`);
    } else {
      console.log(`✓ Notary account ${NOTARY_EMAIL} already exists`);
    }
  } else {
    const passwordHash = await bcrypt.hash(NOTARY_PASSWORD, 10);
    await User.create({ email: NOTARY_EMAIL, passwordHash, role: 'notary' });
    console.log(`✓ Created notary account: ${NOTARY_EMAIL}`);
  }

  await mongoose.disconnect();
  console.log('Done.');
}

seed().catch((err) => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});
