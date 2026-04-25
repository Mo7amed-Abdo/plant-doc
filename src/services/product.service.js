'use strict';

const Product = require('../models/Product');
const ProductListing = require('../models/ProductListing');
const Company = require('../models/Company');
const { createError } = require('../middleware/error.middleware');
const { toMongoImage, toDataUri, toImageMeta } = require('../utils/image');

// ─── Master Catalog (public browse) ──────────────────────────────────────────

async function getProducts(query) {
  const { page = 1, limit = 20, category, tags, treats_diseases, search } = query;
  const skip = (Number(page) - 1) * Number(limit);

  const filter = {};
  if (category) filter.category = category;
  if (tags) filter.tags = { $in: Array.isArray(tags) ? tags : [tags] };
  if (treats_diseases) {
    filter.treats_diseases = {
      $in: Array.isArray(treats_diseases) ? treats_diseases : [treats_diseases],
    };
  }
  if (search) filter.name = { $regex: search, $options: 'i' };

  const [items, total] = await Promise.all([
    Product.find(filter)
      .select('-default_image') // Exclude binary from list
      .sort({ name: 1 })
      .skip(skip)
      .limit(Number(limit)),
    Product.countDocuments(filter),
  ]);

  return { items, total, page: Number(page), limit: Number(limit) };
}

async function getProductById(productId) {
  const product = await Product.findById(productId);
  if (!product) throw createError(404, 'Product not found');

  const obj = product.toObject();
  return {
    ...obj,
    default_image: toDataUri(obj.default_image),
  };
}

// ─── Company: add product to master catalog ───────────────────────────────────

async function createProduct(body, file) {
  const { name, category, active_ingredient, description, form, unit, tags, treats_diseases } = body;

  if (!name || !category) throw createError(400, 'name and category are required');

  const product = await Product.create({
    name,
    category,
    active_ingredient: active_ingredient || null,
    description: description || null,
    form: form || null,
    unit: unit || null,
    default_image: file ? toMongoImage(file) : null,
    tags: _parseArray(tags),
    treats_diseases: _parseArray(treats_diseases),
  });

  return product;
}

// ─── Product Listings (marketplace layer) ────────────────────────────────────

async function getListings(query) {
  const { page = 1, limit = 20, company_id, stock_status, product_id } = query;
  const skip = (Number(page) - 1) * Number(limit);

  const filter = { is_active: true };
  if (company_id) filter.company_id = company_id;
  if (stock_status) filter.stock_status = stock_status;
  if (product_id) filter.product_id = product_id;

  const [items, total] = await Promise.all([
    ProductListing.find(filter)
      .populate('product_id', '-default_image')
      .populate('company_id', 'name address is_verified')
      .sort({ created_at: -1 })
      .skip(skip)
      .limit(Number(limit)),
    ProductListing.countDocuments(filter),
  ]);

  return { items, total, page: Number(page), limit: Number(limit) };
}

async function getListingById(listingId) {
  const listing = await ProductListing.findById(listingId)
    .populate({
      path: 'product_id',
      transform: (doc) => {
        if (!doc) return null;
        const obj = doc.toObject();
        return { ...obj, default_image: toDataUri(obj.default_image) };
      },
    })
    .populate('company_id', 'name address phone email is_verified');

  if (!listing) throw createError(404, 'Listing not found');
  return listing;
}

// ─── Company: manage own listings ────────────────────────────────────────────

async function createListing(companyId, body) {
  const { product_id, sku, price, currency, stock_quantity } = body;

  if (!product_id || price == null || stock_quantity == null) {
    throw createError(400, 'product_id, price, and stock_quantity are required');
  }

  const product = await Product.findById(product_id);
  if (!product) throw createError(404, 'Product not found');

  // Duplicate guard is handled by unique compound index on (product_id, company_id)
  const listing = await ProductListing.create({
    product_id,
    company_id: companyId,
    sku: sku || null,
    price: Number(price),
    currency: currency || 'USD',
    stock_quantity: Number(stock_quantity),
  });

  return listing;
}

async function updateListing(companyId, listingId, body) {
  const listing = await ProductListing.findOne({ _id: listingId, company_id: companyId });
  if (!listing) throw createError(404, 'Listing not found');

  const { price, stock_quantity, sku, is_active, currency } = body;
  if (price !== undefined) listing.price = Number(price);
  if (stock_quantity !== undefined) listing.stock_quantity = Number(stock_quantity);
  if (sku !== undefined) listing.sku = sku;
  if (is_active !== undefined) listing.is_active = Boolean(is_active);
  if (currency !== undefined) listing.currency = currency;

  await listing.save(); // triggers stock_status pre-save hook
  return listing;
}

async function deleteListing(companyId, listingId) {
  const listing = await ProductListing.findOne({ _id: listingId, company_id: companyId });
  if (!listing) throw createError(404, 'Listing not found');
  listing.deleted_at = new Date();
  await listing.save();
}

// ─── Company: list own listings ───────────────────────────────────────────────

async function getCompanyListings(companyId, query) {
  const { page = 1, limit = 20, stock_status, is_active } = query;
  const skip = (Number(page) - 1) * Number(limit);

  const filter = { company_id: companyId };
  if (stock_status) filter.stock_status = stock_status;
  if (is_active !== undefined) filter.is_active = is_active === 'true';

  const [items, total] = await Promise.all([
    ProductListing.find(filter)
      .populate('product_id', 'name category unit')
      .sort({ created_at: -1 })
      .skip(skip)
      .limit(Number(limit)),
    ProductListing.countDocuments(filter),
  ]);

  return { items, total, page: Number(page), limit: Number(limit) };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function _parseArray(val) {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  return val.split(',').map((s) => s.trim()).filter(Boolean);
}

module.exports = {
  getProducts,
  getProductById,
  createProduct,
  getListings,
  getListingById,
  createListing,
  updateListing,
  deleteListing,
  getCompanyListings,
};
