export class CatalogFunctions {
  constructor(knowledgeService) {
    this.knowledgeService = knowledgeService;
    this.mockCarts = new Map();
  }

  get_products() {
    return this.knowledgeService.listProducts().map((p) => ({
      id: p.id,
      name: p.name,
      category: p.category,
      price: p.price,
      currency: p.currency,
      stock: p.stock,
      popularityScore: p.popularityScore
    }));
  }

  get_product_details(productId) {
    return this.knowledgeService.listProducts().find((p) => p.id === productId) || null;
  }

  get_price(productId) {
    const product = this.get_product_details(productId);
    return product ? { productId, price: product.price, currency: product.currency } : null;
  }

  check_stock(productId) {
    const product = this.get_product_details(productId);
    return product ? { productId, stock: product.stock, inStock: product.stock > 0 } : null;
  }

  get_cart(userId = 'anonymous') {
    return this.mockCarts.get(userId) || { userId, items: [], subtotal: 0, currency: 'USD' };
  }
}
