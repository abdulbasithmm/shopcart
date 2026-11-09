export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      categories: {
        Row: {
          id: string;
          slug: string;
          name: string;
          description: string | null;
          icon: string | null;
          created_at: string;
        };
        Insert: {
          id: string;
          slug: string;
          name: string;
          description?: string | null;
          icon?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          slug?: string;
          name?: string;
          description?: string | null;
          icon?: string | null;
          created_at?: string;
        };
      };
      products: {
        Row: {
          id: string;
          name: string;
          brand: string;
          category_id: string | null;
          category_name: string;
          price: number;
          original_price: number;
          rating: number;
          reviews_count: number;
          is_active: boolean;
          is_featured: boolean;
          is_bestseller: boolean;
          is_special_offer: boolean;
          is_new_arrival: boolean;
          claimed_percentage: number;
          discount_percentage: number;
          badge: string | null;
          short_description: string;
          full_description: string;
          features: Json;
          specs: Json;
          colors: Json;
          sizes: Json;
          visual_type: string;
          accent_color: string;
          tags: Json;
          image_url: string | null;
          images: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          brand: string;
          category_id?: string | null;
          category_name: string;
          price: number;
          original_price: number;
          rating?: number;
          reviews_count?: number;
          is_active?: boolean;
          is_featured?: boolean;
          is_bestseller?: boolean;
          is_special_offer?: boolean;
          is_new_arrival?: boolean;
          claimed_percentage?: number;
          discount_percentage?: number;
          badge?: string | null;
          short_description?: string;
          full_description?: string;
          features?: Json;
          specs?: Json;
          colors?: Json;
          sizes?: Json;
          visual_type?: string;
          accent_color?: string;
          tags?: Json;
          image_url?: string | null;
          images?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          brand?: string;
          category_id?: string | null;
          category_name?: string;
          price?: number;
          original_price?: number;
          rating?: number;
          reviews_count?: number;
          is_active?: boolean;
          is_featured?: boolean;
          is_bestseller?: boolean;
          is_special_offer?: boolean;
          is_new_arrival?: boolean;
          claimed_percentage?: number;
          discount_percentage?: number;
          badge?: string | null;
          short_description?: string;
          full_description?: string;
          features?: Json;
          specs?: Json;
          colors?: Json;
          sizes?: Json;
          visual_type?: string;
          accent_color?: string;
          tags?: Json;
          image_url?: string | null;
          images?: Json;
          created_at?: string;
          updated_at?: string;
        };
      };
      inventory: {
        Row: {
          id: string;
          product_id: string;
          stock_count: number;
          low_stock_threshold: number;
          updated_at: string;
        };
        Insert: {
          id?: string;
          product_id: string;
          stock_count: number;
          low_stock_threshold?: number;
          updated_at?: string;
        };
        Update: {
          id?: string;
          product_id?: string;
          stock_count?: number;
          low_stock_threshold?: number;
          updated_at?: string;
        };
      };
      profiles: {
        Row: {
          id: string;
          email: string;
          full_name: string | null;
          phone: string | null;
          avatar_url: string | null;
          role: string;
          shipping_address: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email: string;
          full_name?: string | null;
          phone?: string | null;
          avatar_url?: string | null;
          role?: string;
          shipping_address?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          full_name?: string | null;
          phone?: string | null;
          avatar_url?: string | null;
          role?: string;
          shipping_address?: Json;
          created_at?: string;
          updated_at?: string;
        };
      };
      carts: {
        Row: {
          id: string;
          user_id: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          created_at?: string;
          updated_at?: string;
        };
      };
      cart_items: {
        Row: {
          id: string;
          cart_id: string;
          product_id: string;
          quantity: number;
          selected_color: string | null;
          selected_size: string | null;
          is_saved_for_later: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          cart_id: string;
          product_id: string;
          quantity?: number;
          selected_color?: string | null;
          selected_size?: string | null;
          is_saved_for_later?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          cart_id?: string;
          product_id?: string;
          quantity?: number;
          selected_color?: string | null;
          selected_size?: string | null;
          is_saved_for_later?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
      orders: {
        Row: {
          id: string;
          order_number: string;
          user_id: string | null;
          guest_email: string | null;
          status: string;
          subtotal: number;
          discount_amount: number;
          shipping_fee: number;
          tax_amount: number;
          total_amount: number;
          coupon_code: string | null;
          shipping_address: Json;
          customer_notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          order_number: string;
          user_id?: string | null;
          guest_email?: string | null;
          status?: string;
          subtotal: number;
          discount_amount?: number;
          shipping_fee?: number;
          tax_amount?: number;
          total_amount: number;
          coupon_code?: string | null;
          shipping_address: Json;
          customer_notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          order_number?: string;
          user_id?: string | null;
          guest_email?: string | null;
          status?: string;
          subtotal?: number;
          discount_amount?: number;
          shipping_fee?: number;
          tax_amount?: number;
          total_amount?: number;
          coupon_code?: string | null;
          shipping_address?: Json;
          customer_notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      order_items: {
        Row: {
          id: string;
          order_id: string;
          product_id: string | null;
          product_name: string;
          unit_price: number;
          quantity: number;
          total_price: number;
          selected_color: string | null;
          selected_size: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          order_id: string;
          product_id?: string | null;
          product_name: string;
          unit_price: number;
          quantity: number;
          total_price: number;
          selected_color?: string | null;
          selected_size?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          order_id?: string;
          product_id?: string | null;
          product_name?: string;
          unit_price?: number;
          quantity?: number;
          total_price?: number;
          selected_color?: string | null;
          selected_size?: string | null;
          created_at?: string;
        };
      };
      payment_records: {
        Row: {
          id: string;
          order_id: string;
          payment_method: string;
          amount: number;
          currency: string;
          payment_status: string;
          transaction_reference: string | null;
          raw_details: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          order_id: string;
          payment_method: string;
          amount: number;
          currency?: string;
          payment_status?: string;
          transaction_reference?: string | null;
          raw_details?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          order_id?: string;
          payment_method?: string;
          amount?: number;
          currency?: string;
          payment_status?: string;
          transaction_reference?: string | null;
          raw_details?: Json;
          created_at?: string;
        };
      };
    };
    Functions: {
      deduct_product_inventory: {
        Args: {
          p_product_id: string;
          p_quantity: number;
        };
        Returns: boolean;
      };
    };
  };
}
