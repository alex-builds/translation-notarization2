require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const connectDB = require('./config/db');

const { Queue } = require('bullmq');
const redis = require('./config/redis');

const authRoutes = require('./routes/auth');
const documentRoutes = require('./routes/documents');
const paymentRoutes = require('./routes/payments');
const notaryRoutes = require('./routes/notary');
const Document = require('./models/Document');
const User = require('./models/User');

const translationQueue = new Queue('translation-queue', { connection: redis });

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(morgan('dev'));

// Raw body needed for Stripe webhook signature verification
app.use('/api/payments/webhook', express.raw({ type: 'application/json' }));
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/notary', notaryRoutes);

app.get('/health', (req, res) => res.json({ status: 'ok' }));

// GET /api/queue/stats — public
app.get('/api/queue/stats', async (req, res) => {
  try {
    const [waiting, active, completedCount, recentJobs] = await Promise.all([
      translationQueue.getWaitingCount(),
      translationQueue.getActiveCount(),
      translationQueue.getCompletedCount(),
      translationQueue.getJobs(['completed'], 0, 9),
    ]);

    let avgProcessingMs = null;
    const times = recentJobs
      .filter((j) => j.finishedOn && j.processedOn)
      .map((j) => j.finishedOn - j.processedOn);
    if (times.length > 0) {
      avgProcessingMs = Math.round(times.reduce((a, b) => a + b, 0) / times.length);
    }

    res.json({
      queue: 'translation-queue',
      waiting,
      active,
      inQueue: waiting + active,
      completedCount,
      avgProcessingMs,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/requeue/:documentId — re-add paid document to translation queue
// Protected by ADMIN_SECRET env var. Used for E2E testing / manual recovery.
app.post('/api/admin/requeue/:documentId', async (req, res) => {
  const secret = process.env.ADMIN_SECRET;
  if (!secret || req.headers['x-admin-secret'] !== secret) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  try {
    const doc = await Document.findById(req.params.documentId);
    if (!doc) return res.status(404).json({ error: 'Document not found' });
    if (doc.status !== 'paid') {
      return res.status(400).json({ error: `Document status is "${doc.status}", expected "paid"` });
    }
    await translationQueue.add('translate', {
      documentId: doc._id.toString(),
      originalFileUrl: doc.originalFile,
      fromLang: doc.fromLang,
      toLang: doc.toLang,
    });
    res.json({ ok: true, message: 'Job re-queued', documentId: doc._id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/verify/:documentId — public endpoint for QR code verification
app.get('/api/verify/:documentId', async (req, res) => {
  try {
    const doc = await Document.findById(req.params.documentId).populate('userId', 'email');
    if (!doc) {
      return res.status(404).json({ error: 'Document not found' });
    }
    if (!['notarized', 'done'].includes(doc.status)) {
      return res.status(400).json({ error: 'Document has not been notarized yet' });
    }

    const notary = await User.findOne({ role: 'notary' }, 'email');

    res.json({
      documentId: doc._id.toString(),
      status: doc.status,
      fromLang: doc.fromLang,
      toLang: doc.toLang,
      notarizedAt: doc.updatedAt,
      notaryEmail: notary?.email || null,
      ownerEmail: doc.userId?.email || null,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
});
