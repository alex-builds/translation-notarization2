const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);

async function sendNotaryEmail(document) {
  const { data, error } = await resend.emails.send({
    from: 'Translation Service <onboarding@resend.dev>',
    to: process.env.NOTARY_EMAIL,
    subject: 'New document ready for notarization',
    text: [
      'A new document requires notarization.',
      '',
      `Document ID: ${document._id}`,
      `From:        ${document.fromLang}`,
      `To:          ${document.toLang}`,
      '',
      `Notary cabinet: http://localhost:3000/notary`,
    ].join('\n'),
  });

  if (error) {
    throw new Error(`Resend error: ${error.message}`);
  }

  return data;
}

module.exports = { sendNotaryEmail };
