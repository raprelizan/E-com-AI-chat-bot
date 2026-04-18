import { SALES_STAGES } from '../config/constants.js';

export function detectSalesStage(message = '') {
  const text = String(message).toLowerCase();
  if (/(buy|checkout|add to cart|ready)/.test(text)) return SALES_STAGES.CLOSING;
  if (/(expensive|not sure|hesitant|later)/.test(text)) return SALES_STAGES.OBJECTION_HANDLING;
  if (/(recommend|best|compare|which)/.test(text)) return SALES_STAGES.RECOMMENDATION;
  return SALES_STAGES.DISCOVERY;
}

export function nextQuestion(stage) {
  if (stage === SALES_STAGES.DISCOVERY) return 'What are you shopping for today, and what budget range feels right?';
  if (stage === SALES_STAGES.RECOMMENDATION) return 'Do you want the best value, premium quality, or fastest delivery option?';
  if (stage === SALES_STAGES.OBJECTION_HANDLING) return 'Would you like a lower-cost alternative or a side-by-side comparison to feel confident?';
  return 'Should I help you add this to cart now or check one backup option first?';
}
