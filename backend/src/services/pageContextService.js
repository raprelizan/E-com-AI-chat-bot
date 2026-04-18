export function normalizePageContext(context = {}) {
  return {
    title: context.title || '',
    price: context.price || '',
    visibleText: String(context.visibleText || '').slice(0, 1200),
    productId: context.productId || '',
    viewedProducts: Array.isArray(context.viewedProducts) ? context.viewedProducts.slice(0, 10) : []
  };
}
