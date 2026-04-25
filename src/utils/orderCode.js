'use strict';

/**
 * Generates a human-readable order code.
 * Format: ORD-YYYY-XXXXXX (6 random uppercase alphanumeric chars)
 *
 * Examples: ORD-2025-A3F9KL, ORD-2025-Z1QW92
 *
 * Collision probability is extremely low for typical order volumes,
 * but the orders collection has a unique index on order_code as a safety net.
 */
function generateOrderCode() {
  const year = new Date().getFullYear();
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let suffix = '';
  for (let i = 0; i < 6; i++) {
    suffix += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `ORD-${year}-${suffix}`;
}

module.exports = { generateOrderCode };
