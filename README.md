# Shopify AI Voice Sales Assistant (Pro v2 - ElevenLabs Only)

مساعد تسويقي صوتي احترافي لصفحات المنتجات في Shopify مع:
- محادثة صوتية مستمرة (دارجة/عربية)
- Intent + Action ذكي
- تنفيذ آمن للأوامر على الصفحة (سعر/صور/مراجعات/شراء)
- Backend rule-engine قوي + ElevenLabs TTS

## المميزات الأساسية

- Voice STT عبر Web Speech API
- Voice TTS عبر ElevenLabs (أساسي) + Browser fallback
- شخصية بائعة جزائرية مقنعة
- ذاكرة آخر 5 تفاعلات
- Widget صغير قابل للسحب
- تحميل Lazy (non-blocking)
- حماية أساسية: Rate limit + CORS allowlist

---

## بنية المشروع

```
backend/
  server.js
  package.json
  .env.example
frontend/
  assets/
    voice-assistant.js
    voice-assistant.css
  snippets/
    ai-voice-assistant.liquid
```

---

## 1) تشغيل الـ Backend

```bash
cd backend
npm install
cp .env.example .env
# عدل ELEVENLABS_API_KEY + ALLOWED_ORIGINS
npm run start
```

ملف `.env` (مثال):

```env
PORT=8787
ELEVENLABS_API_KEY=REPLACE_WITH_YOUR_ELEVENLABS_API_KEY
ELEVENLABS_VOICE_ID=EXAVITQu4vr4xnSDxMaL
ELEVENLABS_MODEL_ID=eleven_multilingual_v2
ALLOWED_ORIGINS=https://your-store.myshopify.com,https://unretired-update-cadet.ngrok-free.dev
```

Endpoints:
- `GET /health`
- `POST /chat`
- `GET /tts?text=...&lang=ar` (ElevenLabs أولاً ثم fallback)

---

## 2) ربطه مع Shopify

### ارفع الملفات التالية للثيم
- `assets/voice-assistant.js`
- `assets/voice-assistant.css`
- `snippets/ai-voice-assistant.liquid`

### أضف في `layout/theme.liquid` قبل `</body>`

```liquid
{% render 'ai-voice-assistant', api_base: 'https://unretired-update-cadet.ngrok-free.dev' %}
```

---

## 3) كيف يعمل

1. نقرة على زر 🎙 تبدأ المحادثة
2. نقرة ثانية توقف المحادثة
3. النظام يسمع → يرسل `/chat` مع context + memory
4. backend rule-engine يرجع `intent/action/reply`
5. frontend ينفذ action آمن ويتكلم بالرد

Action Contract:

```json
{
  "reply": "...",
  "intent": "curious|hesitant|price inquiry|quality inquiry|ready to buy",
  "action": "scroll_price|scroll_images|scroll_reviews|buy|none",
  "reasoning": "..."
}
```

---

## 4) لماذا هذا الإصدار أقوى

- بدون Gemini نهائياً
- ElevenLabs للصوت (احترافي)
- منع تكرار الردود (anti-repeat)
- rule-engine قوي للـ intent/action
- واجهة مضغوطة احترافية قابلة للسحب

---

## 5) فحص سريع

```bash
# backend syntax
cd backend && npm run check

# health
curl https://unretired-update-cadet.ngrok-free.dev/health
```

