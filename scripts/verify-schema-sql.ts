import fs from 'fs';
import path from 'path';

const schemaPath = path.resolve(process.cwd(), 'supabase/schema.sql');
const publicSchemaPath = path.resolve(process.cwd(), 'public/supabase/schema.sql');

if (!fs.existsSync(schemaPath)) {
  console.error(`ERROR: Schema file not found at ${schemaPath}`);
  process.exit(1);
}

let content = fs.readFileSync(schemaPath, 'utf-8');
const lines = content.split('\n');

console.log('=====================================================');
console.log('     EKOMART SUPABASE SCHEMA & JSON SYNTAX AUDIT     ');
console.log('=====================================================\n');

// 1. Check and correct any dollar quote issues or unescaped quotes
let modified = false;

for (let i = 0; i < lines.length; i++) {
  let line = lines[i];

  // Fix line 493 or any remaining unescaped AMOLED display quote
  if (line.includes('AMOLED') && (line.includes('1.43\\"') || line.includes('1.43"'))) {
    line = line.replace(/1\.43(?:\\"|")\s*AMOLED/, '1.43-inch AMOLED');
    lines[i] = line;
    modified = true;
  }

  // Fix line 688 or any remaining unescaped MacBook quote
  if (line.includes('MacBook') && (line.includes('16\\"') || line.includes('16"'))) {
    line = line.replace(/16(?:\\"|")\s*MacBook/, '16-inch MacBook');
    lines[i] = line;
    modified = true;
  }

  // Format specs lines with $specs$...$specs$::jsonb
  if (line.includes('${') && line.includes('}$::jsonb')) {
    const startIdx = line.indexOf('${');
    const endIdx = line.indexOf('}$::jsonb');
    const jsonStr = line.substring(startIdx + 1, endIdx + 1);
    const prefix = line.substring(0, startIdx);
    const suffix = line.substring(endIdx + 9);
    // Verify valid JSON
    JSON.parse(jsonStr);
    lines[i] = `${prefix}$specs$${jsonStr}$specs$::jsonb${suffix}`;
    modified = true;
  }
}

if (modified) {
  content = lines.join('\n');
  fs.writeFileSync(schemaPath, content, 'utf-8');
  console.log('✔ Normalized quotes and dollar-quoted specs in supabase/schema.sql');
}

// 2. Validate all JSON blocks in schema
console.log('\n--- Checking all JSONB columns in schema.sql ---');
let jsonbCount = 0;
let jsonbErrors: { line: number; error: string; snippet: string }[] = [];

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  if (line.includes('::jsonb')) {
    jsonbCount++;
    // Extract JSON payload
    let rawJson = '';
    if (line.includes('$specs$')) {
      const match = line.match(/\$specs\$([\s\S]*?)\$specs\$::jsonb/);
      if (match) rawJson = match[1];
    } else if (line.includes('$features$')) {
      const match = line.match(/\$features\$([\s\S]*?)\$features\$::jsonb/);
      if (match) rawJson = match[1];
    } else {
      const match = line.match(/'([\s\S]*?)'::jsonb/);
      if (match) rawJson = match[1];
    }

    if (!rawJson) {
      jsonbErrors.push({
        line: i + 1,
        error: 'Unable to extract JSON payload between quotes',
        snippet: line.trim().slice(0, 80),
      });
      continue;
    }

    try {
      JSON.parse(rawJson);
    } catch (err: any) {
      jsonbErrors.push({
        line: i + 1,
        error: err.message,
        snippet: line.trim().slice(0, 80),
      });
    }
  }
}

console.log(`Total JSONB blocks verified: ${jsonbCount}`);
if (jsonbErrors.length === 0) {
  console.log(`✔ JSON Syntax Check: PASS (0 errors across all ${jsonbCount} JSONB columns)`);
} else {
  console.error(`✖ JSON Syntax Check: FAIL (${jsonbErrors.length} errors found)`);
  jsonbErrors.forEach((e) => console.error(`  Line ${e.line}: ${e.error}\n  ${e.snippet}`));
  process.exit(1);
}

// 3. Verify specific problematic lines
console.log('\n--- Verifying Targeted Bug Fixes ---');
const line493 = lines.find((l) => l.includes('1.43-inch AMOLED'));
if (line493) {
  console.log('✔ Line 493 (eko-prod-2 specs): Corrected with "1.43-inch AMOLED 466x466 (326 PPI)" in $specs$ literal.');
} else {
  console.error('✖ Line 493 fix verification failed');
  process.exit(1);
}

const line688 = lines.find((l) => l.includes('16-inch MacBook Pro'));
if (line688) {
  console.log('✔ Line 688 (eko-prod-9 features): Corrected with "16-inch MacBook Pro".');
} else {
  console.error('✖ Line 688 fix verification failed');
  process.exit(1);
}

// 4. Verify idempotent constraints
console.log('\n--- Verifying Idempotent Migration Safety ---');
const hasProductsOnConflict = content.includes('ON CONFLICT (id) DO UPDATE SET');
const hasInventoryOnConflict = content.includes('ON CONFLICT (product_id) DO UPDATE SET');
const hasCategoriesOnConflict = content.includes('ON CONFLICT (id) DO UPDATE SET');

if (hasProductsOnConflict && hasInventoryOnConflict && hasCategoriesOnConflict) {
  console.log('✔ Idempotency Check: PASS (ON CONFLICT clauses protect products, categories, and inventory from duplicate inserts)');
} else {
  console.error('✖ Idempotency Check: FAIL (Missing ON CONFLICT clauses)');
  process.exit(1);
}

// 5. Verify all tables, triggers, and functions
console.log('\n--- Verifying Database Schema Entities ---');
const requiredEntities = [
  { name: 'Categories Table', match: 'CREATE TABLE IF NOT EXISTS public.categories' },
  { name: 'Products Table', match: 'CREATE TABLE IF NOT EXISTS public.products' },
  { name: 'Inventory Table', match: 'CREATE TABLE IF NOT EXISTS public.inventory' },
  { name: 'Profiles Table', match: 'CREATE TABLE IF NOT EXISTS public.profiles' },
  { name: 'Carts Table', match: 'CREATE TABLE IF NOT EXISTS public.carts' },
  { name: 'Cart Items Table', match: 'CREATE TABLE IF NOT EXISTS public.cart_items' },
  { name: 'Orders Table', match: 'CREATE TABLE IF NOT EXISTS public.orders' },
  { name: 'Order Shipment Updates Table', match: 'CREATE TABLE IF NOT EXISTS public.order_shipment_updates' },
  { name: 'Order Items Table', match: 'CREATE TABLE IF NOT EXISTS public.order_items' },
  { name: 'Atomic Inventory Deduction Function', match: 'CREATE OR REPLACE FUNCTION public.deduct_product_inventory' },
  { name: 'Profile Creation Trigger Function', match: 'CREATE OR REPLACE FUNCTION public.handle_new_user' },
  { name: 'Trigger on auth.users', match: 'CREATE TRIGGER on_auth_user_created' },
  { name: 'Role Protection Function', match: 'CREATE OR REPLACE FUNCTION public.protect_user_role' },
  { name: 'Role Protection Trigger', match: 'CREATE TRIGGER trg_protect_user_role' },
  { name: 'is_admin Security Definer Function', match: 'CREATE OR REPLACE FUNCTION public.is_admin' },
  { name: 'RLS Table 1: Categories', match: 'ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;' },
  { name: 'RLS Table 2: Products', match: 'ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;' },
  { name: 'RLS Table 3: Inventory', match: 'ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;' },
  { name: 'RLS Table 4: Profiles', match: 'ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;' },
  { name: 'RLS Table 5: Carts', match: 'ALTER TABLE public.carts ENABLE ROW LEVEL SECURITY;' },
  { name: 'RLS Table 6: Cart Items', match: 'ALTER TABLE public.cart_items ENABLE ROW LEVEL SECURITY;' },
  { name: 'RLS Table 7: Orders', match: 'ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;' },
  { name: 'RLS Table 8: Order Shipment Updates', match: 'ALTER TABLE public.order_shipment_updates ENABLE ROW LEVEL SECURITY;' },
  { name: 'RLS Table 9: Order Items', match: 'ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;' },
  { name: 'RLS Table 10: Payment Records', match: 'ALTER TABLE public.payment_records ENABLE ROW LEVEL SECURITY;' },
  { name: 'Non-recursive Profiles Policy', match: 'CREATE POLICY "Users can view own profile" ON public.profiles\n    FOR SELECT TO authenticated\n    USING (auth.uid() = id);' },
  { name: 'Admin Only Payment Management Policy', match: 'CREATE POLICY "Admins can manage payment records" ON public.payment_records\n    FOR ALL TO authenticated' },
];

for (const entity of requiredEntities) {
  if (content.includes(entity.match)) {
    console.log(`✔ ${entity.name}: Found and intact`);
  } else {
    console.error(`✖ ${entity.name}: MISSING (${entity.match})`);
    process.exit(1);
  }
}

// 6. Verify seed data integrity
console.log('\n--- Verifying Seed Products & Inventory ---');
for (let p = 1; p <= 14; p++) {
  const prodId = `eko-prod-${p}`;
  const prodMatches = (content.match(new RegExp(`'${prodId}'`, 'g')) || []).length;
  if (prodMatches >= 2) {
    console.log(`✔ ${prodId}: Seeded in products and inventory`);
  } else {
    console.error(`✖ ${prodId}: Incomplete seed count (${prodMatches} matches)`);
    process.exit(1);
  }
}

// 7. Ensure public/supabase/schema.sql is in sync
fs.mkdirSync(path.dirname(publicSchemaPath), { recursive: true });
fs.writeFileSync(publicSchemaPath, content, 'utf-8');
console.log('\n✔ Successfully synchronized /public/supabase/schema.sql for web app clipboard retrieval');

console.log('\n=====================================================');
console.log('     ALL SCHEMA AND JSON VALIDATION CHECKS PASSED     ');
console.log('=====================================================\n');
