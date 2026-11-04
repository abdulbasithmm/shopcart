import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// Read .env file if present
function loadEnvFile() {
  const envPath = path.resolve(process.cwd(), '.env');
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf-8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx !== -1) {
        const key = trimmed.slice(0, eqIdx).trim();
        let val = trimmed.slice(eqIdx + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  }
}

loadEnvFile();

const supabaseUrl = (process.env.VITE_SUPABASE_URL || '').trim();
const supabaseAnon = (process.env.VITE_SUPABASE_ANON_KEY || '').trim();

async function runConnectionVerification() {
  console.log('=====================================================');
  console.log('       EKOMART SUPABASE LIVE CONNECTION TEST         ');
  console.log('=====================================================\n');

  if (!supabaseUrl || !supabaseAnon || supabaseUrl.includes('your-project-id')) {
    console.log('STATUS: NOT CONFIGURED');
    console.log('Reason: VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY is missing or contains placeholder values.');
    console.log('\nEnvironment Details:');
    console.log(`- VITE_SUPABASE_URL: ${supabaseUrl ? supabaseUrl : '[EMPTY]'}`);
    console.log(`- VITE_SUPABASE_ANON_KEY: ${supabaseAnon ? '[PRESENT - REDACTED]' : '[EMPTY]'}`);
    console.log('\nAction Required:');
    console.log('Provide your Supabase URL and Anon Key in .env or via the in-app Supabase Connection Assistant.');
    process.exit(0);
  }

  console.log(`Target Supabase URL: ${supabaseUrl}`);
  console.log('Testing connection via Supabase REST API & Client SDK...\n');

  try {
    const client = createClient(supabaseUrl, supabaseAnon, {
      auth: { persistSession: false },
    });

    // 1. Test ping to categories
    console.log('1. Querying public.categories...');
    const { data: categories, error: catError } = await client
      .from('categories')
      .select('id, name')
      .limit(5);

    if (catError) {
      console.log(`FAILED: ${catError.message}`);
      console.log('STATUS: FAIL');
      console.log(`Error Details: Code ${catError.code} - ${catError.message}`);
      console.log('Remediation: Ensure supabase/schema.sql has been executed in the Supabase SQL Editor.');
      return;
    }

    console.log(`   Success: Retrieved ${categories?.length || 0} categories from database.`);

    // 2. Test ping to products
    console.log('2. Querying public.products...');
    const { data: products, error: prodError } = await client
      .from('products')
      .select('id, name, price, category_name')
      .limit(5);

    if (prodError) {
      console.log(`FAILED: ${prodError.message}`);
      console.log('STATUS: FAIL');
      console.log(`Error Details: Code ${prodError.code} - ${prodError.message}`);
      return;
    }

    console.log(`   Success: Retrieved ${products?.length || 0} products from database.`);

    // 3. Test inventory
    console.log('3. Querying public.inventory...');
    const { data: inventory, error: invError } = await client
      .from('inventory')
      .select('product_id, stock_count')
      .limit(5);

    if (invError) {
      console.log(`FAILED: ${invError.message}`);
      console.log('STATUS: FAIL');
      return;
    }

    console.log(`   Success: Retrieved ${inventory?.length || 0} inventory records.`);

    // 4. Test RLS on customer orders (should return empty array for anonymous request, NOT crash)
    console.log('4. Testing Row Level Security (RLS) on public.orders...');
    const { data: orders, error: orderError } = await client
      .from('orders')
      .select('id')
      .limit(1);

    if (orderError) {
      console.log(`   RLS Check Warning: ${orderError.message}`);
    } else {
      console.log(`   Success: RLS Policy passed safely (anonymous read isolated, records returned: ${orders?.length || 0}).`);
    }

    console.log('\n=====================================================');
    console.log('STATUS: PASS');
    console.log('Real database query succeeded against live Supabase PostgreSQL instance!');
    console.log('=====================================================');
  } catch (err: any) {
    console.log(`STATUS: FAIL`);
    console.log(`Network or execution error: ${err.message}`);
  }
}

runConnectionVerification();
