export function recommendProduct({ catalog = [], memory = {}, intent = '', query = '' }) {
  if (!catalog.length) return null;

  const budget = memory.budget;
  const viewed = new Set(memory.viewedProducts || []);
  const lowered = String(query).toLowerCase();

  const scored = catalog.map((product) => {
    let score = product.popularityScore || 0;
    if (budget && product.price <= budget) score += 15;
    if (viewed.has(product.id)) score += 8;
    if (intent === 'ready_to_buy') score += 10;
    if (lowered.includes(product.category)) score += 12;
    return { product, score };
  });

  scored.sort((a, b) => b.score - a.score);
  const top = scored[0]?.product;

  if (!top) return null;

  const reason = budget && top.price <= budget
    ? `It matches your budget around $${budget} and has strong customer traction.`
    : `It aligns with your intent and is one of our most trusted products.`;

  return { ...top, recommendationReason: reason };
}
