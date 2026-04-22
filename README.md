# Shopify AI Sales & CX Agent (ElevenLabs Voice)

وكيل مبيعات وتجربة عملاء ذكي لصفحات المنتجات في Shopify.

## ماذا يفعل الآن؟

- ✅ محادثة صوتية مستمرة
- ✅ ذاكرة جلسة فعلية (الاسم/الميزانية/التفضيلات)
- ✅ Product retrieval من قاعدة منتجات محلية (RAG-like)
- ✅ Live page-context extraction (title/price/variants/reviews/social proof)
- ✅ توصيات مبيعات موجهة نحو الإغلاق
- ✅ Action system: `scroll_price`, `scroll_images`, `scroll_reviews`, `buy`, `none`
- ✅ Analytics tagging داخلي: `user_intent` + `conversion_stage`
- ✅ ElevenLabs TTS أساسي + fallback

---

## Project Structure

```
backend/
  server.js
  package.json
  .env.example
  data/products.json
frontend/
  assets/
    voice-assistant.js
    voice-assistant.css
  snippets/
    ai-voice-assistant.liquid
```

---

## Backend Setup

```bash
cd backend
npm install
cp .env.example .env
npm run start
```

### `.env` example

```env
PORT=8787
ELEVENLABS_API_KEY=REPLACE_WITH_YOUR_ELEVENLABS_API_KEY
ELEVENLABS_VOICE_ID=EXAVITQu4vr4xnSDxMaL
ELEVENLABS_MODEL_ID=eleven_multilingual_v2
ALLOWED_ORIGINS=https://your-store.myshopify.com,https://unretired-update-cadet.ngrok-free.dev
```

### Endpoints
- `GET /health`
- `POST /chat`
- `GET /tts?text=...&lang=ar`

---

## Shopify Install

1. ارفع الملفات إلى الثيم:
   - `assets/voice-assistant.js`
   - `assets/voice-assistant.css`
   - `snippets/ai-voice-assistant.liquid`

2. أضف قبل `</body>` في `layout/theme.liquid`:

```liquid
{% render 'ai-voice-assistant', api_base: 'https://unretired-update-cadet.ngrok-free.dev' %}
```

---

## Chat Contract

```json
{
  "reply": "string",
  "intent": "browse|compare|buy|support",
  "action": "scroll_price|scroll_images|scroll_reviews|buy|none",
  "analytics": {
    "user_intent": "browse|compare|buy|support",
    "conversion_stage": "awareness|consideration|decision"
  },
  "products": [
    { "id": "w1", "name": "...", "price": 79 }
  ],
  "session_id": "sess_...",
  "memory": {
    "name": "...",
    "budget": 100,
    "preferences": ["gold"]
  }
}
```

---

## Quick Checks

```bash
cd backend && npm run check
curl https://unretired-update-cadet.ngrok-free.dev/health
```

