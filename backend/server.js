import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import googleTTS from 'google-tts-api';

const app = express();
const PORT = Number(process.env.PORT || 8787);

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY || '';
const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID || 'EXAVITQu4vr4xnSDxMaL';
const ELEVENLABS_MODEL_ID = process.env.ELEVENLABS_MODEL_ID || 'eleven_multilingual_v2';

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

function craftReply(intent, context = {}, message = '') {
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

function runAssistant(payload = {}) {
  const message = String(payload.message || '');
  const memory = Array.isArray(payload.memory) ? payload.memory.slice(-MAX_MEMORY) : [];

  let intent = detectIntent(message);
  if (!INTENTS.includes(intent)) intent = 'curious';

  let action = mapAction(intent, message);
  if (!ACTIONS.includes(action)) action = 'none';

  let reply = craftReply(intent, payload.context || {}, message);
  if (repeatedReply(reply, memory)) {
    reply = craftReply(intent, payload.context || {}, `${message}-${Date.now()}`);
  }

  return {
    reply,
    intent,
    action,
    reasoning: 'rule-engine',
    source: 'rule-engine'
  };
}

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'shopify-ai-voice-sales-assistant',
    engine: 'rule-engine',
    elevenlabsConfigured: Boolean(ELEVENLABS_API_KEY),
    allowedOrigins: allowedOrigins.length ? allowedOrigins : ['*']
  });
});

app.post('/chat', rateLimit, (req, res) => {
  const payload = req.body || {};
  if (!payload.message || typeof payload.message !== 'string') {
    return res.status(400).json({ error: 'message is required' });
  }

  return res.json(runAssistant(payload));
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
  console.log(`Voice assistant backend running at http://localhost:${PORT}`);
});