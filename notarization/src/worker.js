const { Worker } = require('bullmq');
const Document = require('./models/Document');
const { sendNotaryEmail } = require('./mailer');

function createWorker(redisConnection) {
  const worker = new Worker(
    'notarization-queue',
    async (job) => {
      const { documentId } = job.data;

      if (!documentId) {
        throw new Error('Job is missing documentId');
      }

      console.log(`[worker] Processing job ${job.id} for document ${documentId}`);

      const doc = await Document.findByIdAndUpdate(
        documentId,
        { status: 'notarizing' },
        { new: true }
      );

      if (!doc) {
        throw new Error(`Document not found: ${documentId}`);
      }

      console.log(`[worker] Document ${documentId} status set to notarizing`);

      const info = await sendNotaryEmail(doc);
      console.log(`[worker] Notary email sent: ${info.id}`);
    },
    {
      connection: redisConnection,
      concurrency: 5,
    }
  );

  worker.on('completed', (job) => {
    console.log(`[worker] Job ${job.id} completed`);
  });

  worker.on('failed', (job, err) => {
    console.error(`[worker] Job ${job?.id} failed:`, err.message);
  });

  return worker;
}

module.exports = { createWorker };
