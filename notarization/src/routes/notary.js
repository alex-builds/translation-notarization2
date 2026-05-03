const express = require('express');
const Document = require('../models/Document');
const { authMiddleware, requireRole } = require('../middleware/auth');

const router = express.Router();

router.use(authMiddleware);
router.use(requireRole('notary'));

// GET /api/notary/documents — list documents awaiting notarization
router.get('/documents', async (req, res) => {
  try {
    const docs = await Document.find({ status: { $in: ['notarizing', 'notarized'] } })
      .populate('userId', 'email')
      .sort({ createdAt: -1 });
    res.json(docs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/notary/sign/:documentId — sign document
router.post('/sign/:documentId', async (req, res) => {
  try {
    const doc = await Document.findById(req.params.documentId);
    if (!doc) {
      return res.status(404).json({ error: 'Document not found' });
    }
    if (doc.status !== 'notarizing') {
      return res.status(400).json({ error: `Cannot sign document with status "${doc.status}"` });
    }

    doc.status = 'notarized';
    await doc.save();

    res.json({ success: true, document: doc });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
