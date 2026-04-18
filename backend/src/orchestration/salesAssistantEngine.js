import { TOP_K_RAG } from '../config/constants.js';
import { resolvePersona } from './persona.js';
import { detectObjection, objectionResponse } from './objectionHandler.js';
import { recommendProduct } from './recommendationEngine.js';
import { detectSalesStage, nextQuestion } from './conversationFlow.js';
import { buildSalesPrompt } from './promptBuilder.js';

function detectIntent(message = '') {
  const text = String(message).toLowerCase();
  if (/(buy|checkout|add to cart|purchase|ready)/.test(text)) return 'ready_to_buy';
  if (/(price|cost|discount|expensive|cheap|budget|سعر)/.test(text)) return 'price';
  if (/(compare|difference|vs|which)/.test(text)) return 'comparison';
  return 'exploration';
}

function shouldCall(functionName, message, pageContext = {}) {
  const text = String(message).toLowerCase();
  if (functionName === 'get_products') return /(show|list|catalog|options)/.test(text);
  if (functionName === 'get_product_details') return Boolean(pageContext.productId) || /(details|specs|tell me more)/.test(text);
  if (functionName === 'get_price') return /(price|cost|expensive|cheap|budget)/.test(text);
  if (functionName === 'check_stock') return /(stock|available|availability|left)/.test(text);
  if (functionName === 'get_cart') return /(cart|basket|subtotal)/.test(text);
  return false;
}

function formatRagContext(results = []) {
  return results.map((r) => `- [${r.type}] ${r.text}`).join('\n');
}

export class SalesAssistantEngine {
  constructor({ vectorStore, catalogFunctions }) {
    this.vectorStore = vectorStore;
    this.catalogFunctions = catalogFunctions;
  }

  run({ message, userContext, memory, pageContext }) {
    const intent = detectIntent(message);
    const stage = detectSalesStage(message);
    const ragResults = this.vectorStore.query(`${message} ${pageContext.visibleText || ''}`, TOP_K_RAG);

    const calls = [];
    const productId = pageContext.productId || memory.viewedProducts?.at(-1) || 'p-001';

    if (shouldCall('get_products', message, pageContext)) {
      calls.push({ name: 'get_products', result: this.catalogFunctions.get_products() });
    }
    if (shouldCall('get_product_details', message, pageContext)) {
      calls.push({ name: 'get_product_details', result: this.catalogFunctions.get_product_details(productId) });
    }
    if (shouldCall('get_price', message, pageContext)) {
      calls.push({ name: 'get_price', result: this.catalogFunctions.get_price(productId) });
    }
    if (shouldCall('check_stock', message, pageContext)) {
      calls.push({ name: 'check_stock', result: this.catalogFunctions.check_stock(productId) });
    }
    if (shouldCall('get_cart', message, pageContext)) {
      calls.push({ name: 'get_cart', result: this.catalogFunctions.get_cart(userContext.userId) });
    }

    const catalog = this.catalogFunctions.get_products();
    const recommendation = recommendProduct({ catalog, memory, intent, query: message });
    const objectionType = detectObjection(message);

    const persona = resolvePersona(userContext, memory);
    const prompt = buildSalesPrompt({
      persona,
      memory,
      retrievedContext: formatRagContext(ragResults),
      pageContext,
      recommendationReason: recommendation?.recommendationReason || ''
    });

    let reply;
    if (objectionType) {
      reply = objectionResponse(objectionType, recommendation);
    } else if (stage === 'closing' && recommendation) {
      reply = `Great choice. I recommend ${recommendation.name} because ${recommendation.recommendationReason} Ready for checkout or want one backup option?`;
    } else if (recommendation) {
      reply = `Based on what you shared, I recommend ${recommendation.name}. Why: ${recommendation.recommendationReason} ${nextQuestion(stage)}`;
    } else {
      reply = `I can help you find the best fit quickly. ${nextQuestion(stage)}`;
    }

    if (prompt?.dynamicToneInjection?.includes('Keep responses short')) {
      reply = reply.slice(0, 220);
    }

    return {
      reply,
      intent,
      stage,
      action: stage === 'closing' ? 'buy' : 'none',
      recommendation,
      rag: ragResults,
      functionCalls: calls,
      promptMeta: {
        tone: persona.tone,
        language: persona.language
      }
    };
  }
}
