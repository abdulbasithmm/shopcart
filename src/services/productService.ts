import { Product } from '../types';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { PRODUCTS, CATEGORIES } from '../data/mockData';

// Helper to map Supabase database row to domain Product interface
export function mapSupabaseProductToDomain(row: any, inventoryCount?: number): Product {
  return {
    id: row.id,
    name: row.name,
    brand: row.brand,
    category: row.category_name || row.category_id,
    price: Number(row.price),
    originalPrice: Number(row.original_price),
    rating: Number(row.rating || 5.0),
    reviewsCount: Number(row.reviews_count || 0),
    inStock: inventoryCount !== undefined ? inventoryCount > 0 : true,
    stockCount: inventoryCount !== undefined ? inventoryCount : 20,
    isFeatured: Boolean(row.is_featured),
    isBestSeller: Boolean(row.is_bestseller),
    isSpecialOffer: Boolean(row.is_special_offer),
    isNewArrival: Boolean(row.is_new_arrival),
    claimedPercentage: Number(row.claimed_percentage || 0),
    discountPercentage: Number(row.discount_percentage || 0),
    badge: row.badge || undefined,
    shortDescription: row.short_description || '',
    fullDescription: row.full_description || '',
    features: Array.isArray(row.features) ? row.features : [],
    specs: (row.specs && typeof row.specs === 'object') ? row.specs : {},
    colors: Array.isArray(row.colors) ? row.colors : [],
    sizes: Array.isArray(row.sizes) ? row.sizes : [],
    visualType: row.visual_type || 'headphones',
    accentColor: row.accent_color || '#f97316',
    tags: Array.isArray(row.tags) ? row.tags : [],
    images: (Array.isArray(row.images) && row.images.length > 0)
      ? row.images
      : (typeof row.images === 'string' && row.images.startsWith('[')
        ? JSON.parse(row.images)
        : (Array.isArray(row.specs?._gallery_images) && row.specs._gallery_images.length > 0
          ? row.specs._gallery_images
          : (row.image_url ? [row.image_url] : []))),
    image: (Array.isArray(row.images) && row.images[0]) ||
      (Array.isArray(row.specs?._gallery_images) && row.specs._gallery_images[0]) ||
      row.image_url || undefined,
  };
}

export interface FetchProductsFilter {
  category?: string;
  searchQuery?: string;
  minPrice?: number;
  maxPrice?: number;
  sortBy?: 'featured' | 'price-low' | 'price-high' | 'rating' | 'newest';
  inStockOnly?: boolean;
}

/**
 * Fetch all categories from Supabase, or fallback to mock data
 */
export async function fetchCategories(): Promise<{ id: string; name: string; count: number; icon: string }[]> {
  if (!isSupabaseConfigured()) {
    return CATEGORIES;
  }

  try {
    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .order('name', { ascending: true });

    if (error || !data || data.length === 0) {
      console.warn('Supabase categories fetch error, using local fallback:', error?.message);
      return CATEGORIES;
    }

    return data.map((cat: any) => ({
      id: cat.id,
      name: cat.name,
      count: 0,
      icon: cat.icon || 'LayoutGrid',
    }));
  } catch (err) {
    console.warn('Unexpected error in fetchCategories:', err);
    return CATEGORIES;
  }
}

/**
 * Fetch products from Supabase with relational inventory and filters
 */
export async function fetchProducts(filters?: FetchProductsFilter): Promise<{
  products: Product[];
  isFromSupabase: boolean;
}> {
  if (!isSupabaseConfigured()) {
    let result = [...PRODUCTS];

    if (filters) {
      if (filters.category && filters.category !== 'all') {
        result = result.filter(
          (p) => p.category.toLowerCase() === filters.category!.toLowerCase()
        );
      }
      if (filters.searchQuery) {
        const q = filters.searchQuery.toLowerCase();
        result = result.filter(
          (p) =>
            p.name.toLowerCase().includes(q) ||
            p.brand.toLowerCase().includes(q) ||
            p.tags.some((t) => t.toLowerCase().includes(q))
        );
      }
      if (filters.minPrice !== undefined) {
        result = result.filter((p) => p.price >= filters.minPrice!);
      }
      if (filters.maxPrice !== undefined) {
        result = result.filter((p) => p.price <= filters.maxPrice!);
      }
      if (filters.inStockOnly) {
        result = result.filter((p) => p.inStock);
      }
      if (filters.sortBy) {
        switch (filters.sortBy) {
          case 'price-low':
            result.sort((a, b) => a.price - b.price);
            break;
          case 'price-high':
            result.sort((a, b) => b.price - a.price);
            break;
          case 'rating':
            result.sort((a, b) => b.rating - a.rating);
            break;
          case 'newest':
            result.sort((a, b) => (b.isNewArrival ? 1 : 0) - (a.isNewArrival ? 1 : 0));
            break;
          default:
            result.sort((a, b) => (b.isFeatured ? 1 : 0) - (a.isFeatured ? 1 : 0));
        }
      }
    }

    return { products: result, isFromSupabase: false };
  }

  try {
    let query = supabase
      .from('products')
      .select('*, inventory(stock_count)')
      .eq('is_active', true);

    if (filters?.category && filters.category !== 'all') {
      query = query.ilike('category_name', filters.category);
    }

    if (filters?.searchQuery) {
      query = query.or(`name.ilike.%${filters.searchQuery}%,brand.ilike.%${filters.searchQuery}%,short_description.ilike.%${filters.searchQuery}%`);
    }

    if (filters?.minPrice !== undefined) {
      query = query.gte('price', filters.minPrice);
    }

    if (filters?.maxPrice !== undefined) {
      query = query.lte('price', filters.maxPrice);
    }

    if (filters?.sortBy) {
      switch (filters.sortBy) {
        case 'price-low':
          query = query.order('price', { ascending: true });
          break;
        case 'price-high':
          query = query.order('price', { ascending: false });
          break;
        case 'rating':
          query = query.order('rating', { ascending: false });
          break;
        case 'newest':
          query = query.order('created_at', { ascending: false });
          break;
        default:
          query = query.order('is_featured', { ascending: false });
      }
    } else {
      query = query.order('is_featured', { ascending: false });
    }

    const { data, error } = await query;

    if (error || !data || data.length === 0) {
      console.warn('Supabase products fetch failed or empty, using fallback:', error?.message);
      return { products: PRODUCTS, isFromSupabase: false };
    }

    let mapped = data.map((item: any) => {
      const invCount = Array.isArray(item.inventory)
        ? item.inventory[0]?.stock_count
        : item.inventory?.stock_count;
      return mapSupabaseProductToDomain(item, invCount);
    });

    if (filters?.inStockOnly) {
      mapped = mapped.filter((p) => p.inStock);
    }

    return { products: mapped, isFromSupabase: true };
  } catch (err) {
    console.warn('Error fetching products from Supabase:', err);
    return { products: PRODUCTS, isFromSupabase: false };
  }
}

/**
 * Fetch a single product by ID from Supabase
 */
export async function fetchProductById(productId: string): Promise<{ product: Product | null; isFromSupabase: boolean }> {
  if (!isSupabaseConfigured()) {
    const found = PRODUCTS.find((p) => p.id === productId) || null;
    return { product: found, isFromSupabase: false };
  }

  try {
    const { data, error } = await supabase
      .from('products')
      .select('*, inventory(stock_count)')
      .eq('id', productId)
      .maybeSingle();

    if (error || !data) {
      const found = PRODUCTS.find((p) => p.id === productId) || null;
      return { product: found, isFromSupabase: false };
    }

    const invCount = Array.isArray(data.inventory)
      ? data.inventory[0]?.stock_count
      : data.inventory?.stock_count;

    return { product: mapSupabaseProductToDomain(data, invCount), isFromSupabase: true };
  } catch (err) {
    console.warn('Error fetching product from Supabase:', err);
    const found = PRODUCTS.find((p) => p.id === productId) || null;
    return { product: found, isFromSupabase: false };
  }
}

/**
 * Validate and upload a product image to Supabase Storage bucket 'product-images'.
 * Gracefully falls back to local data URL if storage is unconfigured or offline.
 */
export async function uploadProductImage(
  file: File,
  productId: string,
  slotIndex: number
): Promise<{ url: string; error?: string }> {
  // 1. Validation: Allowed formats
  const validMimes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
  if (!validMimes.includes(file.type.toLowerCase())) {
    return {
      url: '',
      error: `Invalid file format: "${file.type || 'unknown'}". Please upload JPG, JPEG, PNG, or WEBP images.`,
    };
  }

  // 2. Validation: Max 5MB file size
  const maxBytes = 5 * 1024 * 1024; // 5MB
  if (file.size > maxBytes) {
    const sizeInMB = (file.size / (1024 * 1024)).toFixed(1);
    return {
      url: '',
      error: `File is too large (${sizeInMB} MB). Maximum allowed size is 5 MB.`,
    };
  }

  // Helper to convert to base64 Data URL
  const toDataUrl = (): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = (err) => reject(err);
      reader.readAsDataURL(file);
    });

  // If Supabase is configured, attempt real upload to Supabase Storage 'product-images' bucket
  if (isSupabaseConfigured()) {
    try {
      const cleanExt = (file.name.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '');
      const filePath = `products/${productId}/slot-${slotIndex}-${Date.now()}.${cleanExt}`;

      const { data: uploadData, error: uploadErr } = await supabase.storage
        .from('product-images')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: true,
          contentType: file.type,
        });

      if (!uploadErr && uploadData?.path) {
        const { data: pubData } = supabase.storage
          .from('product-images')
          .getPublicUrl(uploadData.path);

        if (pubData?.publicUrl) {
          return { url: pubData.publicUrl };
        }
      }

      console.warn('Supabase storage upload fallback to base64:', uploadErr?.message);
      // Fallback to Data URL if bucket is not yet provisioned on user's remote project
      const dataUrl = await toDataUrl();
      return { url: dataUrl };
    } catch (err: any) {
      console.warn('Storage exception, using base64 preview:', err);
      const dataUrl = await toDataUrl();
      return { url: dataUrl };
    }
  }

  // Local / Demo mode fallback: Instant base64 Data URL
  try {
    const dataUrl = await toDataUrl();
    return { url: dataUrl };
  } catch (err: any) {
    return { url: '', error: err.message || 'Failed to read image file' };
  }
}

/**
 * Admin: Add a new product to Supabase with full 4-image gallery support
 */
export async function createAdminProduct(productData: Partial<Product>, stock = 10): Promise<{ success: boolean; error?: string }> {
  const prodId = productData.id || `eko-prod-${Date.now()}`;
  const images = Array.isArray(productData.images) ? productData.images.filter(Boolean) : [];
  const mainImage = images[0] || productData.image || null;

  if (!isSupabaseConfigured()) {
    const newProd: Product = {
      id: prodId,
      name: productData.name || 'New Product',
      brand: productData.brand || 'Shop Cart',
      category: productData.category || 'Electronics',
      price: Number(productData.price) || 99,
      originalPrice: Number(productData.originalPrice) || Number(productData.price) || 129,
      rating: 5.0,
      reviewsCount: 0,
      inStock: stock > 0,
      stockCount: stock,
      isFeatured: Boolean(productData.isFeatured),
      isBestSeller: Boolean(productData.isBestSeller),
      isSpecialOffer: Boolean(productData.isSpecialOffer),
      isNewArrival: true,
      shortDescription: productData.shortDescription || 'High quality product curated by Shop Cart.',
      fullDescription: productData.fullDescription || 'Crafted with premium materials and backed by our satisfaction guarantee.',
      features: productData.features || ['Premium build', '1-year warranty', 'Fast dispatch'],
      specs: productData.specs || { Brand: productData.brand || 'Shop Cart' },
      colors: productData.colors || [{ name: 'Standard', hex: '#334155' }],
      visualType: productData.visualType || 'headphones',
      accentColor: productData.accentColor || '#f97316',
      tags: productData.tags || ['New', 'Featured'],
      images,
      image: mainImage || undefined,
    };
    PRODUCTS.unshift(newProd);
    return { success: true };
  }

  try {
    // 1. Prepare product row matching Supabase schema exactly
    const productRow: any = {
      id: prodId,
      name: productData.name,
      brand: productData.brand || 'Shop Cart',
      category_name: productData.category || 'Electronics',
      price: productData.price,
      original_price: productData.originalPrice || productData.price,
      rating: 5.0,
      reviews_count: 0,
      is_active: true,
      is_featured: Boolean(productData.isFeatured),
      is_bestseller: Boolean(productData.isBestSeller),
      is_special_offer: Boolean(productData.isSpecialOffer),
      is_new_arrival: true,
      discount_percentage: productData.discountPercentage || 0,
      badge: productData.badge || 'New',
      short_description: productData.shortDescription || 'Curated by Shop Cart',
      full_description: productData.fullDescription || 'Premium craftsmanship and durable design.',
      features: productData.features || [],
      specs: productData.specs || {},
      colors: productData.colors || [{ name: 'Default', hex: '#334155' }],
      sizes: productData.sizes || [],
      visual_type: productData.visualType || 'headphones',
      accent_color: productData.accentColor || '#f97316',
      tags: productData.tags || ['New'],
      images, // Stores full array of 4 gallery slots in JSONB column
      image_url: mainImage,
    };

    // Primary insert attempt using public.products.images JSONB column
    let { error: prodErr } = await supabase.from('products').insert(productRow);

    // Handle "Could not find the 'images' column of 'products' in the schema cache"
    if (prodErr && prodErr.message && (prodErr.message.toLowerCase().includes("'images' column") || (prodErr as any).code === 'PGRST204')) {
      console.warn("PostgREST schema cache missing 'images' column. Triggering schema reload & applying resilient fallback...");
      
      // Attempt schema reload RPC
      try {
        await supabase.rpc('refresh_schema_cache');
      } catch {
        // ignore if RPC not yet created
      }

      // Retry with images column in case reload immediately registered
      const retryRes = await supabase.from('products').insert(productRow);
      if (!retryRes.error) {
        prodErr = null;
      } else {
        // Fallback: preserve all 4 gallery images by embedding them in specs._gallery_images and image_url
        const fallbackRow = { ...productRow };
        delete fallbackRow.images;
        fallbackRow.image_url = mainImage;
        fallbackRow.specs = {
          ...(fallbackRow.specs || {}),
          _gallery_images: images,
        };

        const fallbackRes = await supabase.from('products').insert(fallbackRow);
        if (!fallbackRes.error) {
          prodErr = null;
        } else {
          prodErr = fallbackRes.error;
        }
      }
    }

    if (prodErr) {
      console.error('Error inserting product in Supabase:', prodErr);
      return { success: false, error: prodErr.message };
    }

    // 2. Insert inventory row with onConflict handling
    const { error: invErr } = await supabase.from('inventory').upsert(
      {
        product_id: prodId,
        stock_count: stock,
        low_stock_threshold: 5,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'product_id' }
    );

    if (invErr) {
      console.warn('Inventory record upsert warning:', invErr.message);
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * Admin: Update product details and inventory in Supabase with 4-image gallery support
 */
export async function updateAdminProduct(productId: string, updates: Partial<Product>, stock?: number): Promise<{ success: boolean; error?: string }> {
  if (!isSupabaseConfigured()) {
    const idx = PRODUCTS.findIndex((p) => p.id === productId);
    if (idx !== -1) {
      PRODUCTS[idx] = {
        ...PRODUCTS[idx],
        ...updates,
        stockCount: stock !== undefined ? stock : PRODUCTS[idx].stockCount,
        inStock: stock !== undefined ? stock > 0 : PRODUCTS[idx].inStock,
      };
      if (updates.images) {
        PRODUCTS[idx].images = updates.images;
        PRODUCTS[idx].image = updates.images[0] || undefined;
      }
    }
    return { success: true };
  }

  try {
    const payload: any = { updated_at: new Date().toISOString() };
    if (updates.name !== undefined) payload.name = updates.name;
    if (updates.brand !== undefined) payload.brand = updates.brand;
    if (updates.category !== undefined) payload.category_name = updates.category;
    if (updates.price !== undefined) payload.price = updates.price;
    if (updates.originalPrice !== undefined) payload.original_price = updates.originalPrice;
    if (updates.discountPercentage !== undefined) payload.discount_percentage = updates.discountPercentage;
    if (updates.badge !== undefined) payload.badge = updates.badge;
    if (updates.shortDescription !== undefined) payload.short_description = updates.shortDescription;
    if (updates.fullDescription !== undefined) payload.full_description = updates.fullDescription;
    if (updates.visualType !== undefined) payload.visual_type = updates.visualType;
    if (updates.images !== undefined) {
      const cleanImages = updates.images.filter(Boolean);
      payload.images = cleanImages;
      payload.image_url = cleanImages[0] || null;
    }

    let { error } = await supabase.from('products').update(payload).eq('id', productId);

    // Handle "Could not find the 'images' column of 'products' in the schema cache" during update
    if (error && error.message && (error.message.toLowerCase().includes("'images' column") || (error as any).code === 'PGRST204')) {
      console.warn("PostgREST schema cache missing 'images' column during update. Applying resilient fallback...");
      
      try {
        await supabase.rpc('refresh_schema_cache');
      } catch {
        // ignore
      }

      const retryRes = await supabase.from('products').update(payload).eq('id', productId);
      if (!retryRes.error) {
        error = null;
      } else {
        const fallbackPayload = { ...payload };
        delete fallbackPayload.images;
        fallbackPayload.image_url = (updates.images && updates.images.filter(Boolean)[0]) || null;
        if (updates.images) {
          fallbackPayload.specs = {
            ...(updates.specs || {}),
            _gallery_images: updates.images.filter(Boolean),
          };
        }
        const fallbackRes = await supabase.from('products').update(fallbackPayload).eq('id', productId);
        if (!fallbackRes.error) {
          error = null;
        } else {
          error = fallbackRes.error;
        }
      }
    }

    if (error) return { success: false, error: error.message };

    if (stock !== undefined) {
      await supabase.from('inventory').upsert(
        {
          product_id: productId,
          stock_count: stock,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'product_id' }
      );
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * On-demand reload of Supabase / PostgREST schema cache
 */
export async function refreshSupabaseSchemaCache(): Promise<{ success: boolean; message: string }> {
  if (!isSupabaseConfigured()) {
    return { success: false, message: 'Supabase is not configured' };
  }

  try {
    const { error: rpcErr } = await supabase.rpc('refresh_schema_cache');
    if (!rpcErr) {
      return { success: true, message: 'Schema cache refreshed successfully via NOTIFY pgrst, "reload schema"!' };
    }
  } catch {
    // ignore
  }

  try {
    const { error: pingErr } = await supabase.from('products').select('id, name, image_url').limit(1);
    if (!pingErr) {
      return {
        success: true,
        message: 'Supabase products table connection verified. Run NOTIFY pgrst, "reload schema"; in SQL Editor if columns were recently modified.',
      };
    }
    return { success: false, message: pingErr.message };
  } catch (err: any) {
    return { success: false, message: err.message || 'Failed to ping Supabase' };
  }
}

/**
 * Admin: Delete product
 */
export async function deleteAdminProduct(productId: string): Promise<{ success: boolean; error?: string }> {
  if (!isSupabaseConfigured()) {
    const idx = PRODUCTS.findIndex((p) => p.id === productId);
    if (idx !== -1) PRODUCTS.splice(idx, 1);
    return { success: true };
  }

  try {
    const { error } = await supabase.from('products').delete().eq('id', productId);
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * Admin: Update stock count directly
 */
export async function updateAdminStock(productId: string, stockCount: number): Promise<{ success: boolean; error?: string }> {
  if (!isSupabaseConfigured()) {
    const prod = PRODUCTS.find((p) => p.id === productId);
    if (prod) {
      prod.stockCount = stockCount;
      prod.inStock = stockCount > 0;
    }
    return { success: true };
  }

  try {
    const { error } = await supabase
      .from('inventory')
      .update({ stock_count: stockCount, updated_at: new Date().toISOString() })
      .eq('product_id', productId);

    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

