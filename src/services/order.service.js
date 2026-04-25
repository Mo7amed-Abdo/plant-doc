'use strict';

const mongoose = require('mongoose');
const Cart = require('../models/Cart');
const Order = require('../models/Order');
const OrderItem = require('../models/OrderItem');
const ProductListing = require('../models/ProductListing');
const Company = require('../models/Company');
const { createError } = require('../middleware/error.middleware');
const { generateOrderCode } = require('../utils/orderCode');
const notificationService = require('./notification.service');

// ─── Cart ─────────────────────────────────────────────────────────────────────

async function getCart(farmerId) {
  let cart = await Cart.findOne({ farmer_id: farmerId })
    .populate({
      path: 'items.product_listing_id',
      populate: { path: 'product_id', select: 'name category unit default_image' },
    });

  // Auto-create empty cart if none exists
  if (!cart) {
    cart = await Cart.create({ farmer_id: farmerId, items: [] });
  }

  return cart;
}

async function addToCart(farmerId, body) {
  const { product_listing_id, quantity } = body;
  if (!product_listing_id || !quantity) {
    throw createError(400, 'product_listing_id and quantity are required');
  }

  const listing = await ProductListing.findById(product_listing_id);
  if (!listing) throw createError(404, 'Product listing not found');
  if (!listing.is_active) throw createError(400, 'This product is not available');
  if (listing.stock_status === 'out_of_stock') throw createError(400, 'Product is out of stock');

  let cart = await Cart.findOne({ farmer_id: farmerId });
  if (!cart) cart = await Cart.create({ farmer_id: farmerId, items: [] });

  const existingItem = cart.items.find(
    (i) => i.product_listing_id.toString() === product_listing_id
  );

  if (existingItem) {
    existingItem.quantity = Number(quantity);
    existingItem.price_snapshot = listing.price; // Refresh price snapshot
  } else {
    cart.items.push({
      product_listing_id,
      quantity: Number(quantity),
      price_snapshot: listing.price,
      added_at: new Date(),
    });
  }

  await cart.save();
  return cart;
}

async function updateCartItem(farmerId, listingId, body) {
  const { quantity } = body;
  if (!quantity || Number(quantity) < 1) throw createError(400, 'quantity must be at least 1');

  const cart = await Cart.findOne({ farmer_id: farmerId });
  if (!cart) throw createError(404, 'Cart not found');

  const item = cart.items.find((i) => i.product_listing_id.toString() === listingId);
  if (!item) throw createError(404, 'Item not in cart');

  item.quantity = Number(quantity);
  await cart.save();
  return cart;
}

async function removeFromCart(farmerId, listingId) {
  const cart = await Cart.findOne({ farmer_id: farmerId });
  if (!cart) throw createError(404, 'Cart not found');

  cart.items = cart.items.filter((i) => i.product_listing_id.toString() !== listingId);
  await cart.save();
  return cart;
}

// ─── Checkout ─────────────────────────────────────────────────────────────────

/**
 * Checkout flow:
 * 1. Validate every cart item (stock, listing still active)
 * 2. Group items by company_id
 * 3. For each company group → create one Order + N OrderItems in a transaction
 * 4. Decrement stock_quantity on each listing
 * 5. Clear the cart
 * 6. Fire company notifications
 *
 * Returns array of created orders (one per company).
 */
async function checkout(farmerId, farmerUserId, body, io) {
  const { shipping_address, contact_phone, notes, related_treatment_request_id } = body;

  if (!shipping_address) throw createError(400, 'shipping_address is required');

  const cart = await Cart.findOne({ farmer_id: farmerId });
  if (!cart || cart.items.length === 0) throw createError(400, 'Your cart is empty');

  // ── 1. Validate all items & fetch live listing data ──────────────────────────
  const listingIds = cart.items.map((i) => i.product_listing_id);
  const listings = await ProductListing.find({ _id: { $in: listingIds } })
    .populate('product_id', 'name');

  const listingMap = new Map(listings.map((l) => [l._id.toString(), l]));

  for (const item of cart.items) {
    const listing = listingMap.get(item.product_listing_id.toString());
    if (!listing || !listing.is_active) {
      throw createError(400, `Product listing ${item.product_listing_id} is no longer available`);
    }
    if (listing.stock_quantity < item.quantity) {
      throw createError(
        400,
        `Insufficient stock for "${listing.product_id?.name}". Available: ${listing.stock_quantity}`
      );
    }
  }

  // ── 2. Group cart items by company ───────────────────────────────────────────
  const groups = new Map(); // companyId → [{ listing, item }]
  for (const item of cart.items) {
    const listing = listingMap.get(item.product_listing_id.toString());
    const companyKey = listing.company_id.toString();
    if (!groups.has(companyKey)) groups.set(companyKey, []);
    groups.get(companyKey).push({ listing, item });
  }

  // ── 3. Create one Order per company group (single transaction) ───────────────
  const session = await mongoose.startSession();
  session.startTransaction();
  const createdOrders = [];

  try {
    for (const [companyId, groupItems] of groups.entries()) {
      const subtotal = groupItems.reduce(
        (sum, { listing, item }) => sum + listing.price * item.quantity,
        0
      );
      const total = subtotal; // Extend here for shipping/tax later

      let orderCode;
      let attempts = 0;
      // Retry on rare order_code collision (unique index on order_code)
      while (attempts < 5) {
        orderCode = generateOrderCode();
        const exists = await Order.findOne({ order_code: orderCode }).session(session);
        if (!exists) break;
        attempts++;
      }

      const [order] = await Order.create(
        [{
          order_code: orderCode,
          farmer_id: farmerId,
          company_id: companyId,
          related_treatment_request_id: related_treatment_request_id || null,
          subtotal: parseFloat(subtotal.toFixed(2)),
          total: parseFloat(total.toFixed(2)),
          shipping_address,
          contact_phone: contact_phone || null,
          notes: notes || null,
          placed_at: new Date(),
        }],
        { session }
      );

      const orderItems = groupItems.map(({ listing, item }) => ({
        order_id: order._id,
        product_listing_id: listing._id,
        product_id: listing.product_id._id,
        product_name_snapshot: listing.product_id.name,
        sku_snapshot: listing.sku || null,
        quantity: item.quantity,
        unit_price: listing.price,
        subtotal: parseFloat((listing.price * item.quantity).toFixed(2)),
      }));

      await OrderItem.insertMany(orderItems, { session });

      // Decrement stock
      for (const { listing, item } of groupItems) {
        await ProductListing.findByIdAndUpdate(
          listing._id,
          { $inc: { stock_quantity: -item.quantity } },
          { session, new: true }
        ).then(async (updated) => {
          // Re-derive stock_status after decrement
          let newStatus = 'in_stock';
          if (updated.stock_quantity <= 0) newStatus = 'out_of_stock';
          else if (updated.stock_quantity <= 20) newStatus = 'low_stock';
          if (updated.stock_status !== newStatus) {
            await ProductListing.findByIdAndUpdate(
              listing._id,
              { stock_status: newStatus },
              { session }
            );
          }
        });
      }

      createdOrders.push(order);
    }

    // Clear the cart
    await Cart.findOneAndUpdate(
      { farmer_id: farmerId },
      { items: [] },
      { session }
    );

    await session.commitTransaction();

    // ── 4. Fire notifications (outside transaction) ──────────────────────────
    for (const order of createdOrders) {
      const company = await Company.findById(order.company_id).populate('owner_user_id', '_id');
      if (company) {
        await notificationService.notifyCompany(
          company._id,
          company.owner_user_id._id,
          {
            type: 'new_order',
            title: 'New order received',
            body: `Order ${order.order_code} has been placed.`,
            related_id: order._id,
            related_type: 'order',
          },
          io
        );
      }

      // Fire low_stock notification if any listing dropped to low_stock
      for (const [, groupItems] of groups.entries()) {
        for (const { listing } of groupItems) {
          const updated = await ProductListing.findById(listing._id);
          if (updated?.stock_status === 'low_stock') {
            const company = await Company.findById(updated.company_id).populate('owner_user_id', '_id');
            if (company) {
              await notificationService.notifyCompany(
                company._id,
                company.owner_user_id._id,
                {
                  type: 'low_stock',
                  title: 'Low stock alert',
                  body: `Stock for listing ${listing._id} is running low (${updated.stock_quantity} remaining).`,
                  related_id: listing._id,
                  related_type: 'product_listing',
                },
                io
              );
            }
          }
        }
      }
    }

    return createdOrders;
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
}

module.exports = { getCart, addToCart, updateCartItem, removeFromCart, checkout };
