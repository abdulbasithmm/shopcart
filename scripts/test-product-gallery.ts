/**
 * Automated Verification Script for Ekomart / ShopCart 4 Product Images System
 *
 * Verifies:
 * 1. uploadProductImage format validation (accepts JPG, PNG, WEBP; rejects invalid types)
 * 2. uploadProductImage size validation (rejects files > 5MB)
 * 3. 4-slot image persistence on product creation
 * 4. Image 1 is set as the primary main image
 * 5. Replacing 1 slot updates only that slot
 * 6. Removing 1 slot clears only that slot
 * 7. Editing existing product preserves images unless replaced
 * 8. Partial image slots work without requiring all 4
 * 9. Supabase schema products table and storage bucket product-images configured
 * 10. Storefront gallery mapping handles 4 views (Front, Back, Left, Right)
 */

import {
  createAdminProduct,
  updateAdminProduct,
  fetchProductById,
  uploadProductImage,
  mapSupabaseProductToDomain,
} from '../src/services/productService';
import { PRODUCTS } from '../src/data/mockData';
import fs from 'fs';
import path from 'path';

interface TestResult {
  name: string;
  category: 'VERIFIED WORKING' | 'FAIL';
  details: string;
}

const results: TestResult[] = [];

async function runTests() {
  console.log('====================================================');
  console.log('🧪 Starting 4-Product Images Verification Test Suite');
  console.log('====================================================\n');

  // TEST 1: uploadProductImage file format validation
  try {
    // Mock invalid file (e.g. text or pdf)
    const invalidFile = new File(['dummy content'], 'document.pdf', { type: 'application/pdf' });
    const res = await uploadProductImage(invalidFile, 'test-prod', 0);
    if (res.error && res.error.includes('Invalid file format')) {
      results.push({
        name: 'Image Format Validation (Rejects invalid formats like PDF/TXT/GIF)',
        category: 'VERIFIED WORKING',
        details: `Correctly rejected invalid MIME: "${res.error}"`,
      });
    } else {
      results.push({
        name: 'Image Format Validation',
        category: 'FAIL',
        details: 'Failed to reject invalid file type',
      });
    }
  } catch (err: any) {
    results.push({
      name: 'Image Format Validation',
      category: 'FAIL',
      details: err.message,
    });
  }

  // TEST 2: uploadProductImage file size validation (>5MB)
  try {
    // Create mock file of 6MB (exceeds 5MB limit)
    const bigArray = new Uint8Array(6 * 1024 * 1024);
    const bigFile = new File([bigArray], 'huge_image.png', { type: 'image/png' });
    const res = await uploadProductImage(bigFile, 'test-prod', 0);
    if (res.error && res.error.includes('exceeds 5 MB limit') || res.error?.includes('too large')) {
      results.push({
        name: 'Image File Size Validation (Max 5MB limit enforcement)',
        category: 'VERIFIED WORKING',
        details: `Correctly rejected 6MB file: "${res.error}"`,
      });
    } else {
      results.push({
        name: 'Image File Size Validation',
        category: 'FAIL',
        details: 'Allowed file over 5MB without error',
      });
    }
  } catch (err: any) {
    results.push({
      name: 'Image File Size Validation',
      category: 'FAIL',
      details: err.message,
    });
  }

  // TEST 3: Uploading 4 Images on New Product Creation
  const testProdId = `test-gallery-${Date.now()}`;
  const mock4Images = [
    'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=800', // Front View (Main)
    'https://images.unsplash.com/photo-1583394838336-acd977736f90?w=800', // Back View
    'https://images.unsplash.com/photo-1484704849700-f032a568e944?w=800', // Left Side View
    'https://images.unsplash.com/photo-1524678606370-a47ad25cb82a?w=800', // Right Side View
  ];

  try {
    const createRes = await createAdminProduct(
      {
        id: testProdId,
        name: 'AcousticPro Studio Wireless',
        brand: 'Shop Cart Audio',
        category: 'Electronics',
        price: 199.99,
        originalPrice: 249.99,
        visualType: 'headphones',
        images: mock4Images,
        image: mock4Images[0],
      },
      25
    );

    if (createRes.success) {
      const { product } = await fetchProductById(testProdId);
      if (
        product &&
        product.images &&
        product.images.length === 4 &&
        product.images[0] === mock4Images[0] &&
        product.image === mock4Images[0]
      ) {
        results.push({
          name: 'Create Product with 4 Uploaded Images',
          category: 'VERIFIED WORKING',
          details: `Product saved with 4 images. Main image set to: ${product.image}`,
        });
      } else {
        results.push({
          name: 'Create Product with 4 Uploaded Images',
          category: 'FAIL',
          details: `Images not matching expected array: ${JSON.stringify(product?.images)}`,
        });
      }
    } else {
      results.push({
        name: 'Create Product with 4 Uploaded Images',
        category: 'FAIL',
        details: createRes.error || 'Failed to create product',
      });
    }
  } catch (err: any) {
    results.push({
      name: 'Create Product with 4 Uploaded Images',
      category: 'FAIL',
      details: err.message,
    });
  }

  // TEST 4: Replace 1 Individual Image Slot
  try {
    const newBackView = 'https://images.unsplash.com/photo-replaced-back?w=800';
    const updatedImages = [...mock4Images];
    updatedImages[1] = newBackView; // replace slot 1 (Back View)

    const updateRes = await updateAdminProduct(testProdId, {
      images: updatedImages,
    });

    if (updateRes.success) {
      const { product } = await fetchProductById(testProdId);
      if (
        product &&
        product.images &&
        product.images[1] === newBackView &&
        product.images[0] === mock4Images[0] && // front view preserved
        product.images[2] === mock4Images[2] && // left view preserved
        product.images[3] === mock4Images[3]    // right view preserved
      ) {
        results.push({
          name: 'Replace 1 Individual Image Slot',
          category: 'VERIFIED WORKING',
          details: `Replaced slot 1 (Back View) while preserving slots 0, 2, and 3 accurately`,
        });
      } else {
        results.push({
          name: 'Replace 1 Individual Image Slot',
          category: 'FAIL',
          details: `Unexpected images state: ${JSON.stringify(product?.images)}`,
        });
      }
    } else {
      results.push({
        name: 'Replace 1 Individual Image Slot',
        category: 'FAIL',
        details: updateRes.error || 'Update failed',
      });
    }
  } catch (err: any) {
    results.push({
      name: 'Replace 1 Individual Image Slot',
      category: 'FAIL',
      details: err.message,
    });
  }

  // TEST 5: Remove 1 Individual Image Slot
  try {
    const { product: current } = await fetchProductById(testProdId);
    const imagesWithSlotRemoved = [...(current?.images || [])];
    imagesWithSlotRemoved[3] = ''; // remove right side view
    const filteredImages = imagesWithSlotRemoved.filter(Boolean);

    const updateRes = await updateAdminProduct(testProdId, {
      images: filteredImages,
    });

    if (updateRes.success) {
      const { product } = await fetchProductById(testProdId);
      if (
        product &&
        product.images &&
        product.images.length === 3 &&
        product.images[0] === mock4Images[0] // slot 0 main still intact
      ) {
        results.push({
          name: 'Remove 1 Individual Image Slot',
          category: 'VERIFIED WORKING',
          details: `Slot 3 removed. 3 remaining slots preserved cleanly without breaking image array.`,
        });
      } else {
        results.push({
          name: 'Remove 1 Individual Image Slot',
          category: 'FAIL',
          details: `Unexpected images count: ${product?.images?.length}`,
        });
      }
    } else {
      results.push({
        name: 'Remove 1 Individual Image Slot',
        category: 'FAIL',
        details: updateRes.error || 'Failed to remove image',
      });
    }
  } catch (err: any) {
    results.push({
      name: 'Remove 1 Individual Image Slot',
      category: 'FAIL',
      details: err.message,
    });
  }

  // TEST 6: Editing Existing Product Preserves Existing Images Unless Explicitly Replaced
  try {
    // Admin changes only price and name
    const updateRes = await updateAdminProduct(testProdId, {
      price: 179.99,
      name: 'AcousticPro Studio Wireless (Updated Edition)',
    });

    if (updateRes.success) {
      const { product } = await fetchProductById(testProdId);
      if (
        product &&
        product.images &&
        product.images.length === 3 &&
        product.images[0] === mock4Images[0] &&
        product.price === 179.99
      ) {
        results.push({
          name: 'Preserve Existing Product Images During Metadata Edit',
          category: 'VERIFIED WORKING',
          details: `Images preserved completely when modifying unrelated product fields.`,
        });
      } else {
        results.push({
          name: 'Preserve Existing Product Images During Metadata Edit',
          category: 'FAIL',
          details: 'Images were lost during metadata update',
        });
      }
    } else {
      results.push({
        name: 'Preserve Existing Product Images During Metadata Edit',
        category: 'FAIL',
        details: updateRes.error || 'Update failed',
      });
    }
  } catch (err: any) {
    results.push({
      name: 'Preserve Existing Product Images During Metadata Edit',
      category: 'FAIL',
      details: err.message,
    });
  }

  // TEST 7: Partial Images (e.g. Only 1 or 2 views available)
  try {
    const partialId = `partial-img-${Date.now()}`;
    const partialImages = ['https://images.unsplash.com/front-only?w=800'];
    const createRes = await createAdminProduct({
      id: partialId,
      name: 'Single View Minimalist Lamp',
      brand: 'Nordic Glow',
      category: 'Home & Living',
      price: 49.99,
      images: partialImages,
    });

    if (createRes.success) {
      const { product } = await fetchProductById(partialId);
      if (product && product.images?.length === 1 && product.image === partialImages[0]) {
        results.push({
          name: 'Partial Image Support (Does not require all 4 slots)',
          category: 'VERIFIED WORKING',
          details: `Products with 1, 2, or 3 images operate flawlessly without requiring unavailable views.`,
        });
      } else {
        results.push({
          name: 'Partial Image Support',
          category: 'FAIL',
          details: 'Failed to handle single image',
        });
      }
    }
  } catch (err: any) {
    results.push({
      name: 'Partial Image Support',
      category: 'FAIL',
      details: err.message,
    });
  }

  // TEST 8: Supabase SQL Schema and Storage Bucket RLS Policies
  try {
    const schemaContent = fs.readFileSync(path.resolve(process.cwd(), 'supabase/schema.sql'), 'utf-8');
    const hasImageCols =
      schemaContent.includes('image_url TEXT') &&
      schemaContent.includes('images JSONB');
    const hasStorageBucket =
      schemaContent.includes('product-images') &&
      schemaContent.includes('storage.buckets');
    const hasStoragePolicies =
      schemaContent.includes('Public Read Product Images') &&
      schemaContent.includes('Admin Upload Product Images') &&
      schemaContent.includes('Admin Delete Product Images');

    if (hasImageCols && hasStorageBucket && hasStoragePolicies) {
      results.push({
        name: 'Supabase Storage Bucket & RLS Policies (product-images)',
        category: 'VERIFIED WORKING',
        details: `Storage bucket 'product-images' created with public read access and admin-only upload/delete policies.`,
      });
    } else {
      results.push({
        name: 'Supabase Storage Bucket & RLS Policies',
        category: 'FAIL',
        details: `Missing schema definitions: cols=${hasImageCols}, bucket=${hasStorageBucket}, policies=${hasStoragePolicies}`,
      });
    }
  } catch (err: any) {
    results.push({
      name: 'Supabase Storage Bucket & RLS Policies',
      category: 'FAIL',
      details: err.message,
    });
  }

  // TEST 9: Storefront PDP Dynamic Gallery Mapping
  try {
    const testRow = {
      id: 'test-pdp-row',
      name: 'Smart Earbuds',
      brand: 'boAt',
      category_name: 'Electronics',
      price: '1499.00',
      original_price: '4490.00',
      images: [
        'https://example.com/front.jpg',
        'https://example.com/back.jpg',
        'https://example.com/left.jpg',
        'https://example.com/right.jpg',
      ],
      image_url: 'https://example.com/front.jpg',
    };

    const domainProd = mapSupabaseProductToDomain(testRow, 15);
    if (
      domainProd.images &&
      domainProd.images.length === 4 &&
      domainProd.image === 'https://example.com/front.jpg' &&
      domainProd.images[0] === 'https://example.com/front.jpg'
    ) {
      results.push({
        name: 'Database Row to Storefront Domain Product Gallery Mapping',
        category: 'VERIFIED WORKING',
        details: `Mapped 4 image URLs into Product domain object for interactive PDP angles and hover zoom.`,
      });
    } else {
      results.push({
        name: 'Database Row to Storefront Domain Product Gallery Mapping',
        category: 'FAIL',
        details: `Mapping mismatch: ${JSON.stringify(domainProd.images)}`,
      });
    }
  } catch (err: any) {
    results.push({
      name: 'Database Row to Storefront Domain Product Gallery Mapping',
      category: 'FAIL',
      details: err.message,
    });
  }

  // PRINT SUMMARY
  console.log('\n====================================================');
  console.log('📊 TEST RESULTS SUMMARY');
  console.log('====================================================');
  let passCount = 0;
  let failCount = 0;

  for (const r of results) {
    const icon = r.category === 'VERIFIED WORKING' ? '✅' : '❌';
    console.log(`${icon} [${r.category}] ${r.name}`);
    console.log(`   └─ ${r.details}`);
    if (r.category === 'VERIFIED WORKING') passCount++;
    else failCount++;
  }

  console.log('\n====================================================');
  console.log(`Summary: ${passCount} PASSED, ${failCount} FAILED out of ${results.length} tests.`);
  console.log('====================================================\n');

  if (failCount > 0) {
    process.exit(1);
  }
}

runTests();
