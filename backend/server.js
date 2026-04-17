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

const SYSTEM_PROMPT = `You are Nadia, a female Algerian luxury sales assistant for women's watches.
Tone: soft, warm, persuasive, confident, concise.

You receive a shopper message plus product/page context.
You must output STRICT JSON only with this schema:
{
  "reply": "string",
  "action": "scroll_price|scroll_images|scroll_reviews|buy|none",
  "intent": "curious|hesitant|price inquiry|quality inquiry|ready to buy",
  "reasoning": "short explanation"
}

Rules:
- Keep reply short and sales oriented (1-3 sentences).
- If user asks cost, choose intent price inquiry and action scroll_price.
- If user asks photo/look/design, action scroll_images.
- If user asks quality/material/warranty/reviews, action scroll_reviews.
- If user indicates they want to purchase, action buy and intent ready to buy.
- If uncertain, action none.
- Be honest, never fabricate product facts. Use provided context only.
- Focus on moving customer toward checkout gently.
`;

function ruleBasedFallback(userText = '') {
  const text = userText.toLowerCase();

  if (/(buy|take it|i want it|add to cart|i'll get it|i will get it|checkout)/i.test(text)) {
    return {
      intent: 'ready to buy',
      action: 'buy'
    };
  }
  if (/(price|cost|how much|expensive|discount)/i.test(text)) {
    return {
      intent: 'price inquiry',
      action: 'scroll_price'
    };
  }
  if (/(quality|material|warranty|reviews|good|durable|authentic)/i.test(text)) {
    return {
      intent: 'quality inquiry',
      action: 'scroll_reviews'
    };
  }
  if (/(photo|image|look|design|color|style)/i.test(text)) {
    return {
      intent: 'curious',
      action: 'scroll_images'
    };
  }
  if (/(not sure|hesitant|maybe|later|think)/i.test(text)) {
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
    reply: `Great choice exploring ${productName}. I can show details or help you add it to cart whenever you're ready.`,
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

  if (!text) {
    return res.status(400).json({ error: 'text query param required' });
  }

  try {
    const url = googleTTS.getAudioUrl(text.slice(0, 180), {
      lang: 'en',
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
