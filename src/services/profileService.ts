import { User, SavedAddress } from '../types';
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
    let savedAddrs: SavedAddress[] = [];

    if (Array.isArray(data.saved_addresses)) {
      savedAddrs = data.saved_addresses;
    } else if (addr && (addr.houseBuilding || addr.street || addr.streetArea)) {
      // Synthesize default saved address from primary address
      savedAddrs = [
        {
          id: 'addr-default',
          isDefault: true,
          label: 'Home',
          fullName: data.full_name || '',
          phone: data.phone || addr.phone || '',
          email: data.email,
          country: addr.country || 'India',
          houseBuilding: addr.houseBuilding || addr.apartment || addr.street || '',
          streetArea: addr.streetArea || addr.street || '',
          landmark: addr.landmark || '',
          city: addr.city || '',
          district: addr.district || '',
          state: addr.state || '',
          pinCode: addr.pinCode || addr.postalCode || addr.zipCode || '',
          deliveryInstructions: addr.deliveryInstructions || '',
        },
      ];
    }

    const primaryShippingAddress: SavedAddress | undefined =
      savedAddrs.find((a) => a.isDefault) || savedAddrs[0] || undefined;

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
            zipCode: addr.zipCode || addr.pinCode || addr.postalCode || '',
            country: addr.country || 'India',
          }
        : undefined,
      shippingAddress: primaryShippingAddress,
      savedAddresses: savedAddrs,
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

    if (updates.name !== undefined) payload.full_name = updates.name;
    if (updates.phone !== undefined) payload.phone = updates.phone;
    if (updates.avatar !== undefined) payload.avatar_url = updates.avatar;
    if (updates.address !== undefined) payload.shipping_address = updates.address;
    if (updates.shippingAddress !== undefined) {
      payload.shipping_address = updates.shippingAddress;
    }
    if (updates.savedAddresses !== undefined) {
      payload.saved_addresses = updates.savedAddresses;
    }

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

/**
 * Add a new saved address to the customer profile
 */
export async function addCustomerSavedAddress(
  userId: string,
  newAddr: Omit<SavedAddress, 'id'>
): Promise<{ success: boolean; address?: SavedAddress; error?: string }> {
  try {
    const profile = await fetchCustomerProfile(userId);
    const existing = profile?.savedAddresses || [];

    const addressId = `addr-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const isFirst = existing.length === 0;
    const shouldBeDefault = newAddr.isDefault ?? isFirst;

    const formattedAddress: SavedAddress = {
      ...newAddr,
      id: addressId,
      isDefault: shouldBeDefault,
    };

    const updatedList = existing.map((a) => (shouldBeDefault ? { ...a, isDefault: false } : a));
    updatedList.push(formattedAddress);

    const ok = await updateCustomerProfile(userId, {
      savedAddresses: updatedList,
      shippingAddress: shouldBeDefault ? formattedAddress : profile?.shippingAddress,
      phone: newAddr.phone || profile?.phone,
      name: newAddr.fullName || profile?.name,
    });

    if (ok) {
      return { success: true, address: formattedAddress };
    }
    return { success: false, error: 'Database update failed' };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to save address' };
  }
}

/**
 * Update an existing saved address
 */
export async function updateCustomerSavedAddress(
  userId: string,
  updatedAddress: SavedAddress
): Promise<{ success: boolean; error?: string }> {
  try {
    const profile = await fetchCustomerProfile(userId);
    const existing = profile?.savedAddresses || [];

    const updatedList = existing.map((a) => {
      if (a.id === updatedAddress.id) {
        return updatedAddress;
      }
      if (updatedAddress.isDefault) {
        return { ...a, isDefault: false };
      }
      return a;
    });

    const ok = await updateCustomerProfile(userId, {
      savedAddresses: updatedList,
      shippingAddress: updatedAddress.isDefault ? updatedAddress : profile?.shippingAddress,
    });

    return { success: ok };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to update address' };
  }
}

/**
 * Delete a saved address
 */
export async function deleteCustomerSavedAddress(
  userId: string,
  addressId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const profile = await fetchCustomerProfile(userId);
    const existing = profile?.savedAddresses || [];
    const filtered = existing.filter((a) => a.id !== addressId);

    // If default was deleted, assign first remaining as default
    if (filtered.length > 0 && !filtered.some((a) => a.isDefault)) {
      filtered[0].isDefault = true;
    }

    const ok = await updateCustomerProfile(userId, {
      savedAddresses: filtered,
      shippingAddress: filtered.find((a) => a.isDefault) || undefined,
    });

    return { success: ok };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to delete address' };
  }
}

