export function resolvePersona(userContext = {}, memory = {}) {
  const country = (userContext.country || '').toLowerCase();
  const traffic = (userContext.trafficSource || '').toLowerCase();
  const isMobile = /mobile/i.test(userContext.device || '');

  if (country.includes('algeria') || country === 'dz') {
    return {
      tone: 'friendly-simple-darija',
      language: 'Arabic (Darija)',
      styleRules: ['Use simple phrasing', 'Keep it warm and concise', 'Use local wording where helpful']
    };
  }

  if (traffic.includes('tiktok') || memory.preferences?.prefersFast || isMobile) {
    return {
      tone: 'fast-casual',
      language: 'English',
      styleRules: ['Keep responses short', 'Lead with result', 'Use energetic tone']
    };
  }

  if (/b2b|linkedin|enterprise/.test(traffic) || memory.preferences?.wantsFormal) {
    return {
      tone: 'formal-consultative',
      language: 'English',
      styleRules: ['Professional wording', 'Prioritize ROI', 'Provide structured recommendation']
    };
  }

  return {
    tone: 'consultative-friendly',
    language: 'English',
    styleRules: ['Ask one clarifying question', 'Focus on customer outcomes', 'Be concise and specific']
  };
}
