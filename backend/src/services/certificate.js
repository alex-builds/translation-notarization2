const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');

/**
 * Generates a notarization certificate PDF.
 * @param {Object} opts
 * @param {string} opts.documentId
 * @param {Date}   opts.notarizedAt
 * @param {string} opts.fromLang
 * @param {string} opts.toLang
 * @param {string} opts.notaryEmail
 * @param {string} opts.verifyBaseUrl  e.g. "http://localhost:3001"
 * @returns {Promise<Buffer>}
 */
async function generateCertificate({ documentId, notarizedAt, fromLang, toLang, notaryEmail, verifyBaseUrl }) {
  const verifyUrl = `${verifyBaseUrl}/api/verify/${documentId}`;
  const qrDataUrl = await QRCode.toDataURL(verifyUrl, { margin: 1, width: 120 });
  const qrBuffer = Buffer.from(qrDataUrl.replace('data:image/png;base64,', ''), 'base64');

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 60 });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const W = doc.page.width;
    const H = doc.page.height;
    const M = 40; // border margin

    // ── Outer border ──────────────────────────────────────────────
    doc
      .rect(M, M, W - M * 2, H - M * 2)
      .lineWidth(3)
      .strokeColor('#1a3a5c')
      .stroke();

    // Inner border (decorative)
    doc
      .rect(M + 8, M + 8, W - (M + 8) * 2, H - (M + 8) * 2)
      .lineWidth(1)
      .strokeColor('#4a7cb5')
      .stroke();

    // ── Header band ───────────────────────────────────────────────
    doc
      .rect(M + 8, M + 8, W - (M + 8) * 2, 72)
      .fillColor('#1a3a5c')
      .fill();

    doc
      .fontSize(22)
      .fillColor('#ffffff')
      .font('Helvetica-Bold')
      .text('NOTARIZATION CERTIFICATE', M + 8, M + 22, {
        width: W - (M + 8) * 2,
        align: 'center',
      });

    doc
      .fontSize(10)
      .fillColor('#a8c4e0')
      .font('Helvetica')
      .text('Official Document Translation & Notarization Service', M + 8, M + 52, {
        width: W - (M + 8) * 2,
        align: 'center',
      });

    // ── Body ──────────────────────────────────────────────────────
    const bodyTop = M + 8 + 72 + 30;
    const col1 = M + 50;
    const col2 = col1 + 160;

    function field(label, value, y) {
      doc
        .fontSize(9)
        .fillColor('#6b7280')
        .font('Helvetica-Bold')
        .text(label.toUpperCase(), col1, y);
      doc
        .fontSize(12)
        .fillColor('#111827')
        .font('Helvetica')
        .text(value, col2, y - 2, { width: 260 });
    }

    const dateStr = new Date(notarizedAt).toLocaleDateString('en-US', {
      year: 'numeric', month: 'long', day: 'numeric',
    });
    const timeStr = new Date(notarizedAt).toLocaleTimeString('en-US', {
      hour: '2-digit', minute: '2-digit', timeZoneName: 'short',
    });

    field('Document ID',      documentId,               bodyTop);
    field('Notarized On',     `${dateStr} at ${timeStr}`, bodyTop + 36);
    field('Translation',      `${fromLang.toUpperCase()} → ${toLang.toUpperCase()}`, bodyTop + 72);
    field('Notarized By',     notaryEmail,              bodyTop + 108);
    field('Certificate Type', 'Translation Notarization', bodyTop + 144);
    field('Verify At',        verifyUrl,                bodyTop + 180);

    // Divider
    const divY = bodyTop + 222;
    doc
      .moveTo(col1, divY)
      .lineTo(W - M - 50, divY)
      .lineWidth(0.5)
      .strokeColor('#d1d5db')
      .stroke();

    // ── QR code ───────────────────────────────────────────────────
    const qrSize = 110;
    const qrX = W - M - 50 - qrSize;
    const qrY = bodyTop;
    doc.image(qrBuffer, qrX, qrY, { width: qrSize, height: qrSize });
    doc
      .fontSize(7)
      .fillColor('#6b7280')
      .text('Scan to verify', qrX, qrY + qrSize + 4, { width: qrSize, align: 'center' });

    // ── Seal (text-based) ─────────────────────────────────────────
    const sealX = M + 70;
    const sealY = divY + 40;
    const sealR = 52;
    const cx = sealX + sealR;
    const cy = sealY + sealR;

    // Outer circle
    doc.circle(cx, cy, sealR).lineWidth(2).strokeColor('#1a3a5c').stroke();
    // Inner circle
    doc.circle(cx, cy, sealR - 8).lineWidth(0.8).strokeColor('#1a3a5c').stroke();

    doc
      .fontSize(7)
      .fillColor('#1a3a5c')
      .font('Helvetica-Bold')
      .text('✦ OFFICIAL SEAL ✦', cx - 38, cy - 18, { width: 76, align: 'center' })
      .text('NOTARIZATION', cx - 38, cy - 6, { width: 76, align: 'center' })
      .text('SERVICE', cx - 38, cy + 5, { width: 76, align: 'center' })
      .fontSize(6)
      .font('Helvetica')
      .fillColor('#4a7cb5')
      .text('CERTIFIED DOCUMENT', cx - 38, cy + 18, { width: 76, align: 'center' });

    // ── Signature line ────────────────────────────────────────────
    const sigX = W - M - 50 - 200;
    const sigY = divY + 60;
    doc
      .moveTo(sigX, sigY)
      .lineTo(sigX + 180, sigY)
      .lineWidth(0.8)
      .strokeColor('#374151')
      .stroke();
    doc
      .fontSize(9)
      .fillColor('#374151')
      .font('Helvetica-Bold')
      .text(notaryEmail, sigX, sigY + 5, { width: 180, align: 'center' });
    doc
      .fontSize(8)
      .fillColor('#6b7280')
      .font('Helvetica')
      .text('Authorized Notary', sigX, sigY + 18, { width: 180, align: 'center' });

    // ── Footer ────────────────────────────────────────────────────
    const footerY = H - M - 8 - 28;
    doc
      .rect(M + 8, footerY, W - (M + 8) * 2, 28)
      .fillColor('#f3f4f6')
      .fill();

    doc
      .fontSize(7.5)
      .fillColor('#6b7280')
      .font('Helvetica')
      .text(
        `This certificate confirms that the document (ID: ${documentId}) has been translated and notarized. ` +
        `Verify authenticity at: ${verifyUrl}`,
        M + 18, footerY + 8,
        { width: W - (M + 18) * 2, align: 'center' },
      );

    doc.end();
  });
}

module.exports = { generateCertificate };
