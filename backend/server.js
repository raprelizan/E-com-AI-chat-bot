import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { GoogleGenAI } from '@google/genai';
import googleTTS from 'google-tts-api';

const app = express();
const port = process.env.PORT || 8787;

app.use(cors());
app.use(express.json({ limit: '1mb' }));

const geminiApiKey = process.env.GEMINI_API_KEY;
const ai = geminiApiKey ? new GoogleGenAI({ apiKey: geminiApiKey }) : null;
const geminiProjectName = process.env.GEMINI_PROJECT_NAME || '';
const geminiProjectNumber = process.env.GEMINI_PROJECT_NUMBER || '';

const VALID_ACTIONS = new Set(['scroll_price', 'scroll_images', 'scroll_reviews', 'buy', 'none']);
const VALID_INTENTS = new Set(['curious', 'hesitant', 'price inquiry', 'quality inquiry', 'ready to buy']);

const SYSTEM_PROMPT = `أنتِ "نادية"، بائعة جزائرية محترفة لساعات نسائية فاخرة.

مهم جدًا:
- الرد دائمًا بالعربية أو الدارجة الجزائرية فقط.
- ممنوع الرد بالإنجليزية.
- أسلوبك أنثوي، راقٍ، مقنع، ومباشر.
- كل رد من 1 إلى 2 جمل قصار.
- لا تختلقي معلومات غير موجودة في context.

أرجعي JSON فقط بالشكل التالي:
{
  "reply": "string",
  "intent": "curious|hesitant|price inquiry|quality inquiry|ready to buy",
  "action": "scroll_price|scroll_images|scroll_reviews|buy|none",
  "reasoning": "string"
}

قواعد intent/action:
1) إذا السؤال عن السعر/الثمن/الخصم => intent: price inquiry + action: scroll_price
2) إذا السؤال عن الصور/الشكل/الألوان => action: scroll_images
3) إذا السؤال عن الجودة/الخامة/الضمان/التقييمات => intent: quality inquiry + action: scroll_reviews
4) إذا الزبون جاهز للشراء => intent: ready to buy + action: buy
5) غير ذلك => action: none
`;

function ruleBasedIntent(userText = '') {
  const text = userText.toLowerCase();

  if (/(buy|checkout|i want it|add to cart|اشتري|شراء|نخلص|خلص|اضيفيها|السلة)/i.test(text)) {
    return 'ready to buy';
  }
  if (/(price|cost|how much|discount|السعر|الثمن|بشحال|قداش|تخفيض)/i.test(text)) {
    return 'price inquiry';
  }
  if (/(quality|material|warranty|reviews|authentic|الجودة|الخامة|الخام|الضمان|التقييم|مراجعات|اصلية)/i.test(text)) {
    return 'quality inquiry';
  }
  if (/(not sure|hesitant|later|maybe|مش متأكد|مترددة|محتارة|بعد)/i.test(text)) {
    return 'hesitant';
  }
  return 'curious';
}

function actionFromIntent(intent = 'curious', text = '') {
  if (intent === 'ready to buy') return 'buy';
  if (intent === 'price inquiry') return 'scroll_price';
  if (intent === 'quality inquiry') return 'scroll_reviews';
  if (/(photo|image|design|style|shape|صور|شكل|تصميم|الوان|لون)/i.test(text)) return 'scroll_images';
  return 'none';
}

function hashSeed(text = '') {
  let h = 0;
  for (let i = 0; i < text.length; i += 1) h = ((h << 5) - h) + text.charCodeAt(i);
  return Math.abs(h);
}

function pickVariant(variants, seedText = '') {
  if (!variants.length) return '';
  return variants[hashSeed(seedText) % variants.length];
}

function normalizeSimple(text = '') {
  return text.replace(/\s+/g, ' ').trim().toLowerCase();
}

function isRepeatedReply(reply = '', memory = []) {
  const normalized = normalizeSimple(reply);
  if (!normalized) return false;
  const lastAssistant = (memory || []).filter((m) => m.role === 'assistant').slice(-2).map((m) => normalizeSimple(m.text || ''));
  return lastAssistant.includes(normalized);
}

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start !== -1 && end !== -1 && end > start) {
      try {
        return JSON.parse(text.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

function hasArabicChars(text = '') {
  return /[\u0600-\u06FF]/.test(text);
}

function shouldReplaceReply(text = '') {
  const chars = (text || '').replace(/\s+/g, '');
  if (!chars) return true;
  const latinCount = (chars.match(/[A-Za-z]/g) || []).length;
  const latinHeavy = latinCount / chars.length > 0.35;
  return latinHeavy || !hasArabicChars(text);
}

function fallbackReply(intent, context = {}, userText = '') {
  const title = context.title || 'هاد المنتج';
  const price = context.price || 'يبان في الصفحة';
  const text = (userText || '').toLowerCase();

  if (/(السلام|مرحبا|اهلا|hello|hi)/i.test(text)) {
    return pickVariant([
      'يا هلا 💜 أنا نادية، قوليلي تحبي نبدأ بالسعر ولا الجودة ولا الصور؟',
      'مرحبا بيك ✨ أنا هنا نعاونك، تحبي تشوفي السعر ولا التقييمات؟',
      'أهلا وسهلا 🌸 نقدر نرشدك بسرعة للسعر، الصور، أو الشراء مباشرة.'
    ], userText);
  }

  if (/(شحن|توصيل|delivery|وصل|مدة)/i.test(text)) {
    return pickVariant([
      'بخصوص التوصيل، نقدر نكملك بالمعلومات المتوفرة في المتجر قبل إتمام الطلب.',
      'أكيد، نقدر نعاونك بخطوات الشحن مباشرة من صفحة المنتج والسلة.'
    ], userText);
  }

  if (/(ارجاع|استرجاع|return|refund|ضمان)/i.test(text)) {
    return pickVariant([
      'على الضمان والإرجاع، الأفضل نراجع تفاصيل سياسة المتجر ونوريهالك مباشرة.',
      'نقدر نوجهك لقسم المراجعات والسياسة باش تتأكدي قبل الشراء.'
    ], userText);
  }

  const variants = {
    'ready to buy': [
      `ممتاز ✨ إذا موافقة نضيف ${title} للسلة الآن مباشرة.`,
      'جاهزين للشراء 👌 نقدر نكملك بخطوة إضافة للسلة حالًا.'
    ],
    'price inquiry': [
      `أكيد 👌 السعر ظاهر في الصفحة (${price})، نحركك مباشرة لمكانه؟`,
      'نقدر نديك مباشرة لقسم السعر باش تشوفيه بوضوح.'
    ],
    'quality inquiry': [
      'من ناحية الجودة، نخليك تشوفي التقييمات والمراجعات باش تاخذي قرار واثق.',
      'نقدر نوجّهك لقسم الجودة والمراجعات فورًا.'
    ],
    hesitant: [
      'عادي خذي وقتك 💜 نقدر نبدأ بأبسط نقطة: السعر أو الصور.',
      'ماكان حتى ضغط، نعاونك خطوة بخطوة حتى تكوني مرتاحة.'
    ],
    curious: [
      'فهمتك 👌 قوليلي تحبي السعر، الصور، الجودة، ولا الشراء مباشرة؟',
      `تحبي نبدأ بسعر ${title} ولا بصوره ولا بالتقييمات؟`
    ]
  };

  return pickVariant(variants[intent] || variants.curious, userText);
}

function normalizeResponse(raw, payload) {
  const userText = payload.message || '';
  const fallbackIntent = ruleBasedIntent(userText);

  const intent = VALID_INTENTS.has(raw?.intent) ? raw.intent : fallbackIntent;
  let action = VALID_ACTIONS.has(raw?.action) ? raw.action : actionFromIntent(intent, userText);

  if (!VALID_ACTIONS.has(action)) {
    action = actionFromIntent(intent, userText);
  }

  let reply = String(raw?.reply || '').trim();
  if (!reply || shouldReplaceReply(reply)) {
    reply = fallbackReply(intent, payload.context || {}, userText);
  }

  if (isRepeatedReply(reply, payload.memory || [])) {
    reply = fallbackReply(intent, payload.context || {}, `${userText}-${Date.now()}`);
  }

  return {
    reply,
    intent,
    action,
    reasoning: String(raw?.reasoning || 'normalized response')
  };
}

function buildFallbackResponse(payload) {
  const intent = ruleBasedIntent(payload.message || '');
  return {
    reply: fallbackReply(intent, payload.context || {}, payload.message || ''),
    action: actionFromIntent(intent, payload.message || ''),
    intent,
    reasoning: 'Rule fallback used'
  };
}

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'shopify-ai-voice-assistant',
    geminiConfigured: Boolean(geminiApiKey),
    model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
    project: geminiProjectName || undefined,
    projectNumber: geminiProjectNumber || undefined
  });
});

app.post('/chat', async (req, res) => {
  const payload = req.body || {};

  if (!payload.message || typeof payload.message !== 'string') {
    return res.status(400).json({ error: 'message is required' });
  }

  if (!ai) {
    return res.json(buildFallbackResponse(payload));
  }

  try {
    const response = await ai.models.generateContent({
      model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
      config: {
        systemInstruction: SYSTEM_PROMPT,
        responseMimeType: 'application/json',
        temperature: 0.2,
        topP: 0.8
      },
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: JSON.stringify({
                message: payload.message,
                memory: payload.memory || [],
                locale: payload.locale || 'ar-DZ',
                responseLanguage: payload.responseLanguage || 'algerian_arabic',
                context: payload.context || {}
              })
            }
          ]
        }
      ]
    });

    const parsed = safeJsonParse(response.text || '{}');
    const normalized = normalizeResponse(parsed, payload);

    return res.json(normalized);
  } catch {
    return res.json(buildFallbackResponse(payload));
  }
});

app.get('/tts', async (req, res) => {
  const text = String(req.query.text || '').trim();
  const lang = String(req.query.lang || 'ar').toLowerCase();

  if (!text) {
    return res.status(400).json({ error: 'text query param required' });
  }

  const allowed = new Set(['ar', 'fr', 'en']);
  const safeLang = allowed.has(lang) ? lang : 'ar';

  try {
    const url = googleTTS.getAudioUrl(text.slice(0, 180), {
      lang: safeLang,
      slow: false,
      host: 'https://translate.google.com'
    });
    res.json({ url });
  } catch {
    res.status(500).json({ error: 'Failed to generate TTS URL' });
  }
});

app.listen(port, () => {
  console.log(`AI Voice Sales Assistant backend running on port ${port}`);
});
