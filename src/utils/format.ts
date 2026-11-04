/**
 * Currency formatting utility for Amazon Indian theme (₹ Rupee default)
 */
export function formatPrice(amount: number): string {
  if (isNaN(amount) || amount === null || amount === undefined) return '₹0';
  // If price is small (< 100) and was originally in dollars, we can also display nicely,
  // but in our mockData we will provide authentic INR prices matching the screenshot!
  return `₹${Math.round(amount).toLocaleString('en-IN')}`;
}

export function formatOriginalPrice(amount: number): string {
  if (isNaN(amount) || amount === null || amount === undefined) return '₹0';
  return `₹${Math.round(amount).toLocaleString('en-IN')}`;
}
