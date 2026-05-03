const express = require('express');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const { minioClient, BUCKET } = require('../config/minio');
const Document = require('../models/Document');
const User = require('../models/User');
const { authMiddleware } = require('../middleware/auth');
const { generateCertificate } = require('../services/certificate');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

const ALLOWED_EXTENSIONS = new Set(['.pdf', '.docx', '.txt', '.odt']);
const ALLOWED_MIMETYPES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'application/vnd.oasis.opendocument.text',
]);

router.use(authMiddleware);

// POST /api/documents/upload
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'File is required' });
    }
    const { fromLang, toLang } = req.body;
    if (!fromLang || !toLang) {
      return res.status(400).json({ error: 'fromLang and toLang are required' });
    }

    const ext = path.extname(req.file.originalname).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext) && !ALLOWED_MIMETYPES.has(req.file.mimetype)) {
      return res.status(400).json({ error: 'Invalid file type. Allowed: PDF, DOCX, TXT, ODT' });
    }

    const objectName = `originals/${uuidv4()}${ext}`;

    await minioClient.putObject(BUCKET, objectName, req.file.buffer, req.file.size, {
      'Content-Type': req.file.mimetype,
    });

    const doc = await Document.create({
      userId: req.user.id,
      originalFile: objectName,
      originalFileName: req.file.originalname,
      fromLang,
      toLang,
    });

    res.status(201).json(doc);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/documents
router.get('/', async (req, res) => {
  try {
    const docs = await Document.find({ userId: req.user.id }).sort({ createdAt: -1 });
    res.json(docs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/documents/:id/status
router.get('/:id/status', async (req, res) => {
  try {
    const doc = await Document.findOne({ _id: req.params.id, userId: req.user.id }, 'status updatedAt');
    if (!doc) {
      return res.status(404).json({ error: 'Document not found' });
    }
    res.json({ status: doc.status, updatedAt: doc.updatedAt });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/documents/:id/download?type=original|translated
router.get('/:id/download', async (req, res) => {
  try {
    const doc = await Document.findOne({ _id: req.params.id, userId: req.user.id });
    if (!doc) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const type = req.query.type === 'original' ? 'original' : 'translated';

    if (type === 'original') {
      if (!doc.originalFile) {
        return res.status(400).json({ error: 'Original file not found' });
      }
      const filename = doc.originalFileName || doc.originalFile.split('/').pop();
      const stat = await minioClient.statObject(BUCKET, doc.originalFile);
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Type', stat.metaData?.['content-type'] || 'application/octet-stream');
      res.setHeader('Content-Length', stat.size);
      const stream = await minioClient.getObject(BUCKET, doc.originalFile);
      return stream.pipe(res);
    }

    if (!doc.translatedFile) {
      return res.status(400).json({ error: 'Translated file not ready' });
    }
    const filename = doc.translatedFile.split('/').pop();
    const stat = await minioClient.statObject(BUCKET, doc.translatedFile);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', stat.metaData?.['content-type'] || 'application/octet-stream');
    res.setHeader('Content-Length', stat.size);
    const stream = await minioClient.getObject(BUCKET, doc.translatedFile);
    stream.pipe(res);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/documents/:id/content — returns text content of original and translated files
router.get('/:id/content', async (req, res) => {
  try {
    const doc = await Document.findOne({ _id: req.params.id, userId: req.user.id });
    if (!doc) return res.status(404).json({ error: 'Document not found' });

    async function readText(objectName) {
      if (!objectName) return null;
      try {
        const stream = await minioClient.getObject(BUCKET, objectName);
        return await new Promise((resolve, reject) => {
          const chunks = [];
          stream.on('data', (c) => chunks.push(c));
          stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8').slice(0, 20000)));
          stream.on('error', reject);
        });
      } catch { return null; }
    }

    const [original, translated] = await Promise.all([
      readText(doc.originalFile),
      readText(doc.translatedFile),
    ]);

    res.json({ original, translated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/documents/:id/certificate
router.get('/:id/certificate', async (req, res) => {
  try {
    const doc = await Document.findOne({ _id: req.params.id, userId: req.user.id })
      .populate('userId', 'email');
    if (!doc) {
      return res.status(404).json({ error: 'Document not found' });
    }
    if (!['notarized', 'done'].includes(doc.status)) {
      return res.status(400).json({ error: 'Certificate is only available for notarized documents' });
    }

    // Find any notary to attribute the certificate
    const notary = await User.findOne({ role: 'notary' }, 'email');
    const notaryEmail = notary?.email || 'notary@service.local';

    const verifyBaseUrl = process.env.NEXT_PUBLIC_API_URL || process.env.BACKEND_URL || 'http://localhost:3001';

    const pdfBuffer = await generateCertificate({
      documentId: doc._id.toString(),
      notarizedAt: doc.updatedAt,
      fromLang: doc.fromLang,
      toLang: doc.toLang,
      notaryEmail,
      verifyBaseUrl,
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="certificate-${doc._id}.pdf"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    res.send(pdfBuffer);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/documents/:id
router.delete('/:id', async (req, res) => {
  try {
    const doc = await Document.findOne({ _id: req.params.id, userId: req.user.id });
    if (!doc) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const removeFromMinio = async (objectName) => {
      if (!objectName) return;
      try { await minioClient.removeObject(BUCKET, objectName); } catch {}
    };

    await Promise.all([
      removeFromMinio(doc.originalFile),
      removeFromMinio(doc.translatedFile),
    ]);

    await doc.deleteOne();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/documents/:id
router.get('/:id', async (req, res) => {
  try {
    const doc = await Document.findOne({ _id: req.params.id, userId: req.user.id });
    if (!doc) {
      return res.status(404).json({ error: 'Document not found' });
    }
    res.json(doc);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
