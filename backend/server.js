import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { GoogleGenAI } from '@google/genai';
import googleTTS from 'google-tts-api';

const app = express();
const PORT = Number(process.env.PORT || 8787);
const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const API_KEY = process.env.GEMINI_API_KEY || '';
const ai = API_KEY ? new GoogleGenAI({ apiKey: API_KEY }) : null;

const ACTIONS = ['scroll_price', 'scroll_images', 'scroll_reviews', 'buy', 'none'];
const INTENTS = ['curious', 'hesitant', 'price inquiry', 'quality inquiry', 'ready to buy'];
const MAX_MEMORY = 5;

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
  const maxReq = 45;
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

function hasArabic(text = '') {
  return /[\u0600-\u06FF]/.test(text);
}

function normalizeText(text = '') {
  return String(text).replace(/\s+/g, ' ').trim().toLowerCase();
}

function repeatedReply(reply = '', memory = []) {
  const normalized = normalizeText(reply);
  if (!normalized) return false;
  const lastAssistant = memory.filter((m) => m.role === 'assistant').slice(-2).map((m) => normalizeText(m.text || ''));
  return lastAssistant.includes(normalized);
}

function detectIntent(message = '') {
  const text = message.toLowerCase();

  if (/(اشتري|شراء|نخلص|خلص|سلة|add to cart|buy|checkout)/i.test(text)) return 'ready to buy';
  if (/(سعر|ثمن|بشحال|قداش|خصم|price|cost|discount)/i.test(text)) return 'price inquiry';
  if (/(جودة|خامة|خام|ضمان|تقييم|review|quality|material|warranty)/i.test(text)) return 'quality inquiry';
  if (/(مترددة|محتارة|مش متأكد|later|maybe|hesitant)/i.test(text)) return 'hesitant';
  return 'curious';
}

function mapAction(intent, message = '') {
  if (intent === 'ready to buy') return 'buy';
  if (intent === 'price inquiry') return 'scroll_price';
  if (intent === 'quality inquiry') return 'scroll_reviews';
  if (/(صور|شكل|تصميم|لون|image|photo|design|style)/i.test(message)) return 'scroll_images';
  return 'none';
}

function fallbackReply(intent, context = {}, message = '') {
  const product = context.title || 'هاد الساعة';
  const price = context.price || 'مبيّن في الصفحة';

  if (/(مرحبا|السلام|اهلا|hello|hi)/i.test(message)) {
    return pick([
      'يا هلا 💜 أنا نادية. تحبي نبدأ بالسعر ولا الجودة ولا الصور؟',
      'مرحبا بيك 🌸 نقدر نعاونك خطوة بخطوة حتى تختاري براحة.'
    ], message);
  }

  if (/(شحن|توصيل|delivery|وصل)/i.test(message)) {
    return 'أكيد، نقدر نعاونك بمعلومات التوصيل المتوفرة قبل إتمام الطلب.';
  }

  const variants = {
    'ready to buy': [
      `ممتاز ✨ ${product} اختيار راقٍ، نضيفه للسلة الآن؟`,
      'جاهزين 👌 نكملك مباشرة بخطوة الشراء.'
    ],
    'price inquiry': [
      `السعر ظاهر في الصفحة (${price})، نوديك مباشرة لمكانه؟`,
      'أكيد، نقدر نوجّهك حالًا لقسم السعر.'
    ],
    'quality inquiry': [
      'نقدر نوجّهك لقسم التقييمات والمراجعات باش تاخذي قرار واثق.',
      'خليني نوريك الجودة والمراجعات بالتفصيل.'
    ],
    hesitant: [
      'عادي خذي وقتك 💜 نقدر نبدأ بأبسط نقطة: السعر أو الصور.',
      'ماكان حتى ضغط، نعاونك بهدوء حتى تكوني مرتاحة.'
    ],
    curious: [
      `قوليلي وش تحبي تعرفي على ${product}: السعر، الصور، الجودة، ولا الشراء؟`,
      'تحبي نبدأ بالسعر ولا بالصور؟'
    ]
  };

  return pick(variants[intent] || variants.curious, message);
}

function safeParseJson(text = '') {
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start !== -1 && end > start) {
      try {
        return JSON.parse(text.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

function sanitizeOutput(raw, payload) {
  const message = String(payload.message || '');
  const memory = Array.isArray(payload.memory) ? payload.memory.slice(-MAX_MEMORY) : [];
  const inferredIntent = detectIntent(message);

  let intent = INTENTS.includes(raw?.intent) ? raw.intent : inferredIntent;
  let action = ACTIONS.includes(raw?.action) ? raw.action : mapAction(intent, message);
  let reply = String(raw?.reply || '').trim();

  if (!reply || !hasArabic(reply)) {
    reply = fallbackReply(intent, payload.context || {}, message);
  }

  if (repeatedReply(reply, memory)) {
    reply = fallbackReply(intent, payload.context || {}, `${message}-${Date.now()}`);
  }

  if (!ACTIONS.includes(action)) action = 'none';
  if (!INTENTS.includes(intent)) intent = 'curious';

  return {
    reply,
    intent,
    action,
    reasoning: String(raw?.reasoning || 'sanitized'),
    source: ai ? 'gemini_or_fallback' : 'rule_fallback'
  };
}

const SYSTEM_PROMPT = `أنتِ نادية، بائعة جزائرية محترفة لساعات نسائية فاخرة.

المطلوب:
- الرد دائمًا بالعربية/الدارجة الجزائرية فقط.
- أسلوب مقنع، أنثوي، مختصر (1-2 جمل).
- ممنوع الإنجليزية.
- لا اختلاق معلومات خارج context.
- أرجعي JSON فقط بدون أي نص إضافي.

JSON schema:
{
  "reply": "string",
  "intent": "curious|hesitant|price inquiry|quality inquiry|ready to buy",
  "action": "scroll_price|scroll_images|scroll_reviews|buy|none",
  "reasoning": "string"
}`;

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'shopify-ai-voice-sales-assistant',
    geminiConfigured: Boolean(API_KEY),
    model: MODEL,
    allowedOrigins: allowedOrigins.length ? allowedOrigins : ['*']
  });
});

app.post('/chat', rateLimit, async (req, res) => {
  const payload = req.body || {};
  if (!payload.message || typeof payload.message !== 'string') {
    return res.status(400).json({ error: 'message is required' });
  }

  if (!ai) {
    return res.json(sanitizeOutput({}, payload));
  }

  try {
    const result = await ai.models.generateContent({
      model: MODEL,
      config: {
        systemInstruction: SYSTEM_PROMPT,
        responseMimeType: 'application/json',
        temperature: 0.2,
        topP: 0.85
      },
      contents: [{
        role: 'user',
        parts: [{ text: JSON.stringify({
          message: payload.message,
          context: payload.context || {},
          memory: Array.isArray(payload.memory) ? payload.memory.slice(-MAX_MEMORY) : [],
          locale: payload.locale || 'ar-DZ'
        }) }]
      }]
    });

    const parsed = safeParseJson(result.text || '');
    return res.json(sanitizeOutput(parsed, payload));
  } catch {
    return res.json(sanitizeOutput({}, payload));
  }
});

app.get('/tts', rateLimit, async (req, res) => {
  const text = String(req.query.text || '').trim();
  const lang = String(req.query.lang || 'ar').toLowerCase();
  if (!text) return res.status(400).json({ error: 'text query param required' });

  const allowed = new Set(['ar', 'fr', 'en']);
  const safeLang = allowed.has(lang) ? lang : 'ar';

  try {
    const url = googleTTS.getAudioUrl(text.slice(0, 180), {
      lang: safeLang,
      slow: false,
      host: 'https://translate.google.com'
    });
    return res.json({ url });
  } catch {
    return res.status(500).json({ error: 'Failed to generate TTS URL' });
  }
});

app.listen(PORT, () => {
  console.log(`Voice assistant backend running at http://localhost:${PORT}`);
});
