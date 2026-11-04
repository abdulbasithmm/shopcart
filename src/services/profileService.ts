import { User } from '../types';
import { supabase, isSupabaseConfigured } from '../lib/supabase';

export async function fetchCustomerProfile(userId: string): Promise<User | null> {
  if (!isSupabaseConfigured() || !userId) return null;

  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (error || !data) {
      return null;
    }

    const addr = data.shipping_address as any;

    return {
      id: data.id,
      name: data.full_name || data.email.split('@')[0],
      email: data.email,
      phone: data.phone || undefined,
      avatar: data.avatar_url || data.email.substring(0, 2).toUpperCase(),
      role: (data.role === 'admin' ? 'admin' : 'customer') as 'customer' | 'admin',
      address: addr?.street
        ? {
            street: addr.street,
            city: addr.city || '',
            state: addr.state || '',
            zipCode: addr.zipCode || addr.postalCode || '',
            country: addr.country || 'United States',
          }
        : undefined,
    };
  } catch (err) {
    console.warn('Error fetching customer profile:', err);
    return null;
  }
}

/**
 * Direct database verification of user role to strictly prevent URL manipulation or frontend spoofing
 */
export async function verifyUserRole(userId: string): Promise<'customer' | 'admin'> {
  if (!isSupabaseConfigured() || !userId) return 'customer';

  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .maybeSingle();

    if (error || !data) return 'customer';
    return data.role === 'admin' ? 'admin' : 'customer';
  } catch {
    return 'customer';
  }
}

export async function updateCustomerProfile(userId: string, updates: Partial<User>): Promise<boolean> {
  if (!isSupabaseConfigured() || !userId) return false;

  try {
    const payload: any = {
      updated_at: new Date().toISOString(),
    };

    if (updates.name) payload.full_name = updates.name;
    if (updates.phone) payload.phone = updates.phone;
    if (updates.avatar) payload.avatar_url = updates.avatar;
    if (updates.address) payload.shipping_address = updates.address;

    const { error } = await supabase
      .from('profiles')
      .update(payload)
      .eq('id', userId);

    if (error) {
      console.warn('Failed to update customer profile in Supabase:', error.message);
      return false;
    }

    return true;
  } catch (err) {
    console.warn('Exception updating customer profile:', err);
    return false;
  }
}
