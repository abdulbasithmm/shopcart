import { Review } from '../types';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { MOCK_REVIEWS } from '../data/mockData';

export interface SubmitReviewInput {
  productId: string;
  rating: number;
  title: string;
  comment: string;
  authorName: string;
  userId?: string;
  userEmail?: string;
  verifiedPurchase?: boolean;
}

const STORAGE_PREFIX = 'shopcart_reviews_';

/**
 * Format a database date or ISO string into a human-readable display date
 */
function formatReviewDate(dateStr?: string): string {
  if (!dateStr) return 'Recently';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

/**
 * Convert a Supabase database row to domain Review interface
 */
function mapRowToReview(row: any): Review {
  return {
    id: row.id || `rev-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    productId: row.product_id,
    userId: row.user_id,
    author: row.author_name || 'Customer',
    rating: Number(row.rating || 5),
    date: formatReviewDate(row.created_at),
    title: row.title || 'Customer Review',
    comment: row.comment || '',
    verified: row.verified_purchase !== undefined ? Boolean(row.verified_purchase) : true,
    helpful: Number(row.helpful_votes || 0),
  };
}

/**
 * Load initial default reviews for a product if none exist
 */
function getDefaultReviewsForProduct(productId: string): Review[] {
  const existingMock = MOCK_REVIEWS.filter((r) => r.productId === productId);
  if (existingMock.length > 0) {
    return existingMock;
  }

  // Fallback high-quality curated reviews
  return [
    {
      id: `rev-${productId}-1`,
      productId,
      author: 'Rajesh K.',
      rating: 5,
      date: 'October 24, 2026',
      title: 'Exceptional quality & lightning delivery',
      comment: 'Super happy with this purchase. Everything matched the product description perfectly. Build quality is top-notch and delivery was within 24 hours.',
      verified: true,
      helpful: 14,
    },
    {
      id: `rev-${productId}-2`,
      productId,
      author: 'Sneha Verma',
      rating: 5,
      date: 'October 18, 2026',
      title: 'Value for money product',
      comment: 'Great aesthetics, durable build, and flawless everyday functionality. I will definitely recommend this to friends and family.',
      verified: true,
      helpful: 8,
    },
  ];
}

/**
 * Fetch reviews for a specific product from Supabase or local storage fallback
 */
export async function fetchReviewsByProductId(productId: string): Promise<{ reviews: Review[]; isFromSupabase: boolean }> {
  // If Supabase is connected, query the reviews table
  if (isSupabaseConfigured()) {
    try {
      const { data, error } = await supabase
        .from('reviews')
        .select('*')
        .eq('product_id', productId)
        .order('created_at', { ascending: false });

      if (!error && data && data.length > 0) {
        const mapped = data.map(mapRowToReview);
        // Sync local cache
        try {
          localStorage.setItem(`${STORAGE_PREFIX}${productId}`, JSON.stringify(mapped));
        } catch {
          // Ignore localStorage quota errors
        }
        return { reviews: mapped, isFromSupabase: true };
      }
    } catch (err) {
      console.warn('Supabase reviews fetch failed, falling back to local storage:', err);
    }
  }

  // Check localStorage cache
  try {
    const cached = localStorage.getItem(`${STORAGE_PREFIX}${productId}`);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return { reviews: parsed, isFromSupabase: false };
      }
    }
  } catch {
    // Ignore parse error
  }

  // Return default reviews
  const defaultReviews = getDefaultReviewsForProduct(productId);
  try {
    localStorage.setItem(`${STORAGE_PREFIX}${productId}`, JSON.stringify(defaultReviews));
  } catch {
    // Ignore
  }
  return { reviews: defaultReviews, isFromSupabase: false };
}

/**
 * Submit a customer review into Supabase 'reviews' table and update local cache
 */
export async function submitProductReview(
  input: SubmitReviewInput
): Promise<{ success: boolean; review: Review; message?: string; isSupabaseSaved: boolean }> {
  const newId = `rev-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
  const now = new Date().toISOString();

  const newReview: Review = {
    id: newId,
    productId: input.productId,
    userId: input.userId,
    author: input.authorName.trim(),
    rating: Math.min(5, Math.max(1, input.rating)),
    date: 'Just now',
    title: input.title.trim() || 'Verified Customer Review',
    comment: input.comment.trim(),
    verified: input.verifiedPurchase ?? true,
    helpful: 0,
  };

  let isSupabaseSaved = false;

  if (isSupabaseConfigured()) {
    try {
      const dbRow = {
        product_id: input.productId,
        user_id: input.userId || null,
        author_name: input.authorName.trim(),
        author_email: input.userEmail || null,
        rating: Math.min(5, Math.max(1, input.rating)),
        title: input.title.trim() || 'Verified Customer Review',
        comment: input.comment.trim(),
        verified_purchase: input.verifiedPurchase ?? true,
        helpful_votes: 0,
        created_at: now,
      };

      const { data, error } = await supabase
        .from('reviews')
        .insert([dbRow])
        .select()
        .single();

      if (!error && data) {
        isSupabaseSaved = true;
        newReview.id = data.id;
      } else {
        console.warn('Supabase review insert warning (falling back to local cache):', error?.message);
      }
    } catch (err: any) {
      console.warn('Supabase review insert failed, cached locally:', err?.message);
    }
  }

  // Always update local cache
  try {
    const cached = localStorage.getItem(`${STORAGE_PREFIX}${input.productId}`);
    let list: Review[] = [];
    if (cached) {
      try {
        list = JSON.parse(cached);
      } catch {
        list = [];
      }
    }
    if (!Array.isArray(list) || list.length === 0) {
      list = getDefaultReviewsForProduct(input.productId);
    }
    const updatedList = [newReview, ...list];
    localStorage.setItem(`${STORAGE_PREFIX}${input.productId}`, JSON.stringify(updatedList));
  } catch {
    // Ignore quota issues
  }

  return {
    success: true,
    review: newReview,
    isSupabaseSaved,
    message: isSupabaseSaved
      ? 'Review saved to Supabase successfully!'
      : 'Review published and stored locally!',
  };
}

/**
 * Increment helpful votes for a review
 */
export async function voteReviewHelpful(
  reviewId: string,
  productId: string,
  currentCount: number
): Promise<{ success: boolean; newCount: number }> {
  const newCount = currentCount + 1;

  if (isSupabaseConfigured()) {
    try {
      await supabase
        .from('reviews')
        .update({ helpful_votes: newCount })
        .eq('id', reviewId);
    } catch (err) {
      console.warn('Failed to update helpful votes in Supabase:', err);
    }
  }

  // Update local cache
  try {
    const cached = localStorage.getItem(`${STORAGE_PREFIX}${productId}`);
    if (cached) {
      const list: Review[] = JSON.parse(cached);
      const updated = list.map((r) => (r.id === reviewId ? { ...r, helpful: newCount } : r));
      localStorage.setItem(`${STORAGE_PREFIX}${productId}`, JSON.stringify(updated));
    }
  } catch {
    // Ignore
  }

  return { success: true, newCount };
}
