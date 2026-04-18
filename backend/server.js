import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import googleTTS from 'google-tts-api';

import { KnowledgeService } from './src/services/knowledgeService.js';
import { LocalVectorStore } from './src/services/vectorStore.js';
import { CatalogFunctions } from './src/services/catalogFunctions.js';
import { getUserMemory, saveInteraction, updateProfileFromMessage } from './src/services/memoryService.js';
import { normalizePageContext } from './src/services/pageContextService.js';
import { SalesAssistantEngine } from './src/orchestration/salesAssistantEngine.js';

const app = express();
const PORT = Number(process.env.PORT || 8787);

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY || '';
const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID || 'EXAVITQu4vr4xnSDxMaL';
const ELEVENLABS_MODEL_ID = process.env.ELEVENLABS_MODEL_ID || 'eleven_multilingual_v2';

const knowledgeService = new KnowledgeService();
const vectorStore = new LocalVectorStore(knowledgeService.documents);
const catalogFunctions = new CatalogFunctions(knowledgeService);
const assistant = new SalesAssistantEngine({ vectorStore, catalogFunctions });

const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

app.use(cors({
  origin(origin, callback) {
    if (!origin || !allowedOrigins.length || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error('CORS not allowed'));
  }
}));
app.use(express.json({ limit: '1mb' }));

const rateBucket = new Map();
function rateLimit(req, res, next) {
  const ip = req.headers['x-forwarded-for']?.toString().split(',')[0] || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const windowMs = 60_000;
  const maxReq = 60;
  const entry = rateBucket.get(ip) || { count: 0, resetAt: now + windowMs };

  if (now > entry.resetAt) {
    entry.count = 0;
    entry.resetAt = now + windowMs;
  }

  entry.count += 1;
  rateBucket.set(ip, entry);

  if (entry.count > maxReq) {
    return res.status(429).json({ error: 'Rate limit exceeded' });
  }

  return next();
}

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'ai-sales-system',
    architecture: ['frontend-widget', 'backend-api', 'llm-orchestration', 'vector-store', 'business-logic'],
    ragDocuments: knowledgeService.documents.length,
    allowedOrigins: allowedOrigins.length ? allowedOrigins : ['*']
  });
});

app.post('/chat', rateLimit, (req, res) => {
  const payload = req.body || {};
  if (!payload.message || typeof payload.message !== 'string') {
    return res.status(400).json({ error: 'message is required' });
  }

  const userContext = {
    userId: payload.user?.id || 'anonymous',
    country: payload.user?.country || '',
    trafficSource: payload.user?.trafficSource || '',
    device: payload.user?.device || '',
    behavior: payload.user?.behavior || ''
  };

  const pageContext = normalizePageContext(payload.context || {});
  const memory = updateProfileFromMessage(userContext.userId, payload.message, pageContext);

  const ai = assistant.run({
    message: payload.message,
    userContext,
    memory,
    pageContext
  });

  saveInteraction(userContext.userId, {
    user: payload.message,
    assistant: ai.reply,
    timestamp: Date.now(),
    recommendedProductId: ai.recommendation?.id || null
  });

  return res.json({
    ...ai,
    memory: getUserMemory(userContext.userId)
  });
});

app.get('/tts', rateLimit, async (req, res) => {
  const text = String(req.query.text || '').trim();
  const lang = String(req.query.lang || 'en').toLowerCase();
  if (!text) return res.status(400).json({ error: 'text query param required' });

  if (ELEVENLABS_API_KEY) {
    try {
      const voiceUrl = `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`;
      const r = await fetch(voiceUrl, {
        method: 'POST',
        headers: {
          'xi-api-key': ELEVENLABS_API_KEY,
          Accept: 'audio/mpeg',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          text: text.slice(0, 450),
          model_id: ELEVENLABS_MODEL_ID,
          voice_settings: {
            stability: 0.45,
            similarity_boost: 0.85,
            style: 0.35,
            use_speaker_boost: true
          }
        })
      });

      if (r.ok) {
        const arr = Buffer.from(await r.arrayBuffer());
        const dataUrl = `data:audio/mpeg;base64,${arr.toString('base64')}`;
        return res.json({ url: dataUrl, provider: 'elevenlabs' });
      }
    } catch {
      // fallback below
    }
  }

  const allowed = new Set(['ar', 'fr', 'en']);
  const safeLang = allowed.has(lang) ? lang : 'en';

  try {
    const url = googleTTS.getAudioUrl(text.slice(0, 180), {
      lang: safeLang,
      slow: false,
      host: 'https://translate.google.com'
    });
    return res.json({ url, provider: 'google-tts-api' });
  } catch {
    return res.status(500).json({ error: 'Failed to generate TTS audio' });
  }
});

app.listen(PORT, () => {
  console.log(`AI sales backend running at http://localhost:${PORT}`);
});
