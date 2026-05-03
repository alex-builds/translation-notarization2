const { Worker, Queue } = require('bullmq');
const { Readable } = require('stream');
const connection = require('./config/redis');
const minioClient = require('./config/minio');
const { translateText } = require('./config/ollama');
const Document = require('./models/Document');

const notarizationQueue = new Queue('notarization-queue', { connection });

const BUCKET = 'documents';

async function streamToBuffer(stream) {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function processJob(job) {
  const { documentId, originalFileUrl, fromLang, toLang } = job.data;
  console.log(`[Worker] Processing job ${job.id} for document ${documentId}`);

  // Update status to translating
  await Document.findByIdAndUpdate(documentId, { status: 'translating' });

  // Extract MinIO object key from URL
  // originalFileUrl format: "documents/originals/filename.txt" or full URL
  let objectKey = originalFileUrl;
  if (originalFileUrl.startsWith('http')) {
    const url = new URL(originalFileUrl);
    objectKey = url.pathname.replace(`/${BUCKET}/`, '');
  }

  // Download original file from MinIO
  const stream = await minioClient.getObject(BUCKET, objectKey);
  const fileBuffer = await streamToBuffer(stream);
  const originalText = fileBuffer.toString('utf-8');

  // Translate via Ollama
  console.log(`[Worker] Translating document ${documentId} from ${fromLang} to ${toLang}`);
  const translatedText = await translateText(originalText, fromLang, toLang);

  // Save translated file to MinIO
  const originalFilename = objectKey.split('/').pop();
  const translatedKey = `translated/${documentId}_${originalFilename}`;
  const translatedBuffer = Buffer.from(translatedText, 'utf-8');

  await minioClient.putObject(BUCKET, translatedKey, translatedBuffer, translatedBuffer.length, {
    'Content-Type': 'text/plain; charset=utf-8',
  });

  // Update document with translated file URL and status
  await Document.findByIdAndUpdate(documentId, {
    status: 'translated',
    translatedFile: translatedKey,
  });

  console.log(`[Worker] Document ${documentId} translated successfully -> ${translatedKey}`);

  // Queue for notarization
  await notarizationQueue.add('notarize', { documentId });
  console.log(`[Worker] Document ${documentId} added to notarization-queue`);
}

function createWorker() {
  const worker = new Worker('translation-queue', processJob, {
    connection,
    concurrency: 2,
  });

  worker.on('completed', (job) => {
    console.log(`[Worker] Job ${job.id} completed`);
  });

  worker.on('failed', async (job, err) => {
    console.error(`[Worker] Job ${job.id} failed:`, err.message);
    if (job.data.documentId) {
      try {
        await Document.findByIdAndUpdate(job.data.documentId, { status: 'paid' });
        console.log(`[Worker] Document ${job.data.documentId} status reverted to paid`);
      } catch (dbErr) {
        console.error('[Worker] Failed to revert document status:', dbErr.message);
      }
    }
  });

  console.log('[Worker] Translation worker started, listening on translation-queue');
  return worker;
}

module.exports = createWorker;
