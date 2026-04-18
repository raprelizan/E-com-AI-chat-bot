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

const SYSTEM_PROMPT = `أنتِ نادية، بائعة جزائرية راقية لساعات نسائية فاخرة.
النبرة: أنثوية ناعمة، مقنعة، مختصرة، ودائمًا بالعربية (يفضّل الدارجة الجزائرية المفهومة).

ستستلمين رسالة العميل + سياق صفحة المنتج + ذاكرة المحادثة.
يجب أن يكون الخرج JSON فقط وبدون أي نص إضافي بالشكل التالي:
{
  "reply": "string",
  "action": "scroll_price|scroll_images|scroll_reviews|buy|none",
  "intent": "curious|hesitant|price inquiry|quality inquiry|ready to buy",
  "reasoning": "short explanation"
}

قواعد:
- الرد دائمًا بالعربية أو الدارجة الجزائرية فقط (لا ترد بالإنجليزية).
- الرد يكون 1 إلى 2 جمل.
- إذا السؤال عن السعر: intent = price inquiry و action = scroll_price.
- إذا السؤال عن الصور/الشكل: action = scroll_images.
- إذا السؤال عن الجودة/الخامة/الضمان/التقييمات: action = scroll_reviews.
- إذا العميل جاهز للشراء: intent = ready to buy و action = buy.
- إذا غير واضح: action = none.
- لا تختلقي معلومات غير موجودة في السياق.
`;

function ruleBasedFallback(userText = '') {
  const text = userText.toLowerCase();

  if (/(buy|take it|i want it|add to cart|i'll get it|i will get it|checkout|اشتري|شراء|خذيها|نخلص|سلة)/i.test(text)) {
    return {
      intent: 'ready to buy',
      action: 'buy'
    };
  }
  if (/(price|cost|how much|expensive|discount|السعر|الثمن|بشحال|قداش)/i.test(text)) {
    return {
      intent: 'price inquiry',
      action: 'scroll_price'
    };
  }
  if (/(quality|material|warranty|reviews|good|durable|authentic|الجودة|الخام|الخامة|الضمان|تقييم|مراجعات)/i.test(text)) {
    return {
      intent: 'quality inquiry',
      action: 'scroll_reviews'
    };
  }
  if (/(photo|image|look|design|color|style|صور|شكل|تصميم|لون)/i.test(text)) {
    return {
      intent: 'curious',
      action: 'scroll_images'
    };
  }
  if (/(not sure|hesitant|maybe|later|think|مش متأكد|محتار|بعد|لاحقا)/i.test(text)) {
    return {
      intent: 'hesitant',
      action: 'none'
    };
  }

  return {
    intent: 'curious',
    action: 'none'
  };
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

function buildFallbackResponse(payload) {
  const fallback = ruleBasedFallback(payload.message || '');
  const productName = payload.context?.title || 'this piece';
  return {
    reply: `خيار رائع 👌 بالنسبة لـ ${productName}، نقدر نوريك السعر أو الصور أو التقييمات، وإذا حبيتي نضيفها مباشرة للسلة.`,
    action: fallback.action,
    intent: fallback.intent,
    reasoning: 'Fallback classification used because AI response was unavailable.'
  };
}

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'shopify-ai-voice-assistant',
    geminiConfigured: Boolean(geminiApiKey),
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
    const userBlob = {
      message: payload.message,
      memory: payload.memory || [],
      context: payload.context || {}
    };

    const response = await ai.models.generateContent({
      model: process.env.GEMINI_MODEL || 'gemini-2.0-flash',
      config: {
        systemInstruction: SYSTEM_PROMPT,
        responseMimeType: 'application/json',
        temperature: 0.4
      },
      contents: [
        {
          role: 'user',
          parts: [{ text: JSON.stringify(userBlob) }]
        }
      ]
    });

    const text = response.text || '{}';
    const parsed = safeJsonParse(text);

    if (!parsed || !parsed.reply || !parsed.intent || !parsed.action) {
      return res.json(buildFallbackResponse(payload));
    }

    const validActions = new Set(['scroll_price', 'scroll_images', 'scroll_reviews', 'buy', 'none']);
    const validIntents = new Set(['curious', 'hesitant', 'price inquiry', 'quality inquiry', 'ready to buy']);

    res.json({
      reply: String(parsed.reply),
      action: validActions.has(parsed.action) ? parsed.action : 'none',
      intent: validIntents.has(parsed.intent) ? parsed.intent : 'curious',
      reasoning: String(parsed.reasoning || 'AI classified message')
    });
  } catch (error) {
    res.json(buildFallbackResponse(payload));
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
