const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3.2';
const MOCK = process.env.TRANSLATION_MOCK === 'true';

const LANG_NAMES = {
  en: 'English', ru: 'Russian', de: 'German', fr: 'French',
  es: 'Spanish', zh: 'Chinese', ar: 'Arabic', pt: 'Portuguese',
  it: 'Italian', ja: 'Japanese',
};

async function translateText(text, fromLang, toLang) {
  if (MOCK) {
    console.log(`[Ollama] MOCK mode — simulating ${fromLang}→${toLang} translation`);
    const from = LANG_NAMES[fromLang] || fromLang;
    const to = LANG_NAMES[toLang] || toLang;
    return `[Mock Translation ${from}→${to}]\n\n${text}`;
  }

  const prompt = `Translate the following text from ${LANG_NAMES[fromLang] || fromLang} to ${LANG_NAMES[toLang] || toLang}. Return only the translated text without any explanation or commentary.\n\n${text}`;

  const response = await fetch(`${OLLAMA_URL}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      prompt,
      stream: false,
    }),
  });

  if (!response.ok) {
    throw new Error(`Ollama error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  return data.response;
}

module.exports = { translateText };
