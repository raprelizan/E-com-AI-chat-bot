function tokenize(text = '') {
  return String(text)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 2);
}

function toEmbedding(text = '') {
  const tokens = tokenize(text);
  const vector = new Map();

  for (const token of tokens) {
    vector.set(token, (vector.get(token) || 0) + 1);
  }

  return vector;
}

function cosineSimilarity(a, b) {
  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (const value of a.values()) normA += value * value;
  for (const value of b.values()) normB += value * value;

  for (const [key, value] of a.entries()) {
    if (b.has(key)) dot += value * b.get(key);
  }

  if (!normA || !normB) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export class LocalVectorStore {
  constructor(documents = []) {
    this.index = documents.map((doc) => ({
      ...doc,
      embedding: toEmbedding(doc.text)
    }));
  }

  query(text, topK = 4) {
    const queryEmbedding = toEmbedding(text);

    return this.index
      .map((entry) => ({
        ...entry,
        score: cosineSimilarity(queryEmbedding, entry.embedding)
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)
      .map(({ embedding, ...rest }) => rest);
  }
}
