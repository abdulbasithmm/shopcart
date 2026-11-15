import { Review, ReviewEligibility } from '../types';
import { getAuthHeaders } from '../lib/supabase';

export interface SubmitReviewInput {
  productId: string;
  rating: number;
  title: string;
  comment: string;
}

function formatReviewDate(dateStr?: string): string {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

function normalizeReview(raw: any): Review {
  return {
    id: raw.id,
    productId: raw.productId || raw.product_id,
    userId: raw.userId || raw.user_id,
    orderId: raw.orderId || raw.order_id || null,
    author: raw.author || raw.author_name || 'Verified Customer',
    rating: Number(raw.rating || 5),
    date: formatReviewDate(raw.date || raw.created_at),
    title: raw.title || '',
    comment: raw.comment || '',
    verified: raw.verified !== undefined ? Boolean(raw.verified) : raw.verified_purchase !== false,
    helpful: Number(raw.helpful ?? raw.helpful_votes ?? 0),
    moderationStatus: raw.moderationStatus || raw.moderation_status || 'approved',
    updatedAt: raw.updatedAt || raw.updated_at,
  };
}

/**
 * Fetch real product reviews and the current user's verified-purchase eligibility from the server.
 * Zero mock or generated fallback reviews are ever returned.
 */
export async function fetchReviewsByProductId(productId: string): Promise<{
  reviews: Review[];
  eligibility: ReviewEligibility;
}> {
  try {
    const headers = await getAuthHeaders();
    const res = await fetch(`/api/products/${encodeURIComponent(productId)}/reviews`, { headers });
    if (res.ok) {
      const data = await res.json();
      const reviews = Array.isArray(data.reviews) ? data.reviews.map(normalizeReview) : [];
      const rawElig = data.eligibility || {};
      return {
        reviews,
        eligibility: {
          canReview: Boolean(rawElig.canReview),
          hasPurchased: Boolean(rawElig.hasPurchased),
          reason: rawElig.reason,
          existingReview: rawElig.existingReview ? normalizeReview(rawElig.existingReview) : null,
        },
      };
    }
  } catch (err) {
    console.warn('Error fetching product reviews:', err);
  }

  return {
    reviews: [],
    eligibility: { canReview: false, hasPurchased: false, reason: 'unavailable', existingReview: null },
  };
}

/**
 * Submit a verified-purchase product review through server validation.
 */
export async function submitProductReview(
  input: SubmitReviewInput
): Promise<{
  success: boolean;
  review?: Review;
  message?: string;
  summary?: { rating: number; reviewsCount: number } | null;
}> {
  try {
    const headers = await getAuthHeaders({ 'Content-Type': 'application/json' });
    if (!headers.Authorization) {
      return { success: false, message: 'Please sign in to submit a verified product review.' };
    }

    const res = await fetch('/api/reviews', {
      method: 'POST',
      headers,
      body: JSON.stringify(input),
    });
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      return { success: false, message: data.error || `Failed to submit review (HTTP ${res.status}).` };
    }

    return {
      success: true,
      review: data.review ? normalizeReview(data.review) : undefined,
      summary: data.summary || null,
      message: 'Verified review published successfully.',
    };
  } catch (err: any) {
    return { success: false, message: err?.message || 'Failed to submit review.' };
  }
}

/**
 * Edit the customer's own existing review.
 */
export async function updateOwnProductReview(
  reviewId: string,
  updates: { rating: number; title: string; comment: string }
): Promise<{
  success: boolean;
  review?: Review;
  message?: string;
  summary?: { rating: number; reviewsCount: number } | null;
}> {
  try {
    const headers = await getAuthHeaders({ 'Content-Type': 'application/json' });
    const res = await fetch(`/api/reviews/${encodeURIComponent(reviewId)}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify(updates),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { success: false, message: data.error || `Failed to update review (HTTP ${res.status}).` };
    }
    return {
      success: true,
      review: data.review ? normalizeReview(data.review) : undefined,
      summary: data.summary || null,
      message: 'Review updated successfully.',
    };
  } catch (err: any) {
    return { success: false, message: err?.message || 'Failed to update review.' };
  }
}

/**
 * Record helpful vote via verified backend route.
 */
export async function voteReviewHelpful(
  reviewId: string
): Promise<{ success: boolean; newCount?: number }> {
  try {
    const res = await fetch(`/api/reviews/${encodeURIComponent(reviewId)}/helpful`, {
      method: 'POST',
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.success) {
      return { success: true, newCount: Number(data.newCount) };
    }
  } catch (err) {
    console.warn('Helpful vote error:', err);
  }
  return { success: false };
}

/**
 * Admin review moderation endpoints
 */
export async function fetchAdminReviews(): Promise<{ reviews: Review[]; error?: string }> {
  try {
    const headers = await getAuthHeaders();
    const res = await fetch('/api/admin/reviews', { headers });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { reviews: [], error: data.error || `HTTP ${res.status}` };
    return { reviews: Array.isArray(data.reviews) ? data.reviews.map(normalizeReview) : [] };
  } catch (err: any) {
    return { reviews: [], error: err?.message || 'Failed to fetch reviews' };
  }
}

export async function moderateAdminReview(
  reviewId: string,
  moderationStatus: 'approved' | 'hidden' | 'rejected'
): Promise<{ success: boolean; review?: Review; error?: string }> {
  try {
    const headers = await getAuthHeaders({ 'Content-Type': 'application/json' });
    const res = await fetch(`/api/admin/reviews/${encodeURIComponent(reviewId)}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ moderationStatus }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { success: false, error: data.error || `HTTP ${res.status}` };
    return { success: true, review: data.review ? normalizeReview(data.review) : undefined };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Moderation failed' };
  }
}

export async function deleteAdminReview(reviewId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const headers = await getAuthHeaders();
    const res = await fetch(`/api/admin/reviews/${encodeURIComponent(reviewId)}`, {
      method: 'DELETE',
      headers,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { success: false, error: data.error || `HTTP ${res.status}` };
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to delete review' };
  }
}
