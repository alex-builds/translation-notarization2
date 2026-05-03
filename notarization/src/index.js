require('dotenv').config();

const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const { Redis } = require('ioredis');
const { createWorker } = require('./worker');
const notaryRoutes = require('./routes/notary');

const PORT = process.env.PORT || 3002;

async function start() {
  // MongoDB
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('[mongo] Connected to MongoDB');

  // Redis (shared connection for BullMQ)
  const redisConnection = new Redis(process.env.REDIS_URL, {
    maxRetriesPerRequest: null,
  });
  console.log('[redis] Redis connection created');

  // BullMQ worker
  createWorker(redisConnection);
  console.log('[bullmq] Worker listening on notarization-queue');

  // HTTP server (health check)
  const app = express();
  app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:3000' }));
  app.use(express.json());

  app.use('/api/notary', notaryRoutes);

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'notarization', uptime: process.uptime() });
  });

  app.listen(PORT, () => {
    console.log(`[http] Notarization service running on port ${PORT}`);
  });
}

start().catch((err) => {
  console.error('[startup] Fatal error:', err);
  process.exit(1);
});
