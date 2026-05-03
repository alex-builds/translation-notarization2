const { Queue } = require('bullmq');
const connection = require('./config/redis');

const translationQueue = new Queue('translation-queue', { connection });

module.exports = translationQueue;
