'use strict';

const orderService = require('../services/order.service');
const { success } = require('../utils/apiResponse');

async function getCart(req, res, next) {
  try {
    const cart = await orderService.getCart(req.user.profileId);
    return success(res, 200, 'Cart fetched', cart);
  } catch (err) { next(err); }
}

async function addToCart(req, res, next) {
  try {
    const cart = await orderService.addToCart(req.user.profileId, req.body);
    return success(res, 200, 'Item added to cart', cart);
  } catch (err) { next(err); }
}

async function updateCartItem(req, res, next) {
  try {
    const cart = await orderService.updateCartItem(
      req.user.profileId,
      req.params.listingId,
      req.body
    );
    return success(res, 200, 'Cart item updated', cart);
  } catch (err) { next(err); }
}

async function removeFromCart(req, res, next) {
  try {
    const cart = await orderService.removeFromCart(req.user.profileId, req.params.listingId);
    return success(res, 200, 'Item removed from cart', cart);
  } catch (err) { next(err); }
}

async function checkout(req, res, next) {
  try {
    const orders = await orderService.checkout(
      req.user.profileId,
      req.user.userId,
      req.body,
      req.app.get('io')
    );
    return success(res, 201, `Checkout successful. ${orders.length} order(s) created.`, orders);
  } catch (err) { next(err); }
}

module.exports = { getCart, addToCart, updateCartItem, removeFromCart, checkout };
