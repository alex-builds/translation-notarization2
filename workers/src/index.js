require('dotenv').config();

const connectDB = require('./config/db');
const createWorker = require('./worker');

async function main() {
  await connectDB();
  createWorker();
}

main().catch((err) => {
  console.error('[Fatal]', err);
  process.exit(1);
});
