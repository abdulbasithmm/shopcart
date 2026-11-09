import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Database } from '../types/supabase';

// Local storage key for optional dynamic UI configuration
const STORAGE_KEY_URL = 'shopcart_supabase_url';
const STORAGE_KEY_KEY = 'shopcart_supabase_key';

// Read from Vite environment variables, Node process.env, or localStorage override
const getEnvVar = (name: string): string => {
  if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env[name]) {
    return String(import.meta.env[name]);
  }
  if (typeof process !== 'undefined' && process.env && process.env[name]) {
    return String(process.env[name]);
  }
  return '';
};

const envUrl = getEnvVar('VITE_SUPABASE_URL').trim();
const envKey = getEnvVar('VITE_SUPABASE_ANON_KEY').trim();

let cachedUrl = '';
let cachedKey = '';

try {
  cachedUrl = localStorage.getItem(STORAGE_KEY_URL) || '';
  cachedKey = localStorage.getItem(STORAGE_KEY_KEY) || '';
} catch {
  // Ignore in SSR / strict sandbox
}

export const SUPABASE_URL = cachedUrl || envUrl || 'https://kciglyawyagwtgkwsxau.supabase.co';
export const SUPABASE_ANON_KEY = cachedKey || envKey || 'sb_publishable_9KTWhKGnHHGRmtmkaYz1eg_ib2A0bUp';

// Validation helper
export const isSupabaseConfigured = (): boolean => {
  return (
    Boolean(SUPABASE_URL) &&
    Boolean(SUPABASE_ANON_KEY) &&
    !SUPABASE_URL.includes('your-project') &&
    SUPABASE_URL.startsWith('http')
  );
};

// Create the singleton Supabase client
let clientInstance: SupabaseClient<any> | null = null;

export const getSupabaseClient = (): SupabaseClient<any> => {
  if (!clientInstance) {
    if (isSupabaseConfigured()) {
      clientInstance = createClient<any>(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      });
    } else {
      // Create a fallback client instance with dummy values to prevent crashes if called
      clientInstance = createClient<any>(
        'https://placeholder-shopcart.supabase.co',
        'placeholder-anon-key',
        {
          auth: {
            persistSession: false,
            autoRefreshToken: false,
          },
        }
      );
    }
  }
  return clientInstance;
};

export const supabase = getSupabaseClient();

// Helper to save connection in UI and reload
export const setRuntimeSupabaseConfig = (url: string, anonKey: string) => {
  try {
    localStorage.setItem(STORAGE_KEY_URL, url.trim());
    localStorage.setItem(STORAGE_KEY_KEY, anonKey.trim());
    clientInstance = null; // reset client
    window.location.reload();
  } catch (err) {
    console.error('Failed to store Supabase configuration in localStorage', err);
  }
};

export const clearRuntimeSupabaseConfig = () => {
  try {
    localStorage.removeItem(STORAGE_KEY_URL);
    localStorage.removeItem(STORAGE_KEY_KEY);
    clientInstance = null;
    window.location.reload();
  } catch (err) {
    console.error('Failed to clear Supabase configuration', err);
  }
};
