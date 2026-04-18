# AI Sales System for E-commerce (Shopify Widget + Backend)

This project is now structured as a conversion-focused **AI Sales System**, not a basic chatbot.

## Architecture

- **Frontend widget** (`frontend/assets/voice-assistant.js`): voice/chat capture, page-context extraction, lightweight UI actions.
- **Backend API** (`backend/server.js`): chat + TTS endpoints, rate limiting, CORS, orchestration routing.
- **LLM orchestration layer** (`backend/src/orchestration/*`): sales prompts, persona routing, guided selling, objection handling.
- **Vector retrieval layer (RAG)** (`backend/src/services/vectorStore.js` + `knowledgeService.js`): retrieves relevant product/FAQ/policy/landing context.
- **Business logic layer** (`backend/src/services/*`): function calling contracts, recommendations, user memory.

## Key Capabilities

1. **RAG retrieval** over product descriptions, FAQs, policies, and landing content.
2. **Sales-oriented conversational behavior** with modular prompt system.
3. **Few-shot examples** for common e-commerce sales scenarios.
4. **Dynamic persona adaptation** (country / source / device / behavior).
5. **Real-time function calling contracts**:
   - `get_products()`
   - `get_product_details(product_id)`
   - `get_price(product_id)`
   - `check_stock(product_id)`
   - `get_cart(user_id)`
6. **User memory** (viewed products, budget, preferences, interactions).
7. **Recommendation engine** with explainable rationale.
8. **Objection handling** for price, uncertainty, and delay.
9. **Guided selling flow** (discovery → recommendation → objection → closing).
10. **Page awareness** from visible DOM content and product context.

## Run Backend

```bash
cd backend
npm install
cp .env.example .env
npm run start
```

### Health check

```bash
curl http://localhost:8787/health
```

### Chat

```bash
curl -X POST http://localhost:8787/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "I need something under $70",
    "user": {"id":"u1","country":"US","trafficSource":"tiktok","device":"mobile"},
    "context": {"title":"Atlas Pro Laptop Backpack","productId":"p-003","visibleText":"Anti-theft backpack"}
  }'
```

## Shopify snippet

Use `frontend/snippets/ai-voice-assistant.liquid` and set:

```liquid
{% render 'ai-voice-assistant', api_base: 'https://YOUR-BACKEND-DOMAIN.com' %}
```
