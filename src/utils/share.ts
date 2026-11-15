export interface SharePayload {
  title: string;
  text: string;
  url: string;
}

export function buildProductShareUrl(productId: string): string {
  if (typeof window === 'undefined') return '';
  return `${window.location.origin}/product/${encodeURIComponent(productId)}`;
}

export function buildVideoShareUrl(videoId: string): string {
  if (typeof window === 'undefined') return '';
  return `${window.location.origin}/play?video=${encodeURIComponent(videoId)}`;
}

export async function triggerNativeShare(payload: SharePayload): Promise<'shared' | 'aborted' | 'fallback'> {
  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share({
        title: payload.title,
        text: payload.text,
        url: payload.url,
      });
      return 'shared';
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        return 'aborted';
      }
      return 'fallback';
    }
  }
  return 'fallback';
}
