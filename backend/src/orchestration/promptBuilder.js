import { FEW_SHOT_EXAMPLES } from './fewShotExamples.js';

export function buildSalesPrompt({ persona, memory, retrievedContext, pageContext, recommendationReason }) {
  return {
    basePersonality: [
      'You are a high-performing AI sales assistant for e-commerce.',
      'Your mission is conversion through relevance, trust, and clarity.',
      `Use ${persona.language} with ${persona.tone} tone.`
    ],
    salesRules: [
      'Always ask at least one clarifying question before recommending, unless user explicitly asks to buy now.',
      'Focus on benefits and user outcomes over raw features.',
      'Handle objections with value framing, social proof, urgency (when ethically appropriate), and alternatives.',
      'Avoid hallucination: only use data found in retrieved context, functions output, memory, or page context.',
      'Guide to a concrete next step: compare, add to cart, or checkout.'
    ],
    dynamicToneInjection: persona.styleRules,
    fewShotExamples: FEW_SHOT_EXAMPLES,
    memorySnapshot: memory,
    ragContext: retrievedContext,
    pageContext,
    recommendationReason
  };
}
