import { MAX_MEMORY } from '../config/constants.js';

const userMemoryStore = new Map();

export function getUserMemory(userId = 'anonymous') {
  return userMemoryStore.get(userId) || {
    viewedProducts: [],
    preferences: {},
    budget: null,
    interactions: []
  };
}

export function saveInteraction(userId = 'anonymous', interaction = {}) {
  const prev = getUserMemory(userId);
  const next = {
    ...prev,
    interactions: [...prev.interactions, interaction].slice(-MAX_MEMORY)
  };

  userMemoryStore.set(userId, next);
  return next;
}

export function updateProfileFromMessage(userId = 'anonymous', message = '', context = {}) {
  const current = getUserMemory(userId);
  const lower = String(message).toLowerCase();

  const budgetMatch = lower.match(/(?:budget|under|below|less than|around)\s*\$?(\d{2,5})/i);
  const budget = budgetMatch ? Number(budgetMatch[1]) : current.budget;

  const viewedProducts = new Set(current.viewedProducts);
  for (const productId of context.viewedProducts || []) viewedProducts.add(productId);

  const preferences = {
    ...current.preferences,
    prefersFast: /quick|fast|short|asap|tiktok/.test(lower) || current.preferences.prefersFast,
    wantsFormal: /b2b|company|team|invoice|formal/.test(lower) || current.preferences.wantsFormal
  };

  const next = {
    ...current,
    budget,
    viewedProducts: Array.from(viewedProducts).slice(-12),
    preferences
  };

  userMemoryStore.set(userId, next);
  return next;
}
