import { VideoItem } from '../types';
import { supabase, isSupabaseConfigured, getAuthHeaders } from '../lib/supabase';

export async function fetchDemoVideos(): Promise<{ videos: VideoItem[]; migrationPending?: boolean }> {
  try {
    const headers = await getAuthHeaders();
    const res = await fetch('/api/videos', { headers });
    if (res.ok) {
      const data = await res.json();
      return {
        videos: Array.isArray(data.videos) ? data.videos : [],
        migrationPending: Boolean(data.migrationPending),
      };
    }
  } catch (err) {
    console.warn('Could not load demo videos from API:', err);
  }
  return { videos: [] };
}

export async function toggleVideoLike(
  videoId: string
): Promise<{ success: boolean; liked?: boolean; likesCount?: number; error?: string; requiresAuth?: boolean }> {
  try {
    const headers = await getAuthHeaders({ 'Content-Type': 'application/json' });
    if (!headers.Authorization) {
      return { success: false, requiresAuth: true, error: 'Please sign in to like demo videos.' };
    }

    const res = await fetch(`/api/videos/${encodeURIComponent(videoId)}/like`, {
      method: 'POST',
      headers,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return {
        success: false,
        requiresAuth: res.status === 401,
        error: data.error || 'Failed to update like.',
      };
    }
    return {
      success: true,
      liked: Boolean(data.liked),
      likesCount: Number(data.likesCount ?? 0),
    };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Network error while updating like.' };
  }
}

export async function fetchAdminVideos(): Promise<{ videos: VideoItem[]; migrationPending?: boolean; error?: string }> {
  try {
    const headers = await getAuthHeaders();
    const res = await fetch('/api/admin/videos', { headers });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { videos: [], error: data.error || `Server returned HTTP ${res.status}` };
    }
    return {
      videos: Array.isArray(data.videos) ? data.videos : [],
      migrationPending: Boolean(data.migrationPending),
    };
  } catch (err: any) {
    return { videos: [], error: err?.message || 'Failed to load admin videos.' };
  }
}

export async function createAdminVideo(input: {
  title: string;
  description: string;
  videoUrl: string;
  thumbnailUrl?: string | null;
  productId?: string | null;
  isActive?: boolean;
}): Promise<{ success: boolean; video?: VideoItem; error?: string }> {
  try {
    const headers = await getAuthHeaders({ 'Content-Type': 'application/json' });
    const res = await fetch('/api/admin/videos', {
      method: 'POST',
      headers,
      body: JSON.stringify(input),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { success: false, error: data.error || `HTTP ${res.status}` };
    }
    return { success: true, video: data.video };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to create video.' };
  }
}

export async function updateAdminVideo(
  videoId: string,
  updates: Partial<{
    title: string;
    description: string;
    videoUrl: string;
    thumbnailUrl: string | null;
    productId: string | null;
    isActive: boolean;
  }>
): Promise<{ success: boolean; video?: VideoItem; error?: string }> {
  try {
    const headers = await getAuthHeaders({ 'Content-Type': 'application/json' });
    const res = await fetch(`/api/admin/videos/${encodeURIComponent(videoId)}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify(updates),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { success: false, error: data.error || `HTTP ${res.status}` };
    }
    return { success: true, video: data.video };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to update video.' };
  }
}

export async function deleteAdminVideo(videoId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const headers = await getAuthHeaders();
    const res = await fetch(`/api/admin/videos/${encodeURIComponent(videoId)}`, {
      method: 'DELETE',
      headers,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { success: false, error: data.error || `HTTP ${res.status}` };
    }
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to delete video.' };
  }
}

export async function uploadDemoVideoFile(file: File): Promise<{ success: boolean; url?: string; error?: string }> {
  const allowed = ['video/mp4', 'video/webm', 'video/quicktime'];
  if (!allowed.includes(file.type)) {
    return { success: false, error: 'Unsupported format. Upload MP4, WebM, or MOV video.' };
  }
  if (file.size > 50 * 1024 * 1024) {
    return { success: false, error: 'Video file must be under 50MB.' };
  }

  // Prefer direct authenticated admin upload to Supabase Storage bucket 'product-videos' (avoids serverless body limits)
  if (isSupabaseConfigured()) {
    try {
      const ext = file.type.includes('webm') ? 'webm' : file.type.includes('quicktime') ? 'mov' : 'mp4';
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '-').slice(0, 48);
      const storagePath = `demos/${Date.now()}-${safeName}.${ext}`;

      const { error: uploadErr } = await supabase.storage
        .from('product-videos')
        .upload(storagePath, file, {
          contentType: file.type,
          upsert: false,
        });

      if (!uploadErr) {
        const { data: pub } = supabase.storage.from('product-videos').getPublicUrl(storagePath);
        if (pub?.publicUrl) {
          return { success: true, url: pub.publicUrl };
        }
      }
    } catch {
      // Fallback to server upload for small files
    }
  }

  if (file.size > 4 * 1024 * 1024) {
    return {
      success: false,
      error: 'Direct storage upload failed (ensure product-videos bucket is created via upgrade_migration.sql) and file exceeds 4MB API limit.',
    };
  }

  try {
    const base64Data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsDataURL(file);
    });

    const headers = await getAuthHeaders({ 'Content-Type': 'application/json' });
    const res = await fetch('/api/admin/videos/upload', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        fileName: file.name,
        mimeType: file.type,
        base64Data,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { success: false, error: data.error || 'Upload failed' };
    }
    return { success: true, url: data.url };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Upload failed' };
  }
}

export function getEmbeddableVideoInfo(url: string): {
  type: 'youtube' | 'vimeo' | 'direct';
  src: string;
} {
  const clean = String(url || '').trim();
  const ytMatch = clean.match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/
  );
  if (ytMatch && ytMatch[1]) {
    return {
      type: 'youtube',
      src: `https://www.youtube.com/embed/${ytMatch[1]}?rel=0`,
    };
  }
  const vimeoMatch = clean.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if (vimeoMatch && vimeoMatch[1]) {
    return {
      type: 'vimeo',
      src: `https://player.vimeo.com/video/${vimeoMatch[1]}`,
    };
  }
  return {
    type: 'direct',
    src: clean,
  };
}
