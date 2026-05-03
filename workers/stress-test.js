require('dotenv').config();

const { Queue, QueueEvents } = require('bullmq');
const IORedis = require('ioredis');
const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
const Document = require('./src/models/Document');

const TOTAL_JOBS = 10;

const TEXTS = [
  { text: 'The quick brown fox jumps over the lazy dog.', from: 'English', to: 'Russian' },
  { text: 'La vie est belle et pleine de surprises.', from: 'French', to: 'English' },
  { text: 'El sol brilla con fuerza en el cielo azul.', from: 'Spanish', to: 'English' },
  { text: 'Die Natur ist wunderschön im Frühling.', from: 'German', to: 'English' },
  { text: 'Ogni giorno è una nuova opportunità per imparare.', from: 'Italian', to: 'English' },
  { text: 'О времена! О нравы! Всё меняется.', from: 'Russian', to: 'English' },
  { text: 'Technology is transforming the modern world rapidly.', from: 'English', to: 'Russian' },
  { text: 'Le temps passe vite quand on est occupé.', from: 'French', to: 'Russian' },
  { text: 'Knowledge is power and education is the key.', from: 'English', to: 'Russian' },
  { text: 'Жизнь прекрасна и удивительна во всех проявлениях.', from: 'Russian', to: 'English' },
];

async function main() {
  const redis = new IORedis(process.env.REDIS_URL, { maxRetriesPerRequest: null });
  await mongoose.connect(process.env.MONGODB_URI);

  const queue = new Queue('translation-queue', { connection: redis });
  const events = new QueueEvents('translation-queue', { connection: new IORedis(process.env.REDIS_URL, { maxRetriesPerRequest: null }) });

  // Create stub documents in MongoDB
  const userId = new mongoose.Types.ObjectId();
  const docs = await Promise.all(
    TEXTS.map(({ from, to }) =>
      Document.create({
        userId,
        originalFile: `originals/stress-${uuidv4()}.txt`,
        fromLang: from,
        toLang: to,
        status: 'paid',
      })
    )
  );

  // Upload stub text files to MinIO so the worker can download them
  const minioClient = require('./src/config/minio');
  await Promise.all(
    docs.map((doc, i) => {
      const buf = Buffer.from(TEXTS[i].text, 'utf-8');
      return minioClient.putObject('documents', doc.originalFile, buf, buf.length, { 'Content-Type': 'text/plain; charset=utf-8' });
    })
  );

  const startTimes = {};
  const results = [];
  const totalStart = Date.now();

  console.log(`\n[Stress Test] Adding ${TOTAL_JOBS} jobs to translation-queue...\n`);

  // Track per-job timing via QueueEvents
  events.on('active', ({ jobId }) => {
    startTimes[jobId] = Date.now();
    const docIndex = jobs.findIndex(j => j.id === jobId);
    const label = docIndex >= 0 ? `job ${jobId} (${TEXTS[docIndex].from}→${TEXTS[docIndex].to})` : `job ${jobId}`;
    console.log(`  [${ts()}] STARTED  ${label}`);
  });

  events.on('completed', ({ jobId }) => {
    const elapsed = startTimes[jobId] ? ((Date.now() - startTimes[jobId]) / 1000).toFixed(1) : '?';
    const docIndex = jobs.findIndex(j => j.id === jobId);
    const label = docIndex >= 0 ? `job ${jobId} (${TEXTS[docIndex].from}→${TEXTS[docIndex].to})` : `job ${jobId}`;
    console.log(`  [${ts()}] DONE     ${label} — ${elapsed}s`);
    results.push({ jobId, elapsed: parseFloat(elapsed), status: 'completed' });
    checkFinished();
  });

  events.on('failed', ({ jobId, failedReason }) => {
    const elapsed = startTimes[jobId] ? ((Date.now() - startTimes[jobId]) / 1000).toFixed(1) : '?';
    const docIndex = jobs.findIndex(j => j.id === jobId);
    const label = docIndex >= 0 ? `job ${jobId} (${TEXTS[docIndex].from}→${TEXTS[docIndex].to})` : `job ${jobId}`;
    console.log(`  [${ts()}] FAILED   ${label} — ${elapsed}s — ${failedReason}`);
    results.push({ jobId, elapsed: parseFloat(elapsed), status: 'failed' });
    checkFinished();
  });

  // Add all 10 jobs simultaneously
  const jobs = await Promise.all(
    docs.map((doc, i) =>
      queue.add('translate', {
        documentId: doc._id.toString(),
        originalFileUrl: doc.originalFile,
        fromLang: TEXTS[i].from,
        toLang: TEXTS[i].to,
      })
    )
  );

  console.log(`[Stress Test] All ${TOTAL_JOBS} jobs enqueued at ${ts()}\n`);

  function ts() {
    return new Date().toISOString().slice(11, 23);
  }

  function checkFinished() {
    if (results.length < TOTAL_JOBS) return;

    const totalElapsed = ((Date.now() - totalStart) / 1000).toFixed(1);
    const completed = results.filter(r => r.status === 'completed').length;
    const failed = results.filter(r => r.status === 'failed').length;
    const times = results.filter(r => r.status === 'completed').map(r => r.elapsed);
    const avg = times.length ? (times.reduce((a, b) => a + b, 0) / times.length).toFixed(1) : '-';
    const min = times.length ? Math.min(...times).toFixed(1) : '-';
    const max = times.length ? Math.max(...times).toFixed(1) : '-';

    console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 Stress Test Results
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 Total jobs    : ${TOTAL_JOBS}
 Completed     : ${completed}
 Failed        : ${failed}
 Total time    : ${totalElapsed}s
 Per-job avg   : ${avg}s
 Fastest job   : ${min}s
 Slowest job   : ${max}s
 Concurrency   : 2 (worker setting)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`);

    events.close();
    queue.close();
    redis.quit();
    mongoose.disconnect();
  }
}

main().catch((err) => {
  console.error('[Fatal]', err);
  process.exit(1);
});
