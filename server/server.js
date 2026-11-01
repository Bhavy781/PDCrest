// PDCrest API: Super (Gemini) + Voice (ElevenLabs). Keys come from environment variables only.
const fs = require('fs');
const path = require('path');
const http = require('http');

const PUBLIC_DIR = path.join(__dirname, '..');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain',
  '.xml': 'application/xml'
};

const GEMINI_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-1.5-flash-latest';
const EL_KEY = process.env.ELEVENLABS_API_KEY;
const EL_VOICE = process.env.ELEVENLABS_VOICE_ID || '21m00Tcm4T1vDq8ikWAM';
const EL_MODEL = process.env.ELEVENLABS_MODEL || 'eleven_flash_v2_5';
const PORT = process.env.PORT || 3000;

const ORIGINS = (process.env.ALLOWED_ORIGIN || '').split(',').map(s => s.trim()).filter(Boolean);

const SYSTEM = 'You are Super, the friendly AI mentor in PDCrest, an app for personality development and self-growth.\n' +
  'Reply in 2-4 short, warm, practical sentences with one concrete step. You are not a doctor and do not diagnose.\n' +
  'If the user mentions self-harm or hurting someone, urge them to contact Tele-MANAS (14416, free, 24/7, India) or emergency services.';

// Simple per-IP limit so strangers cannot run up your bill: 20 requests per minute.
const hits = new Map();
const limited = ip => {
  const now = Date.now(), list = (hits.get(ip) || []).filter(t => now - t < 60000);
  list.push(now); hits.set(ip, list); return list.length > 20;
};
setInterval(() => { const n = Date.now(); for (const [k, v] of hits) if (!v.some(t => n - t < 60000)) hits.delete(k); }, 120000);

const json = (res, code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
const readBody = req => new Promise((ok, no) => {
  let d = ''; req.on('data', c => d += c);
  req.on('end', () => { try { ok(JSON.parse(d || '{}')); } catch (e) { no(e); } });
});

http.createServer(async (req, res) => {
  const origin = req.headers.origin;
  if (origin && ORIGINS.includes(origin)) { res.setHeader('Access-Control-Allow-Origin', origin); }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

  if (req.method === 'GET') {
    if (req.url === '/api/health') return json(res, 200, { ok: true, service: 'pdcrest-api' });
    const reqPath = req.url === '/' ? '/index.html' : req.url;
    const safePath = path.normalize(reqPath).replace(/^(\.\.[\/\\])+/, '');
    const filePath = path.join(PUBLIC_DIR, safePath);
    const ext = path.extname(filePath).toLowerCase();
    if (MIME_TYPES[ext]) {
      return fs.readFile(filePath, (err, data) => {
        if (err) return json(res, 404, { error: 'Not found' });
        res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] });
        res.end(data);
      });
    }
    return json(res, 404, { error: 'Not found' });
  }

  if (req.method !== 'POST') return json(res, 404, { error: 'Not found' });

  const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
  if (limited(ip)) return json(res, 429, { error: 'Too many requests. Please wait a minute.' });

  try {
    const b = await readBody(req);

    if (req.url === '/api/mentor') {
      if (!GEMINI_KEY) return json(res, 503, { error: 'Mentor is not configured' });
      let msgs = (Array.isArray(b.messages) ? b.messages : []).slice(-6)
        .filter(m => m && typeof m.text === 'string' && m.text.trim())
        .map(m => ({ role: m.role === 'user' ? 'user' : 'model', parts: [{ text: m.text.slice(0, 1000) }] }));
      while (msgs.length && msgs[0].role !== 'user') msgs.shift();
      if (!msgs.length || msgs[msgs.length - 1].role !== 'user') return json(res, 400, { error: 'Send user message' });

      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_KEY },
        body: JSON.stringify({ systemInstruction: { parts: [{ text: SYSTEM }] }, contents: msgs, generationConfig: { maxOutputTokens: 250, temperature: 0.7 } })
      });
      if (!r.ok) { console.error('Gemini error', r.status, (await r.text()).slice(0, 300)); return json(res, 502, { error: 'Mentor service unavailable' }); }
      const data = await r.json();
      const reply = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!reply) return json(res, 502, { error: 'Empty answer.' });
      return json(res, 200, { text: reply });
    }

    if (req.url === '/api/speak') {
      if (!EL_KEY) return json(res, 503, { error: 'Voice is not configured' });
      const text = typeof b.text === 'string' ? b.text.trim().slice(0, 1000) : '';
      if (!text) return json(res, 400, { error: 'Text required' });
      const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${EL_VOICE}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'xi-api-key': EL_KEY },
        body: JSON.stringify({ text, model_id: EL_MODEL })
      });
      if (!r.ok) return json(res, 502, { error: 'Voice service unavailable' });
      const buf = await r.arrayBuffer();
      res.writeHead(200, { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'no-cache' });
      return res.end(Buffer.from(buf));
    }

    return json(res, 404, { error: 'Not found' });
  } catch (err) {
    console.error('Server error', err);
    return json(res, 500, { error: 'Internal server error' });
  }
}).listen(PORT, () => console.log('Server on', PORT));
