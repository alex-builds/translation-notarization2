const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { minioClient, BUCKET } = require('../config/minio');
const Document = require('../models/Document');
const { authMiddleware, requireRole } = require('../middleware/auth');

const router = express.Router();

router.use(authMiddleware);
router.use(requireRole('notary'));

// GET /api/notary/documents — list documents awaiting notarization
router.get('/documents', async (req, res) => {
  try {
    const docs = await Document.find({
      status: { $in: ['translated', 'notarizing', 'notarized'] },
    })
      .populate('userId', 'email')
      .sort({ createdAt: -1 });

    res.json(docs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/notary/sign/:id — mark document as notarized and attach signed file URL
router.post('/sign/:id', async (req, res) => {
  try {
    const doc = await Document.findById(req.params.id);
    if (!doc) {
      return res.status(404).json({ error: 'Document not found' });
    }
    if (!['translated', 'notarizing'].includes(doc.status)) {
      return res.status(400).json({ error: 'Document is not ready for notarization' });
    }

    // Generate a presigned notarized file placeholder or accept signedFileUrl from body
    const { signedFileUrl } = req.body;
    const notarizedFile = signedFileUrl || `notarized/${uuidv4()}.pdf`;

    doc.translatedFile = notarizedFile;
    doc.status = 'notarized';
    await doc.save();

    res.json(doc);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
