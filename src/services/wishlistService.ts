import { supabase, isSupabaseConfigured } from '../lib/supabase';

const STORAGE_PREFIX = 'shopcart_wishlist_';

/**
 * Fetch a customer's private wishlist product IDs from Supabase or local storage fallback
 */
export async function fetchUserWishlistFromSupabase(
  userId: string
): Promise<{ productIds: string[]; isFromSupabase: boolean }> {
  if (isSupabaseConfigured() && userId && !userId.startsWith('usr-demo')) {
    try {
      const { data, error } = await supabase
        .from('wishlist')
        .select('product_id')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (!error && data) {
        const productIds = data.map((row: { product_id: string }) => row.product_id);
        // Synchronize local cache for offline/instant access
        try {
          localStorage.setItem(`${STORAGE_PREFIX}${userId}`, JSON.stringify(productIds));
        } catch {
          // ignore quota
        }
        return { productIds, isFromSupabase: true };
      }
    } catch (err) {
      console.warn('Failed to fetch wishlist from Supabase, falling back to local storage:', err);
    }
  }

  // Fallback to local storage
  try {
    const userCache = localStorage.getItem(`${STORAGE_PREFIX}${userId}`);
    if (userCache) {
      return { productIds: JSON.parse(userCache), isFromSupabase: false };
    }
    const genericCache = localStorage.getItem('shopcart_wishlist');
    if (genericCache) {
      return { productIds: JSON.parse(genericCache), isFromSupabase: false };
    }
  } catch {
    // ignore
  }

  return { productIds: [], isFromSupabase: false };
}

/**
 * Add a product to customer's private wishlist in Supabase
 */
export async function addToWishlistSupabase(
  userId: string | undefined,
  productId: string
): Promise<{ success: boolean; isSupabaseSaved: boolean }> {
  let isSupabaseSaved = false;

  if (userId && isSupabaseConfigured() && !userId.startsWith('usr-demo')) {
    try {
      const { error } = await supabase
        .from('wishlist')
        .upsert(
          {
            user_id: userId,
            product_id: productId,
            created_at: new Date().toISOString(),
          },
          { onConflict: 'user_id,product_id' }
        );

      if (!error) {
        isSupabaseSaved = true;
      } else {
        console.warn('Supabase wishlist upsert warning:', error.message);
      }
    } catch (err) {
      console.warn('Supabase wishlist upsert failed:', err);
    }
  }

  // Update local storage
  try {
    if (userId) {
      const cached = localStorage.getItem(`${STORAGE_PREFIX}${userId}`);
      const list: string[] = cached ? JSON.parse(cached) : [];
      if (!list.includes(productId)) {
        list.push(productId);
        localStorage.setItem(`${STORAGE_PREFIX}${userId}`, JSON.stringify(list));
      }
    }
    const generic = localStorage.getItem('shopcart_wishlist');
    const genericList: string[] = generic ? JSON.parse(generic) : [];
    if (!genericList.includes(productId)) {
      genericList.push(productId);
      localStorage.setItem('shopcart_wishlist', JSON.stringify(genericList));
    }
  } catch {
    // ignore
  }

  return { success: true, isSupabaseSaved };
}

/**
 * Remove a product from customer's private wishlist in Supabase
 */
export async function removeFromWishlistSupabase(
  userId: string | undefined,
  productId: string
): Promise<{ success: boolean; isSupabaseSaved: boolean }> {
  let isSupabaseSaved = false;

  if (userId && isSupabaseConfigured() && !userId.startsWith('usr-demo')) {
    try {
      const { error } = await supabase
        .from('wishlist')
        .delete()
        .eq('user_id', userId)
        .eq('product_id', productId);

      if (!error) {
        isSupabaseSaved = true;
      } else {
        console.warn('Supabase wishlist delete warning:', error.message);
      }
    } catch (err) {
      console.warn('Supabase wishlist delete failed:', err);
    }
  }

  // Update local storage
  try {
    if (userId) {
      const cached = localStorage.getItem(`${STORAGE_PREFIX}${userId}`);
      if (cached) {
        const list: string[] = JSON.parse(cached);
        const updated = list.filter((id) => id !== productId);
        localStorage.setItem(`${STORAGE_PREFIX}${userId}`, JSON.stringify(updated));
      }
    }
    const generic = localStorage.getItem('shopcart_wishlist');
    if (generic) {
      const genericList: string[] = JSON.parse(generic);
      const updated = genericList.filter((id) => id !== productId);
      localStorage.setItem('shopcart_wishlist', JSON.stringify(updated));
    }
  } catch {
    // ignore
  }

  return { success: true, isSupabaseSaved };
}

/**
 * Push local wishlist items to Supabase when customer signs in
 */
export async function syncWishlistWithSupabase(
  userId: string,
  productIds: string[]
): Promise<void> {
  if (!isSupabaseConfigured() || !userId || userId.startsWith('usr-demo') || productIds.length === 0) {
    return;
  }

  try {
    const rows = productIds.map((productId) => ({
      user_id: userId,
      product_id: productId,
      created_at: new Date().toISOString(),
    }));

    await supabase
      .from('wishlist')
      .upsert(rows, { onConflict: 'user_id,product_id' });
  } catch (err) {
    console.warn('Wishlist synchronization with Supabase failed:', err);
  }
}
