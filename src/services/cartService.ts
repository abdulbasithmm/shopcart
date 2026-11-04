import { CartItem } from '../types';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { fetchProductById } from './productService';

/**
 * Fetch or initialize the user's cart in Supabase
 */
export async function getOrCreateUserCartId(userId: string): Promise<string | null> {
  if (!isSupabaseConfigured() || !userId) return null;

  try {
    // Check existing cart
    const { data: existingCart, error: fetchErr } = await supabase
      .from('carts')
      .select('id')
      .eq('user_id', userId)
      .maybeSingle();

    if (fetchErr) {
      console.warn('Error fetching cart:', fetchErr.message);
      return null;
    }

    if (existingCart?.id) {
      return existingCart.id;
    }

    // Create new cart
    const { data: newCart, error: createErr } = await supabase
      .from('carts')
      .insert({ user_id: userId })
      .select('id')
      .single();

    if (createErr) {
      console.warn('Error creating cart in Supabase:', createErr.message);
      return null;
    }

    return newCart.id;
  } catch (err) {
    console.warn('Exception in getOrCreateUserCartId:', err);
    return null;
  }
}

/**
 * Fetch all cart items from Supabase for a user
 */
export async function fetchUserCartFromSupabase(userId: string): Promise<{
  cart: CartItem[];
  savedForLater: CartItem[];
}> {
  if (!isSupabaseConfigured() || !userId) {
    return { cart: [], savedForLater: [] };
  }

  try {
    const cartId = await getOrCreateUserCartId(userId);
    if (!cartId) return { cart: [], savedForLater: [] };

    const { data: items, error } = await supabase
      .from('cart_items')
      .select('*')
      .eq('cart_id', cartId);

    if (error || !items) {
      console.warn('Failed to fetch cart items from Supabase:', error?.message);
      return { cart: [], savedForLater: [] };
    }

    const cartList: CartItem[] = [];
    const savedList: CartItem[] = [];

    for (const item of items) {
      const { product } = await fetchProductById(item.product_id);
      if (product) {
        const cartItem: CartItem = {
          product,
          quantity: item.quantity,
          selectedColor: item.selected_color || undefined,
          selectedSize: item.selected_size || undefined,
        };
        if (item.is_saved_for_later) {
          savedList.push(cartItem);
        } else {
          cartList.push(cartItem);
        }
      }
    }

    return { cart: cartList, savedForLater: savedList };
  } catch (err) {
    console.warn('Exception in fetchUserCartFromSupabase:', err);
    return { cart: [], savedForLater: [] };
  }
}

/**
 * Synchronize current local cart & saved items to Supabase
 */
export async function syncCartWithSupabase(
  userId: string,
  cart: CartItem[],
  savedForLater: CartItem[]
): Promise<boolean> {
  if (!isSupabaseConfigured() || !userId) return false;

  try {
    const cartId = await getOrCreateUserCartId(userId);
    if (!cartId) return false;

    // Delete existing items for clean sync
    await supabase.from('cart_items').delete().eq('cart_id', cartId);

    const rowsToInsert = [
      ...cart.map((item) => ({
        cart_id: cartId,
        product_id: item.product.id,
        quantity: item.quantity,
        selected_color: item.selectedColor || null,
        selected_size: item.selectedSize || null,
        is_saved_for_later: false,
      })),
      ...savedForLater.map((item) => ({
        cart_id: cartId,
        product_id: item.product.id,
        quantity: item.quantity,
        selected_color: item.selectedColor || null,
        selected_size: item.selectedSize || null,
        is_saved_for_later: true,
      })),
    ];

    if (rowsToInsert.length > 0) {
      const { error: insertErr } = await supabase.from('cart_items').insert(rowsToInsert);
      if (insertErr) {
        console.warn('Error syncing items to Supabase cart:', insertErr.message);
        return false;
      }
    }

    return true;
  } catch (err) {
    console.warn('Exception in syncCartWithSupabase:', err);
    return false;
  }
}
