const express = require('express');
const Stripe = require('stripe');
const { Queue } = require('bullmq');
const Document = require('../models/Document');
const Payment = require('../models/Payment');
const redis = require('../config/redis');
const { authMiddleware } = require('../middleware/auth');

const translationQueue = new Queue('translation-queue', { connection: redis });

const router = express.Router();
const MOCK = process.env.STRIPE_MOCK === 'true';

function getStripe() {
  return Stripe(process.env.STRIPE_SECRET_KEY);
}

// POST /api/payments/create-session
router.post('/create-session', authMiddleware, async (req, res) => {
  try {
    const { documentId, amount } = req.body;
    if (!documentId || !amount) {
      return res.status(400).json({ error: 'documentId and amount are required' });
    }

    const doc = await Document.findOne({ _id: documentId, userId: req.user.id });
    if (!doc) {
      return res.status(404).json({ error: 'Document not found' });
    }

    if (MOCK) {
      const sessionId = `mock_session_${Date.now()}`;
      await Payment.create({ documentId, stripeSessionId: sessionId, amount });
      const successUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/payment/success?session_id=${sessionId}&mock=true`;
      return res.json({ url: successUrl, sessionId });
    }

    const stripe = getStripe();
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: { name: 'Document Translation & Notarization' },
            unit_amount: Math.round(amount * 100),
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/payment/cancel`,
      metadata: { documentId: documentId.toString() },
    });

    await Payment.create({
      documentId,
      stripeSessionId: session.id,
      amount,
    });

    res.json({ url: session.url, sessionId: session.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/payments/mock-complete — только для STRIPE_MOCK=true, симулирует успешную оплату
router.post('/mock-complete', authMiddleware, async (req, res) => {
  if (!MOCK) return res.status(404).json({ error: 'Not found' });
  const { sessionId } = req.body;
  if (!sessionId) return res.status(400).json({ error: 'sessionId required' });

  const payment = await Payment.findOneAndUpdate(
    { stripeSessionId: sessionId },
    { status: 'paid' },
    { new: true }
  );
  if (!payment) return res.status(404).json({ error: 'Payment not found' });

  const doc = await Document.findByIdAndUpdate(
    payment.documentId,
    { status: 'paid' },
    { new: true }
  );
  if (doc) {
    await translationQueue.add('translate', {
      documentId: doc._id.toString(),
      originalFileUrl: doc.originalFile,
      fromLang: doc.fromLang,
      toLang: doc.toLang,
    });
  }
  res.json({ ok: true, documentStatus: doc?.status });
});

// POST /api/payments/webhook
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    const stripe = getStripe();
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return res.status(400).json({ error: `Webhook error: ${err.message}` });
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const documentId = session.metadata?.documentId;

    if (documentId) {
      await Payment.findOneAndUpdate(
        { stripeSessionId: session.id },
        { status: 'paid' }
      );
      const doc = await Document.findByIdAndUpdate(
        documentId,
        { status: 'paid' },
        { new: true }
      );
      if (doc) {
        await translationQueue.add('translate', {
          documentId: doc._id.toString(),
          originalFileUrl: doc.originalFile,
          fromLang: doc.fromLang,
          toLang: doc.toLang,
        });
      }
    }
  }

  res.json({ received: true });
});

module.exports = router;
