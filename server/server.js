// PDCrest API: Super (Gemini) + voice (ElevenLabs). Keys come from environment variables only.
const fs = require('fs');
const path = require('path');

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
const http = require('http');

const PORT = process.env.PORT || 3000;
const GEMINI_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-flash-latest';
const EL_KEY = process.env.ELEVENLABS_API_KEY;
const EL_VOICE = process.env.ELEVENLABS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM';
const EL_MODEL = process.env.ELEVENLABS_MODEL || 'eleven_multilingual_v2';
const ORIGINS = (process.env.ALLOWED_ORIGIN || '').split(',').map(s => s.trim()).filter(Boolean);

const SYSTEM = 'You are Super, the friendly AI mentor in PDCrest, an app for personality development and anger management for users in India. ' +
  'Reply in 2-4 short, warm, practical sentences with one concrete step. You are not a doctor and do not diagnose. ' +
  'If the user mentions self-harm or hurting someone, urge them to contact Tele-MANAS (14416, free, 24x7) or local emergency services.';

// Simple per-IP limit so strangers cannot run up your bill: 20 requests per minute.
const hits = new Map();
const limited = ip => {
  const now = Date.now(), list = (hits.get(ip) || []).filter(t => now - t < 60000);
  list.push(now); hits.set(ip, list); return list.length > 20;
};
setInterval(() => { const n = Date.now(); for (const [k, v] of hits) if (!v.some(t => n - t < 60000)) hits.delete(k); }, 60000).unref();

const json = (res, code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
const readBody = req => new Promise((ok, no) => {
  let d = '';
  req.on('data', c => { d += c; if (d.length > 20000) { no(new Error('too big')); req.destroy(); } });
  req.on('end', () => { try { ok(JSON.parse(d || '{}')); } catch (e) { no(e); } });
});

http.createServer(async (req, res) => {
  const origin = req.headers.origin;
  if (origin && ORIGINS.includes(origin)) { res.setHeader('Access-Control-Allow-Origin', origin); res.setHeader('Vary', 'Origin'); }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
  if (req.method === 'GET' && req.url === '/') return json(res, 200, { ok: true, service: 'pdcrest-api' });
  if (req.method !== 'POST') return json(res, 404, { error: 'Not found' });

  const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
  if (limited(ip)) return json(res, 429, { error: 'Too many requests. Please wait a minute.' });

  try {
    const b = await readBody(req);

    if (req.url === '/api/mentor') {
      if (!GEMINI_KEY) return json(res, 503, { error: 'Mentor is not configured' });
      let msgs = (Array.isArray(b.messages) ? b.messages : []).slice(-12)
        .filter(m => m && typeof m.text === 'string' && m.text.trim())
        .map(m => ({ role: m.role === 'user' ? 'user' : 'model', parts: [{ text: m.text.slice(0, 1000) }] }));
      while (msgs.length && msgs[0].role !== 'user') msgs.shift();
      if (!msgs.length || msgs[msgs.length - 1].role !== 'user') return json(res, 400, { error: 'Send a message first' });
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_KEY },
        body: JSON.stringify({ systemInstruction: { parts: [{ text: SYSTEM }] }, contents: msgs, generationConfig: { maxOutputTokens: 400, temperature: 0.7 } })
      });
      if (!r.ok) { console.error('Gemini error', r.status, (await r.text()).slice(0, 300)); return json(res, 502, { error: 'Mentor unavailable' }); }
      const d = await r.json();
      const reply = ((d.candidates && d.candidates[0] && d.candidates[0].content && d.candidates[0].content.parts) || []).map(p => p.text || '').join('').trim();
      return json(res, 200, { reply: reply || 'Take five slow breaths, then tell me more.' });
    }

    if (req.url === '/api/speak') {
      if (!EL_KEY) return json(res, 503, { error: 'Voice is not configured' });
      const text = String(b.text || '').slice(0, 500);
      if (!text.trim()) return json(res, 400, { error: 'No text' });
      const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${EL_VOICE}`, {
        method: 'POST',
        headers: { 'xi-api-key': EL_KEY, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
        body: JSON.stringify({ text, model_id: EL_MODEL })
      });
      if (!r.ok) { console.error('ElevenLabs error', r.status, (await r.text()).slice(0, 300)); return json(res, 502, { error: 'Voice unavailable' }); }
      const buf = Buffer.from(await r.arrayBuffer());
      res.writeHead(200, { 'Content-Type': 'audio/mpeg', 'Content-Length': buf.length });
      return res.end(buf);
    }

    json(res, 404, { error: 'Not found' });
  } catch (e) {
    json(res, 400, { error: 'Bad request' });
  }
}).listen(PORT, () => console.log('PDCrest API listening on ' + PORT));
