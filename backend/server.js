import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import googleTTS from 'google-tts-api';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const app = express();
const PORT = Number(process.env.PORT || 8787);

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY || '';
const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID || 'EXAVITQu4vr4xnSDxMaL';
const ELEVENLABS_MODEL_ID = process.env.ELEVENLABS_MODEL_ID || 'eleven_multilingual_v2';

const ACTIONS = ['scroll_price', 'scroll_images', 'scroll_reviews', 'buy', 'none'];
const MAX_MEMORY = 5;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const productsPath = path.join(__dirname, 'data', 'products.json');
const PRODUCT_KB = JSON.parse(fs.readFileSync(productsPath, 'utf8'));

const SESSION_STORE = new Map();

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
  const maxReq = 50;
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

function createSessionId() {
  return `sess_${Math.random().toString(36).slice(2, 10)}_${Date.now()}`;
}

function hashSeed(value = '') {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = ((hash << 5) - hash) + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function pick(list, seed = '') {
  if (!list?.length) return '';
  return list[hashSeed(seed) % list.length];
}

function normalizeText(text = '') {
  return String(text).replace(/\s+/g, ' ').trim().toLowerCase();
}

function detectIntent(message = '') {
  const text = message.toLowerCase();
  if (/(buy|checkout|اشتري|شراء|نخلص|خلص|سلة)/i.test(text)) return 'buy';
  if (/(compare|افضل|مقارنة|فرق)/i.test(text)) return 'compare';
  if (/(support|مشكل|problem|help|مساعدة)/i.test(text)) return 'support';
  return 'browse';
}

function conversionStage(message = '') {
  const text = message.toLowerCase();
  if (/(buy|checkout|اشتري|نخلص|حجز)/i.test(text)) return 'decision';
  if (/(price|سعر|افضل|quality|جودة|مقارنة)/i.test(text)) return 'consideration';
  return 'awareness';
}

function mapAction(message = '', intent = 'browse') {
  const text = message.toLowerCase();
  if (intent === 'buy') return 'buy';
  if (/(price|سعر|ثمن|بشحال|قداش)/i.test(text)) return 'scroll_price';
  if (/(صور|شكل|design|image|photo|ستايل)/i.test(text)) return 'scroll_images';
  if (/(review|rating|تقييم|جودة|ضمان)/i.test(text)) return 'scroll_reviews';
  return 'none';
}

function extractProfile(session, message = '') {
  const text = String(message);

  const nameMatch = text.match(/(?:اسمي|انا اسمي|my name is)\s+([\p{L}A-Za-z]{2,20})/iu);
  if (nameMatch) session.profile.name = nameMatch[1];

  const budgetMatch = text.match(/(?:under|less than|budget|ميزانيتي|اقل من)\s*\$?\s*(\d{2,4})/i);
  if (budgetMatch) session.profile.budget = Number(budgetMatch[1]);

  const prefKeywords = ['gold', 'black', 'rose', 'luxury', 'classic', 'minimal', 'ذهبي', 'اسود', 'فاخر', 'كلاسيك'];
  prefKeywords.forEach((k) => {
    if (text.toLowerCase().includes(k.toLowerCase())) session.profile.preferences.add(k);
  });
}


function buildContextCatalog(context = {}) {
  if (!context?.title) return [];
  return [{
    id: 'live_product',
    name: context.title,
    category: 'women_watch',
    price: Number(context.price_value) || 0,
    currency: context.currency || 'DZD',
    rating: context.reviews ? 4.8 : 4.5,
    stock: context.available ? 6 : 0,
    tags: [...(context.variants || []), ...(context.social_proof ? [context.social_proof] : [])].map((x) => String(x).toLowerCase()),
    benefits: [
      context.social_proof ? `ثقة اجتماعية: ${context.social_proof}` : 'تصميم فاخر',
      context.available ? 'متوفر للطلب الآن' : 'حاليًا غير متوفر'
    ],
    warranty: 'حسب سياسة المتجر'
  }];
}

function retrieveProducts(message = '', session, context = {}) {
  const text = message.toLowerCase();
  const budget = session.profile.budget || Infinity;
  const prefs = [...session.profile.preferences];
  const catalog = [...buildContextCatalog(context), ...PRODUCT_KB];

  const scored = catalog.map((p) => {
    let score = 0;

    if (p.price <= budget) score += 3;
    if (p.rating >= 4.8) score += 2;
    if (p.stock <= 8) score += 1;

    p.tags.forEach((tag) => {
      if (text.includes(tag.toLowerCase())) score += 3;
    });

    prefs.forEach((pref) => {
      if (p.tags.some((t) => t.toLowerCase() === pref.toLowerCase())) score += 2;
    });

    if (!Number.isFinite(budget)) score += 1;

    return { product: p, score };
  })
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((x) => x.product);

  return scored;
}

function formatProductLine(p, session) {
  const why = p.benefits[0] || 'اختيار ممتاز';
  const budgetFit = session.profile.budget ? (p.price <= session.profile.budget ? 'يناسب ميزانيتك' : 'أعلى شوية من ميزانيتك') : 'خيار مطلوب بزاف';
  return `• ${p.name} — $${p.price} | ${why} | ${budgetFit}`;
}

function buildSalesReply(message, session, products, context = {}) {
  const namePart = session.profile.name ? `${session.profile.name}، ` : '';
  const intro = `${namePart}فهمت عليك 👌`;

  if (!products.length) {
    return `${intro} ما نقدرش نوصي بدون منتج مناسب الآن. عطيني ميزانية أو ستايل تحبيه.`;
  }

  const lines = products.map((p) => formatProductLine(p, session)).join('\n');
  const trust = pick([
    'المنتج هذا عليه طلب قوي هاد الأيام.',
    'كثير زبونات اختاروه بسبب الجودة والسعر.',
    'عنده تقييم ممتاز وضمان يطمن.'
  ], message);

  const availabilityNote = context.available === false
    ? 'ملاحظة: المنتج الحالي ظاهر كغير متوفر الآن، نقدر نقترح بديل فورًا.'
    : '';
  const variantsNote = Array.isArray(context.variants) && context.variants.length
    ? `الألوان/الخيارات المتوفرة: ${context.variants.slice(0, 4).join(' | ')}`
    : '';

  const urgency = products[0].stock <= 8
    ? 'الكمية محدودة حاليًا، الأفضل تاخذي القرار اليوم.'
    : 'إذا تحبي نبدأ بالأفضل فيهم ونمشي مباشرة للسلة.';

  return `${intro}\n${lines}\n${variantsNote}\n${trust} ${urgency} ${availabilityNote}`.trim();
}

function repeatedReply(reply = '', memory = []) {
  const normalized = normalizeText(reply);
  if (!normalized) return false;
  const lastAssistant = memory.filter((m) => m.role === 'assistant').slice(-2).map((m) => normalizeText(m.text || ''));
  return lastAssistant.includes(normalized);
}

function runAgent(payload = {}, session) {
  const message = String(payload.message || '');

  extractProfile(session, message);
  const products = retrieveProducts(message, session, payload.context || {});

  const analytics = {
    user_intent: detectIntent(message),
    conversion_stage: conversionStage(message)
  };

  const action = mapAction(message, analytics.user_intent);
  let reply = buildSalesReply(message, session, products, payload.context || {});

  if (repeatedReply(reply, session.history)) {
    reply = `${reply}\nتحبي نرشحلك الأفضل مباشرة ونضيفه للسلة؟`;
  }

  return {
    reply,
    action: ACTIONS.includes(action) ? action : 'none',
    intent: analytics.user_intent,
    reasoning: 'rule-engine-rag-like',
    analytics,
    products: products.map((p) => ({
      id: p.id,
      name: p.name,
      price: p.price,
      currency: p.currency,
      rating: p.rating,
      stock: p.stock,
      warranty: p.warranty
    }))
  };
}

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'shopify-ai-sales-agent',
    engine: 'rule-engine-rag-like',
    elevenlabsConfigured: Boolean(ELEVENLABS_API_KEY),
    kbProducts: PRODUCT_KB.length,
    activeSessions: SESSION_STORE.size
  });
});

app.post('/chat', rateLimit, (req, res) => {
  const payload = req.body || {};

  if (!payload.message || typeof payload.message !== 'string') {
    return res.status(400).json({ error: 'message is required' });
  }

  const sessionId = String(payload.session_id || createSessionId());
  const session = SESSION_STORE.get(sessionId) || {
    profile: {
      name: '',
      budget: null,
      preferences: new Set()
    },
    history: []
  };

  const response = runAgent(payload, session);

  session.history.push({ role: 'user', text: payload.message, ts: Date.now() });
  session.history.push({ role: 'assistant', text: response.reply, ts: Date.now() });
  session.history = session.history.slice(-MAX_MEMORY * 2);

  SESSION_STORE.set(sessionId, session);

  return res.json({
    ...response,
    session_id: sessionId,
    memory: {
      name: session.profile.name || null,
      budget: session.profile.budget || null,
      preferences: [...session.profile.preferences]
    }
  });
});

app.get('/tts', rateLimit, async (req, res) => {
  const text = String(req.query.text || '').trim();
  const lang = String(req.query.lang || 'ar').toLowerCase();
  if (!text) return res.status(400).json({ error: 'text query param required' });

  if (ELEVENLABS_API_KEY) {
    try {
      const voiceUrl = `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`;
      const r = await fetch(voiceUrl, {
        method: 'POST',
        headers: {
          'xi-api-key': ELEVENLABS_API_KEY,
          'Accept': 'audio/mpeg',
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
  const safeLang = allowed.has(lang) ? lang : 'ar';

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
  console.log(`AI Sales Agent backend running at http://localhost:${PORT}`);
});
