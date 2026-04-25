'use strict';

const productService = require('../services/product.service');
const { success, paginated } = require('../utils/apiResponse');

// ─── Public ───────────────────────────────────────────────────────────────────

async function getProducts(req, res, next) {
  try {
    const { items, total, page, limit } = await productService.getProducts(req.query);
    return paginated(res, items, total, page, limit, 'Products fetched');
  } catch (err) { next(err); }
}

async function getProductById(req, res, next) {
  try {
    const product = await productService.getProductById(req.params.id);
    return success(res, 200, 'Product fetched', product);
  } catch (err) { next(err); }
}

async function getListings(req, res, next) {
  try {
    const { items, total, page, limit } = await productService.getListings(req.query);
    return paginated(res, items, total, page, limit, 'Listings fetched');
  } catch (err) { next(err); }
}

async function getListingById(req, res, next) {
  try {
    const listing = await productService.getListingById(req.params.id);
    return success(res, 200, 'Listing fetched', listing);
  } catch (err) { next(err); }
}

// ─── Company ──────────────────────────────────────────────────────────────────

async function createProduct(req, res, next) {
  try {
    const product = await productService.createProduct(req.body, req.file);
    return success(res, 201, 'Product created', product);
  } catch (err) { next(err); }
}

async function getCompanyListings(req, res, next) {
  try {
    const { items, total, page, limit } = await productService.getCompanyListings(
      req.user.profileId,
      req.query
    );
    return paginated(res, items, total, page, limit, 'Company listings fetched');
  } catch (err) { next(err); }
}

async function createListing(req, res, next) {
  try {
    const listing = await productService.createListing(req.user.profileId, req.body);
    return success(res, 201, 'Listing created', listing);
  } catch (err) { next(err); }
}

async function updateListing(req, res, next) {
  try {
    const listing = await productService.updateListing(
      req.user.profileId,
      req.params.id,
      req.body
    );
    return success(res, 200, 'Listing updated', listing);
  } catch (err) { next(err); }
}

async function deleteListing(req, res, next) {
  try {
    await productService.deleteListing(req.user.profileId, req.params.id);
    return success(res, 200, 'Listing deleted');
  } catch (err) { next(err); }
}

module.exports = {
  getProducts, getProductById,
  getListings, getListingById,
  createProduct,
  getCompanyListings, createListing, updateListing, deleteListing,
};
