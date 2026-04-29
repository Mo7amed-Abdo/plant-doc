'use strict';

// Hardcoded for local dev — no dotenv needed
const MONGO_URI = 'mongodb://localhost:27017/plantdoc';

const mongoose = require('mongoose');
const Product = require('./models/Product');
const ProductListing = require('./models/ProductListing');
const Company = require('./models/Company');

async function seed() {
  await mongoose.connect(MONGO_URI);
  console.log('✅ Connected to MongoDB');

  const company = await Company.findOne();
  if (!company) {
    console.log('❌ No company found — create a company account first, then re-run this.');
    process.exit(1);
  }
  console.log(`✅ Using company: ${company._id}`);

  const products = [
    { name: 'Mancozeb 80% WP Fungicide',      category: 'fungicide',  description: 'Protective fungicide for early blight control', unit: '500g',  diseases: ['early blight'],       price: 90  },
    { name: 'Cold-Pressed Neem Oil Spray',     category: 'pesticide',  description: 'Organic neem oil for downy mildew prevention',  unit: '1L',    diseases: ['downy mildew'],        price: 120 },
    { name: 'Copper-Based Fungicide Wettable', category: 'fungicide',  description: 'Fast-acting copper fungicide for blight',       unit: '250g',  diseases: ['early blight'],        price: 75  },
    { name: 'Nitrogen Booster Liquid',         category: 'fertilizer', description: 'Organic liquid fertilizer for nitrogen boost',  unit: '2L',    diseases: ['nitrogen deficiency'], price: 55  },
    { name: 'Azoxystrobin SC Systemic Spray',  category: 'fungicide',  description: 'Systemic spray for downy mildew treatment',     unit: '200ml', diseases: ['downy mildew'],        price: 145 },
    { name: 'Trichoderma Bio-Fungicide',       category: 'fungicide',  description: 'Bio-fungicide granules for soil treatment',     unit: '1kg',   diseases: ['early blight'],        price: 95  },
  ];

  let created = 0;
  for (const p of products) {
    const { price, ...productFields } = p;

    const product = await Product.create(productFields);

    await ProductListing.create({
      product_id:     product._id,
      company_id:     company._id,
      price,
      currency:       'EGP',
      stock_quantity: 100,
      stock_status:   'in_stock',
      is_active:      true,
      sku:            product.name.replace(/\s+/g, '-').toUpperCase().slice(0, 20),
    });

    created++;
    console.log(`  ✅ Created: ${product.name} — EGP ${price}`);
  }

  console.log(`\n🌿 Done! ${created} product listings seeded.`);
  process.exit(0);
}

seed().catch(e => { console.error('❌ Seed failed:', e.message); process.exit(1); });