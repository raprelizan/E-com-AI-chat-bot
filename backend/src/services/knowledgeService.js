import fs from 'node:fs';
import path from 'node:path';

function normalizeChunk(text = '') {
  return String(text).replace(/\s+/g, ' ').trim();
}

export class KnowledgeService {
  constructor() {
    const file = path.resolve(process.cwd(), 'src/data/knowledge-base.json');
    const raw = fs.readFileSync(file, 'utf-8');
    this.data = JSON.parse(raw);
    this.documents = this.buildDocuments();
  }

  buildDocuments() {
    const docs = [];

    for (const product of this.data.products || []) {
      docs.push({
        id: `product-${product.id}`,
        type: 'product',
        metadata: { productId: product.id, name: product.name, category: product.category },
        text: normalizeChunk(`${product.name}. ${product.description}. Benefits: ${product.benefits.join(', ')}. Price: ${product.price} ${product.currency}. Social proof: ${product.socialProof}.`)
      });
    }

    for (const faq of this.data.faqs || []) {
      docs.push({
        id: `faq-${faq.id}`,
        type: 'faq',
        metadata: { faqId: faq.id },
        text: normalizeChunk(`Q: ${faq.question}. A: ${faq.answer}`)
      });
    }

    for (const policy of this.data.policies || []) {
      docs.push({
        id: `policy-${policy.id}`,
        type: 'policy',
        metadata: { policyId: policy.id, title: policy.title },
        text: normalizeChunk(`${policy.title}. ${policy.content}`)
      });
    }

    for (const page of this.data.landing || []) {
      docs.push({
        id: `landing-${page.id}`,
        type: 'landing',
        metadata: { landingId: page.id, headline: page.headline },
        text: normalizeChunk(`${page.headline}. ${page.content}`)
      });
    }

    return docs;
  }

  listProducts() {
    return this.data.products || [];
  }
}
