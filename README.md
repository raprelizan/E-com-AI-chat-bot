# Shopify AI Voice Sales Assistant (Production-Ready)

A real Shopify widget + Node backend that delivers a voice-based sales assistant for product pages.

## What You Get

- ✅ Real Shopify theme integration (`theme.liquid` + snippet + assets)
- ✅ Voice input (Web Speech API Speech-to-Text)
- ✅ Voice output (Google TTS via free endpoint, with browser TTS fallback)
- ✅ Intent detection (`curious`, `hesitant`, `price inquiry`, `quality inquiry`, `ready to buy`)
- ✅ Action system (`scroll_price`, `scroll_images`, `scroll_reviews`, `buy`, `none`)
- ✅ Automatic Add to Cart trigger on valid product pages
- ✅ Page intelligence extraction (title, price, images, reviews)
- ✅ Local memory (last 5 interactions)
- ✅ Luxury female Algerian seller persona
- ✅ Lightweight and non-blocking lazy load

---

## Project Structure

```
backend/
  package.json
  server.js
  .env.example
frontend/
  assets/
    voice-assistant.js
    voice-assistant.css
  snippets/
    ai-voice-assistant.liquid
```

---

## 1) Backend Setup (Node.js + Gemini)

### Requirements

- Node 18+
- Gemini API key (free-tier available on Google AI Studio)

### Install & Run

```bash
cd backend
npm install
cp .env.example .env
# edit .env and set GEMINI_API_KEY
npm run start
```


Example `.env` (replace with your own real key):

```env
PORT=8787
GEMINI_API_KEY=REPLACE_WITH_YOUR_GEMINI_API_KEY
GEMINI_MODEL=gemini-2.0-flash
GEMINI_PROJECT_NAME=projects/102922610260
GEMINI_PROJECT_NUMBER=102922610260
```

Default backend URL:

- `http://localhost:8787`

### Endpoints

- `GET /health` → healthcheck
- `POST /chat` → AI sales response + intent + action
- `GET /tts?text=...` → Google-TTS URL response

---

## 2) Shopify Installation

### A. Upload Assets and Snippet

In Shopify Admin:

1. Go to **Online Store → Themes**
2. Click **... → Edit code**
3. Upload/create these files:
   - `assets/voice-assistant.js` (copy from `frontend/assets/voice-assistant.js`)
   - `assets/voice-assistant.css` (copy from `frontend/assets/voice-assistant.css`)
   - `snippets/ai-voice-assistant.liquid` (copy from `frontend/snippets/ai-voice-assistant.liquid`)

### B. Inject in `theme.liquid`

Open `layout/theme.liquid` and insert before `</body>`:

```liquid
{% render 'ai-voice-assistant', api_base: 'https://YOUR-BACKEND-DOMAIN.com' %}
```

> Replace with your deployed backend URL (must be HTTPS for production).

### C. Verify on Product Pages

- Open any product page (`/products/...`)
- You should see floating assistant on left middle
- Click 🎤 to talk
- Assistant replies, classifies intent, and may scroll/click add-to-cart

---

## 3) Action Contract (AI → Frontend)

Backend always returns JSON:

```json
{
  "reply": "soft persuasive response",
  "action": "scroll_price|scroll_images|scroll_reviews|buy|none",
  "intent": "curious|hesitant|price inquiry|quality inquiry|ready to buy",
  "reasoning": "short explanation"
}
```

Frontend executes `action` safely via mapped handlers.

---

## 4) Production Notes

- Use HTTPS backend (Render, Railway, Fly.io, etc.)
- Add CORS allow-list for your shop domain(s)
- Keep Gemini temperature low for stable action JSON
- The assistant lazy-loads to avoid blocking first render
- Voice features depend on browser permissions and Web Speech support

---

## 5) No-Paid-API Constraint

This implementation uses:

- Gemini API free tier
- `google-tts-api` free endpoint style URL
- Browser-native SpeechSynthesis fallback (free)

No mandatory paid APIs required.

---

## 6) Customization Tips

- Persona prompt: edit `SYSTEM_PROMPT` in `backend/server.js`
- Widget design: edit `frontend/assets/voice-assistant.css`
- Product selectors per theme: edit `findPriceElement`, `findImagesElement`, `findReviewsElement` in `voice-assistant.js`

---

## 7) Security Hardening (Recommended)

- Add API auth token between Shopify script and backend
- Rate limit `/chat`
- Validate origin/referer
- Log and monitor action outputs
- Add server-side sanitization for all inputs

