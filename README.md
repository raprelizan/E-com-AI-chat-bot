# Shopify AI Voice Sales Assistant (Pro v2)

مساعد تسويقي صوتي احترافي لصفحات المنتجات في Shopify مع:
- محادثة صوتية مستمرة (دارجة/عربية)
- Intent + Action ذكي
- تنفيذ آمن للأوامر على الصفحة (سعر/صور/مراجعات/شراء)
- Backend قوي مع Gemini 2.5 Flash + fallback ذكي

## المميزات الأساسية

- Voice STT عبر Web Speech API
- Voice TTS عبر Google TTS endpoint + Browser fallback
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
# عدل GEMINI_API_KEY + ALLOWED_ORIGINS
npm run start
```

ملف `.env` (مثال):

```env
PORT=8787
GEMINI_API_KEY=REPLACE_WITH_YOUR_GEMINI_API_KEY
GEMINI_MODEL=gemini-2.5-flash
ALLOWED_ORIGINS=https://your-store.myshopify.com,https://unretired-update-cadet.ngrok-free.dev
```

Endpoints:
- `GET /health`
- `POST /chat`
- `GET /tts?text=...&lang=ar`

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
4. backend يرجع `intent/action/reply`
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

- منع تكرار الردود (anti-repeat)
- fallback ذكي حسب نية المستخدم
- تنظيف الردود غير العربية
- نموذج Gemini 2.5 Flash افتراضي
- واجهة مضغوطة احترافية قابلة للسحب

---

## 5) فحص سريع

```bash
# backend syntax
cd backend && npm run check

# health
curl https://unretired-update-cadet.ngrok-free.dev/health
```

