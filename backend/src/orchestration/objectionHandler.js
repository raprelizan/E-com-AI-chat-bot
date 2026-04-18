import { OBJECTION_TYPES } from '../config/constants.js';

export function detectObjection(message = '') {
  const text = String(message).toLowerCase();
  if (/(too expensive|costly|overpriced|غالي|expensive)/.test(text)) return OBJECTION_TYPES.EXPENSIVE;
  if (/(not sure|unsure|hesitant|محتار|maybe later)/.test(text)) return OBJECTION_TYPES.UNSURE;
  if (/(i will think|think about it|later|later maybe)/.test(text)) return OBJECTION_TYPES.THINK_ABOUT_IT;
  return null;
}

export function objectionResponse(objectionType, recommendation) {
  if (!objectionType) return null;

  const fallbackName = recommendation?.name || 'this option';

  if (objectionType === OBJECTION_TYPES.EXPENSIVE) {
    return `Fair point on price. ${fallbackName} is recommended because it delivers stronger long-term value. If you want, I can also show a lower-cost alternative that still matches your goal.`;
  }

  if (objectionType === OBJECTION_TYPES.UNSURE) {
    return `That’s normal. Let’s simplify: I can compare only the top 2 options for your use-case so your decision is easy.`;
  }

  return `Makes sense. While you think, stock and promos can change quickly. Want me to save the best option and a backup right now?`;
}
