-- ==============================================================================
-- SHOPCART SUPABASE POSTGRESQL DATABASE SCHEMA & MIGRATION SCRIPT
-- ==============================================================================
-- This script configures:
-- 1. Product Categories Table
-- 2. Products Table
-- 3. Product Inventory Table
-- 4. Customer Profiles Table (Linked to auth.users)
-- 5. Shopping Carts Table
-- 6. Cart Items Table
-- 7. Orders Table
-- 8. Order Items Table
-- 9. Payment Records Table
-- 10. Product Reviews Table
-- 11. Customer Wishlist Table
-- 12. Safe Atomic Inventory Deduction Function
-- 13. Profile Auto-Creation Trigger on Auth Signup
-- 14. Row Level Security (RLS) Policies for Public, Customers & Admins
-- 15. Comprehensive Seed Data (Categories, 14 Sample Products, Inventory & Reviews)
-- ==============================================================================

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ==============================================================================
-- 1. CATEGORIES TABLE
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.categories (
    id TEXT PRIMARY KEY,
    slug TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    icon TEXT,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ==============================================================================
-- 2. PRODUCTS TABLE
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.products (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    brand TEXT NOT NULL,
    category_id TEXT REFERENCES public.categories(id) ON DELETE SET NULL,
    category_name TEXT NOT NULL,
    price NUMERIC(10, 2) NOT NULL CHECK (price >= 0),
    original_price NUMERIC(10, 2) NOT NULL CHECK (original_price >= 0),
    rating NUMERIC(3, 2) DEFAULT 5.00 CHECK (rating >= 0 AND rating <= 5),
    reviews_count INTEGER DEFAULT 0 CHECK (reviews_count >= 0),
    is_active BOOLEAN DEFAULT true NOT NULL,
    is_featured BOOLEAN DEFAULT false NOT NULL,
    is_bestseller BOOLEAN DEFAULT false NOT NULL,
    is_special_offer BOOLEAN DEFAULT false NOT NULL,
    is_new_arrival BOOLEAN DEFAULT false NOT NULL,
    claimed_percentage INTEGER DEFAULT 0 CHECK (claimed_percentage >= 0 AND claimed_percentage <= 100),
    discount_percentage INTEGER DEFAULT 0 CHECK (discount_percentage >= 0 AND discount_percentage <= 100),
    badge TEXT,
    short_description TEXT NOT NULL,
    full_description TEXT NOT NULL,
    features JSONB DEFAULT '[]'::jsonb NOT NULL,
    specs JSONB DEFAULT '{}'::jsonb NOT NULL,
    colors JSONB DEFAULT '[]'::jsonb NOT NULL,
    sizes JSONB DEFAULT '[]'::jsonb NOT NULL,
    visual_type TEXT DEFAULT 'headphones' NOT NULL,
    accent_color TEXT DEFAULT '#f97316' NOT NULL,
    tags JSONB DEFAULT '[]'::jsonb NOT NULL,
    image_url TEXT,
    images JSONB DEFAULT '[]'::jsonb NOT NULL,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Ensure columns exist if table was already created
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS images JSONB DEFAULT '[]'::jsonb NOT NULL;

-- Create search index for fast filtering
CREATE INDEX IF NOT EXISTS idx_products_category ON public.products(category_name);
CREATE INDEX IF NOT EXISTS idx_products_is_active ON public.products(is_active);
CREATE INDEX IF NOT EXISTS idx_products_price ON public.products(price);

-- ==============================================================================
-- 3. PRODUCT INVENTORY TABLE
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.inventory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id TEXT REFERENCES public.products(id) ON DELETE CASCADE UNIQUE NOT NULL,
    stock_count INTEGER NOT NULL DEFAULT 0 CHECK (stock_count >= 0),
    low_stock_threshold INTEGER DEFAULT 5 NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_inventory_product_id ON public.inventory(product_id);

-- ==============================================================================
-- 4. CUSTOMER PROFILES TABLE (Linked to auth.users)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    full_name TEXT,
    phone TEXT,
    avatar_url TEXT,
    role TEXT DEFAULT 'customer' CHECK (role IN ('customer', 'admin')),
    shipping_address JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Trigger to auto-create profile on auth signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, avatar_url, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'avatar_url', upper(substr(NEW.email, 1, 2))),
    'customer'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- ==============================================================================
-- 5. SHOPPING CARTS TABLE
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.carts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ==============================================================================
-- 6. CART ITEMS TABLE
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.cart_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cart_id UUID REFERENCES public.carts(id) ON DELETE CASCADE NOT NULL,
    product_id TEXT REFERENCES public.products(id) ON DELETE CASCADE NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
    selected_color TEXT,
    selected_size TEXT,
    is_saved_for_later BOOLEAN DEFAULT false NOT NULL,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cart_items_cart_id ON public.cart_items(cart_id);

-- ==============================================================================
-- 7. ORDERS TABLE
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_number TEXT UNIQUE NOT NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    guest_email TEXT,
    status TEXT DEFAULT 'order_placed' CHECK (status IN (
      'order_placed', 'confirmed', 'processing', 'shipped', 'out_for_delivery', 'delivered', 'cancelled', 'refunded',
      'pending', 'completed'
    )),
    subtotal NUMERIC(10, 2) NOT NULL CHECK (subtotal >= 0),
    discount_amount NUMERIC(10, 2) DEFAULT 0.00 CHECK (discount_amount >= 0),
    shipping_fee NUMERIC(10, 2) DEFAULT 0.00 CHECK (shipping_fee >= 0),
    tax_amount NUMERIC(10, 2) DEFAULT 0.00 CHECK (tax_amount >= 0),
    total_amount NUMERIC(10, 2) NOT NULL CHECK (total_amount >= 0),
    coupon_code TEXT,
    shipping_address JSONB NOT NULL,
    customer_notes TEXT,
    tracking_number TEXT,
    carrier TEXT DEFAULT 'Shop Cart Express',
    estimated_delivery_date TIMESTAMPTZ,
    shipment_updates JSONB DEFAULT '[]'::jsonb NOT NULL,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_orders_user_id ON public.orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_order_number ON public.orders(order_number);
CREATE INDEX IF NOT EXISTS idx_orders_tracking_number ON public.orders(tracking_number);

-- Real-time shipment updates table
CREATE TABLE IF NOT EXISTS public.order_shipment_updates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE NOT NULL,
    status TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    location TEXT,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_order_shipment_updates_order_id ON public.order_shipment_updates(order_id);

-- ==============================================================================
-- 8. ORDER ITEMS TABLE
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE NOT NULL,
    product_id TEXT REFERENCES public.products(id) ON DELETE SET NULL,
    product_name TEXT NOT NULL,
    unit_price NUMERIC(10, 2) NOT NULL CHECK (unit_price >= 0),
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    total_price NUMERIC(10, 2) NOT NULL CHECK (total_price >= 0),
    selected_color TEXT,
    selected_size TEXT,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON public.order_items(order_id);

-- ==============================================================================
-- 9. PAYMENT RECORDS TABLE (Google Pay UPI & PhonePe UPI)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.payment_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE NOT NULL,
    payment_method TEXT NOT NULL,
    amount NUMERIC(10, 2) NOT NULL CHECK (amount >= 0),
    currency TEXT DEFAULT 'INR' NOT NULL,
    payment_status TEXT DEFAULT 'pending_admin_verification',
    transaction_reference TEXT,
    screenshot_url TEXT,
    ai_analysis JSONB DEFAULT '{}'::jsonb,
    ai_confidence_score NUMERIC(5, 2),
    ai_recommendation TEXT,
    suspicious_indicators JSONB DEFAULT '[]'::jsonb,
    verified_at TIMESTAMPTZ,
    verified_by TEXT,
    rejection_reason TEXT,
    raw_details JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Ensure columns exist if table was already created
ALTER TABLE public.payment_records ADD COLUMN IF NOT EXISTS screenshot_url TEXT;
ALTER TABLE public.payment_records ADD COLUMN IF NOT EXISTS ai_analysis JSONB DEFAULT '{}'::jsonb;
ALTER TABLE public.payment_records ADD COLUMN IF NOT EXISTS ai_confidence_score NUMERIC(5, 2);
ALTER TABLE public.payment_records ADD COLUMN IF NOT EXISTS ai_recommendation TEXT;
ALTER TABLE public.payment_records ADD COLUMN IF NOT EXISTS suspicious_indicators JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.payment_records ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;
ALTER TABLE public.payment_records ADD COLUMN IF NOT EXISTS verified_by TEXT;
ALTER TABLE public.payment_records ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

-- Drop check constraints to allow all Universal UPI methods and flexible statuses
ALTER TABLE public.payment_records DROP CONSTRAINT IF EXISTS payment_records_payment_method_check;
ALTER TABLE public.payment_records DROP CONSTRAINT IF EXISTS payment_records_payment_status_check;

CREATE INDEX IF NOT EXISTS idx_payment_records_order ON public.payment_records(order_id);
CREATE INDEX IF NOT EXISTS idx_payment_records_utr ON public.payment_records(transaction_reference);

-- ==============================================================================
-- 9b. MERCHANT PAYMENT SETTINGS TABLE (Configurable by Admin)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.merchant_payment_settings (
    id TEXT PRIMARY KEY DEFAULT 'default',
    merchant_upi_id TEXT NOT NULL DEFAULT 'shopcart.merchant@okaxis',
    merchant_name TEXT NOT NULL DEFAULT 'Shopcart Online Store',
    merchant_upi_number TEXT DEFAULT '+91 98765 43210',
    qr_image_url TEXT DEFAULT '/assets/aistudio/qr_eeef5752.jpeg',
    enable_dynamic_qr BOOLEAN DEFAULT true,
    instructions TEXT DEFAULT 'Scan the merchant QR code with Google Pay, PhonePe, Paytm, BHIM, or any UPI app. After paying, upload the screenshot and 12-digit UTR reference.',
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

INSERT INTO public.merchant_payment_settings (id, merchant_upi_id, merchant_name, merchant_upi_number, qr_image_url, enable_dynamic_qr)
VALUES ('default', 'shopcart.merchant@okaxis', 'Shopcart Online Store', '+91 98765 43210', '/assets/aistudio/qr_eeef5752.jpeg', true)
ON CONFLICT (id) DO NOTHING;

-- ==============================================================================
-- 10. PRODUCT REVIEWS TABLE
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id TEXT REFERENCES public.products(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    author_name TEXT NOT NULL,
    author_email TEXT,
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    title TEXT,
    comment TEXT NOT NULL,
    verified_purchase BOOLEAN DEFAULT true NOT NULL,
    helpful_votes INTEGER DEFAULT 0 CHECK (helpful_votes >= 0),
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_reviews_product_id ON public.reviews(product_id);
CREATE INDEX IF NOT EXISTS idx_reviews_user_id ON public.reviews(user_id);
CREATE INDEX IF NOT EXISTS idx_reviews_created_at ON public.reviews(created_at DESC);

-- ==============================================================================
-- 11. CUSTOMER WISHLIST TABLE
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.wishlist (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    product_id TEXT REFERENCES public.products(id) ON DELETE CASCADE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE (user_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_wishlist_user_id ON public.wishlist(user_id);
CREATE INDEX IF NOT EXISTS idx_wishlist_product_id ON public.wishlist(product_id);
CREATE INDEX IF NOT EXISTS idx_wishlist_created_at ON public.wishlist(created_at DESC);

-- ==============================================================================
-- 12. SAFE INVENTORY DEDUCTION FUNCTION
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.deduct_product_inventory(
    p_product_id TEXT,
    p_quantity INTEGER
)
RETURNS BOOLEAN AS $$
DECLARE
    current_stock INTEGER;
BEGIN
    -- Select with row-level lock
    SELECT stock_count INTO current_stock
    FROM public.inventory
    WHERE product_id = p_product_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Product with ID % not found in inventory', p_product_id;
    END IF;

    IF current_stock < p_quantity THEN
        RETURN FALSE; -- Insufficient stock
    END IF;

    UPDATE public.inventory
    SET stock_count = stock_count - p_quantity,
        updated_at = timezone('utc'::text, now())
    WHERE product_id = p_product_id;

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ==============================================================================
-- 11. ROW LEVEL SECURITY (RLS) POLICIES
-- ==============================================================================
-- Explicitly enable Row Level Security on all 12 public tables
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.carts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cart_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_shipment_updates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wishlist ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------------------------
-- Admin Authorization Helper (Security Definer with isolated search_path)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, auth
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_admin() TO anon, authenticated, service_role;

-- ------------------------------------------------------------------------------
-- Role Tampering Prevention (Prevents customers from escalating role to admin)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.protect_user_role()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  -- If role is being changed, ensure executor is an authorized administrator
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    IF NOT public.is_admin() THEN
      RAISE EXCEPTION 'Access denied: customers are strictly forbidden from modifying user roles.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_user_role ON public.profiles;
CREATE TRIGGER trg_protect_user_role
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_user_role();

-- ------------------------------------------------------------------------------
-- 1. Categories RLS: Public can view, only Admins can manage
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Public can view categories" ON public.categories;
CREATE POLICY "Public can view categories" ON public.categories
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admins can manage categories" ON public.categories;
CREATE POLICY "Admins can manage categories" ON public.categories
    FOR ALL TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- ------------------------------------------------------------------------------
-- 2. Products RLS: Public view active, Admins manage all
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Public can view active products" ON public.products;
CREATE POLICY "Public can view active products" ON public.products
    FOR SELECT USING (is_active = true OR public.is_admin());

DROP POLICY IF EXISTS "Admins can manage products" ON public.products;
CREATE POLICY "Admins can manage products" ON public.products
    FOR ALL TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- ------------------------------------------------------------------------------
-- 3. Inventory RLS: Public view stock count, Admins manage stock
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Public can view inventory" ON public.inventory;
CREATE POLICY "Public can view inventory" ON public.inventory
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admins can manage inventory" ON public.inventory;
CREATE POLICY "Admins can manage inventory" ON public.inventory
    FOR ALL TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- ------------------------------------------------------------------------------
-- 4. Profiles RLS: Customer view/edit own profile, Admins view/manage all
-- (Policies are strictly split to eliminate any circular/infinite recursion)
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile" ON public.profiles
    FOR SELECT TO authenticated
    USING (auth.uid() = id);

DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
CREATE POLICY "Admins can view all profiles" ON public.profiles
    FOR SELECT TO authenticated
    USING (public.is_admin());

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" ON public.profiles
    FOR UPDATE TO authenticated
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Admins can manage all profiles" ON public.profiles;
CREATE POLICY "Admins can manage all profiles" ON public.profiles
    FOR ALL TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- ------------------------------------------------------------------------------
-- 5. Carts RLS: Customer owns their cart, Admins manage all
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can view own cart" ON public.carts;
CREATE POLICY "Users can view own cart" ON public.carts
    FOR SELECT TO authenticated
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can create own cart" ON public.carts;
CREATE POLICY "Users can create own cart" ON public.carts
    FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own cart" ON public.carts;
CREATE POLICY "Users can update own cart" ON public.carts
    FOR UPDATE TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own cart" ON public.carts;
CREATE POLICY "Users can delete own cart" ON public.carts
    FOR DELETE TO authenticated
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins can manage all carts" ON public.carts;
CREATE POLICY "Admins can manage all carts" ON public.carts
    FOR ALL TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- ------------------------------------------------------------------------------
-- 6. Cart Items RLS: Customer accesses only items in their own cart
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can view own cart items" ON public.cart_items;
CREATE POLICY "Users can view own cart items" ON public.cart_items
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.carts
            WHERE carts.id = cart_items.cart_id AND carts.user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Users can insert own cart items" ON public.cart_items;
CREATE POLICY "Users can insert own cart items" ON public.cart_items
    FOR INSERT TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.carts
            WHERE carts.id = cart_items.cart_id AND carts.user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Users can update own cart items" ON public.cart_items;
CREATE POLICY "Users can update own cart items" ON public.cart_items
    FOR UPDATE TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.carts
            WHERE carts.id = cart_items.cart_id AND carts.user_id = auth.uid()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.carts
            WHERE carts.id = cart_items.cart_id AND carts.user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Users can delete own cart items" ON public.cart_items;
CREATE POLICY "Users can delete own cart items" ON public.cart_items
    FOR DELETE TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.carts
            WHERE carts.id = cart_items.cart_id AND carts.user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Admins can manage all cart items" ON public.cart_items;
CREATE POLICY "Admins can manage all cart items" ON public.cart_items
    FOR ALL TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- ------------------------------------------------------------------------------
-- 7. Orders RLS: Customers view own orders, Admins view & manage all
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can view own orders" ON public.orders;
CREATE POLICY "Users can view own orders" ON public.orders
    FOR SELECT TO authenticated
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins can view all orders" ON public.orders;
CREATE POLICY "Admins can view all orders" ON public.orders
    FOR SELECT TO authenticated
    USING (public.is_admin());

DROP POLICY IF EXISTS "Anyone can place order" ON public.orders;
CREATE POLICY "Anyone can place order" ON public.orders
    FOR INSERT
    WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

DROP POLICY IF EXISTS "Admins can update orders" ON public.orders;
CREATE POLICY "Admins can update orders" ON public.orders
    FOR UPDATE TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins can delete orders" ON public.orders;
CREATE POLICY "Admins can delete orders" ON public.orders
    FOR DELETE TO authenticated
    USING (public.is_admin());

-- ------------------------------------------------------------------------------
-- 8. Order Shipment Updates RLS: Customers view own, Admins manage all
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can view own order shipment updates" ON public.order_shipment_updates;
CREATE POLICY "Users can view own order shipment updates" ON public.order_shipment_updates
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.orders
            WHERE orders.id = order_shipment_updates.order_id
              AND orders.user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Admins can view all order shipment updates" ON public.order_shipment_updates;
CREATE POLICY "Admins can view all order shipment updates" ON public.order_shipment_updates
    FOR SELECT TO authenticated
    USING (public.is_admin());

DROP POLICY IF EXISTS "Admins can manage order shipment updates" ON public.order_shipment_updates;
CREATE POLICY "Admins can manage order shipment updates" ON public.order_shipment_updates
    FOR ALL TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- ------------------------------------------------------------------------------
-- 9. Order Items RLS: Customers view own, checkout insert, Admins manage
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can view own order items" ON public.order_items;
CREATE POLICY "Users can view own order items" ON public.order_items
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.orders
            WHERE orders.id = order_items.order_id
              AND orders.user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Admins can view all order items" ON public.order_items;
CREATE POLICY "Admins can view all order items" ON public.order_items
    FOR SELECT TO authenticated
    USING (public.is_admin());

DROP POLICY IF EXISTS "Anyone can insert order items with order" ON public.order_items;
CREATE POLICY "Anyone can insert order items with order" ON public.order_items
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.orders
            WHERE orders.id = order_items.order_id
              AND (orders.user_id = auth.uid() OR orders.user_id IS NULL)
        )
    );

DROP POLICY IF EXISTS "Admins can manage order items" ON public.order_items;
CREATE POLICY "Admins can manage order items" ON public.order_items
    FOR ALL TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- ------------------------------------------------------------------------------
-- 10. Payment Records RLS: Customers view own, Admins manage & verify payments
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can view own payment records" ON public.payment_records;
CREATE POLICY "Users can view own payment records" ON public.payment_records
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.orders
            WHERE orders.id = payment_records.order_id
              AND orders.user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Admins can view all payment records" ON public.payment_records;
CREATE POLICY "Admins can view all payment records" ON public.payment_records
    FOR SELECT TO authenticated
    USING (public.is_admin());

DROP POLICY IF EXISTS "Anyone can record payment during checkout" ON public.payment_records;
CREATE POLICY "Anyone can record payment during checkout" ON public.payment_records
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.orders
            WHERE orders.id = payment_records.order_id
              AND (orders.user_id = auth.uid() OR orders.user_id IS NULL)
        )
    );

-- Only administrators can verify, modify or manage payment records
DROP POLICY IF EXISTS "Admins can manage payment records" ON public.payment_records;
CREATE POLICY "Admins can manage payment records" ON public.payment_records
    FOR ALL TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- ------------------------------------------------------------------------------
-- 11. Product Reviews RLS: Public can view, Authenticated customers can submit
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Public can view product reviews" ON public.reviews;
CREATE POLICY "Public can view product reviews" ON public.reviews
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "Authenticated users can submit reviews" ON public.reviews;
CREATE POLICY "Authenticated users can submit reviews" ON public.reviews
    FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

DROP POLICY IF EXISTS "Users can update own reviews" ON public.reviews;
CREATE POLICY "Users can update own reviews" ON public.reviews
    FOR UPDATE TO authenticated
    USING (auth.uid() = user_id OR public.is_admin())
    WITH CHECK (auth.uid() = user_id OR public.is_admin());

DROP POLICY IF EXISTS "Admins and authors can delete reviews" ON public.reviews;
CREATE POLICY "Admins and authors can delete reviews" ON public.reviews
    FOR DELETE TO authenticated
    USING (auth.uid() = user_id OR public.is_admin());

-- Allow helpful vote updates
DROP POLICY IF EXISTS "Anyone can update review helpful votes" ON public.reviews;
CREATE POLICY "Anyone can update review helpful votes" ON public.reviews
    FOR UPDATE
    USING (true)
    WITH CHECK (true);

-- ------------------------------------------------------------------------------
-- 12. Customer Wishlist RLS: Private list per customer, Admins manage all
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can view own wishlist" ON public.wishlist;
CREATE POLICY "Users can view own wishlist" ON public.wishlist
    FOR SELECT TO authenticated
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can add to own wishlist" ON public.wishlist;
CREATE POLICY "Users can add to own wishlist" ON public.wishlist
    FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can remove from own wishlist" ON public.wishlist;
CREATE POLICY "Users can remove from own wishlist" ON public.wishlist
    FOR DELETE TO authenticated
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins can view and manage all wishlists" ON public.wishlist;
CREATE POLICY "Admins can view and manage all wishlists" ON public.wishlist
    FOR ALL TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- ==============================================================================
-- 13. SEED DATA: CATEGORIES
-- ==============================================================================
INSERT INTO public.categories (id, slug, name, description, icon) VALUES
('all', 'all', 'All Categories', 'Discover thousands of premium curated products', 'LayoutGrid'),
('Electronics', 'electronics', 'Electronics', 'Smart tech, wireless audio & modern wearables', 'Headphones'),
('Fashion', 'fashion', 'Fashion', 'Apparel, waterproof outerwear & premium essentials', 'Shirt'),
('Home & Kitchen', 'home-kitchen', 'Home & Kitchen', 'Minimalist aesthetics, lighting & ergonomic furniture', 'Home'),
('Beauty', 'beauty', 'Beauty', 'Clinical skincare, botanical serums & organic treatments', 'Sparkles'),
('Books', 'books', 'Books', 'Award-winning design, culinary arts & hardcover editions', 'BookOpen'),
('Groceries', 'groceries', 'Groceries', 'Artisan single-origin coffee & organic pantry goods', 'Coffee'),
('Sports', 'sports', 'Sports', 'High-performance outdoor gear & titanium smartwatches', 'Activity')
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    icon = EXCLUDED.icon;

-- ==============================================================================
-- 13. SEED DATA: PRODUCTS & INVENTORY
-- ==============================================================================
INSERT INTO public.products (
    id, name, brand, category_id, category_name, price, original_price,
    rating, reviews_count, is_active, is_featured, is_bestseller, is_special_offer,
    is_new_arrival, claimed_percentage, discount_percentage, badge,
    short_description, full_description, features, specs, colors, sizes,
    visual_type, accent_color, tags
) VALUES
(
    'eko-prod-1',
    'AeroTune Ultra ANC Wireless Headphones',
    'AeroAcoustics',
    'Electronics',
    'Electronics',
    249.00,
    299.00,
    4.90,
    342,
    true,
    true,
    true,
    false,
    false,
    88,
    17,
    'Best Seller',
    'Flagship hybrid noise cancellation with 40-hour playback and custom planar magnetic drivers.',
    'Engineered for audio purists and daily commuters alike, the AeroTune Ultra delivers uncompromising acoustic resolution with next-generation Adaptive Hybrid ANC. Ultra-soft memory foam earcups clad in breathable protein leather guarantee all-day ergonomic fatigue-free listening.',
    '["Active Noise Cancellation up to -42dB", "Custom 40mm Beryllium-coated dynamic drivers", "40-hour battery life on a single charge with fast USB-C charge", "Multipoint Bluetooth 5.3 with LDAC, AAC & aptX HD support", "Quad beamforming mics for crystal clear voice calls"]'::jsonb,
    $specs${"Driver Size": "40mm Beryllium Composite", "Frequency Response": "10Hz – 40,000Hz", "Battery Life": "40 hrs (ANC on) / 55 hrs (ANC off)", "Weight": "258 grams", "Connectivity": "Bluetooth 5.3 + 3.5mm Hi-Res Audio Jack", "Warranty": "2 Years International Limited"}$specs$::jsonb,
    '[{"name": "Matte Obsidian", "hex": "#1e293b"}, {"name": "Silver Platinum", "hex": "#cbd5e1"}, {"name": "Desert Dune", "hex": "#d4b996"}]'::jsonb,
    '[]'::jsonb,
    'headphones',
    '#f97316',
    '["wireless", "noise-cancelling", "audio", "premium", "tech"]'::jsonb
),
(
    'eko-prod-2',
    'Vanguard Chrono Titanium Smartwatch',
    'Vanguard Tech',
    'Sports',
    'Sports',
    189.00,
    239.00,
    4.80,
    512,
    true,
    true,
    true,
    true,
    false,
    84,
    21,
    'Lightning Deal',
    'Aerospace-grade titanium bezel, sapphire crystal AMOLED display, and 14-day battery reserve.',
    'The Vanguard Chrono combines the timeless elegance of classic horology with advanced biometric analytics. Track heart rate variability, SpO2, sleep architecture, and GPS route tracking without worrying about daily charging.',
    '["1.43-inch Always-On Sapphire AMOLED Retina display (1000 nits)", "Aerospace Titanium casing with ceramic back plate", "14-Day ultra-long battery life with magnetic quick dock", "Dual-frequency GNSS multi-satellite navigation", "50m Water Resistance (5 ATM) for swimming & sports"]'::jsonb,
    $specs${"Case Material": "Grade 5 Titanium & Ceramic", "Display": "1.43-inch AMOLED 466x466 (326 PPI)", "Sensors": "Optical PPG, Accelerometer, Gyroscope, SpO2, Barometer", "Battery": "460mAh Li-Po, 14 days standard usage", "Waterproof": "5 ATM / 50 meters", "Compatibility": "iOS 13+ & Android 9+"}$specs$::jsonb,
    '[{"name": "Titanium Slate", "hex": "#334155"}, {"name": "Alpine Olive", "hex": "#3f4f34"}, {"name": "Midnight Black", "hex": "#0f172a"}]'::jsonb,
    '["42mm", "46mm"]'::jsonb,
    'smartwatch',
    '#ea580c',
    '["smartwatch", "fitness", "wearable", "sports", "titanium"]'::jsonb
),
(
    'eko-prod-3',
    'Nordic Shield All-Weather Shell Parka',
    'Fjord & Co.',
    'Fashion',
    'Fashion',
    165.00,
    210.00,
    4.70,
    184,
    true,
    true,
    false,
    false,
    true,
    0,
    21,
    'New Arrival',
    'Three-layer Gore-Tex equivalent membrane engineered for heavy rain, blizzards and mountain commutes.',
    'Crafted from 100% recycled polyamide, the Nordic Shield shell delivers complete hydrostatic waterproof protection up to 20,000mm while allowing perspiration vapor to escape effortlessly.',
    '["20,000mm Waterproof hydrostatic rating with fully taped seams", "YKK Aquaguard storm-proof reverse zippers", "Articulated storm hood with dual cohort cinch pulls", "Laser-cut internal media pockets and magnetic storm flap", "Sustainable 100% recycled PFAS-free micro-ripstop fabric"]'::jsonb,
    $specs${"Material": "100% Recycled 3-Layer Polyamide Ripstop", "Waterproof Rating": "20,000 mm / H2O", "Breathability": "15,000 g/m²/24h", "Weight": "520 grams", "Care": "Machine wash cold 30°C, hang dry"}$specs$::jsonb,
    '[{"name": "Nordic Navy", "hex": "#1e3a8a"}, {"name": "Forest Moss", "hex": "#14532d"}, {"name": "Granite Charcoal", "hex": "#374151"}]'::jsonb,
    '["S", "M", "L", "XL", "XXL"]'::jsonb,
    'coat',
    '#0284c7',
    '["apparel", "waterproof", "outerwear", "winter", "sustainable"]'::jsonb
),
(
    'eko-prod-4',
    'Lumina Halo Ambient Architect Desk Lamp',
    'Lumina Copenhagen',
    'Home & Kitchen',
    'Home & Kitchen',
    119.00,
    149.00,
    4.95,
    278,
    true,
    true,
    true,
    false,
    false,
    62,
    20,
    'Staff Pick',
    'Precision-milled aluminum with 98 CRI circadian daylight tuning and touchless gesture control.',
    'Illuminate your workspace with flicker-free, museum-grade 98 CRI illumination that faithfully replicates natural solar spectrum cycles. Dual hinge counterbalance permits millimeter-precise adjustments.',
    '["Flicker-Free Museum Grade 98 CRI Daylight Spectrum", "Stepless touchless gesture sensor for dimming & warmth", "2700K warm twilight to 6500K focus white circadian tuning", "Integrated 15W Qi wireless fast-charging induction pad in heavy base", "Solid brushed anodized aircraft aluminum counterbalance chassis"]'::jsonb,
    $specs${"Luminous Flux": "1200 Lumens Max", "CRI": "> 98 Ra (Natural Daylight)", "Color Temperature": "2700K - 6500K Continuous", "Power Consumption": "18W LED + 15W Qi Wireless", "Base Footprint": "180mm x 180mm solid brass counterweight"}$specs$::jsonb,
    '[{"name": "Matte Anodized Silver", "hex": "#94a3b8"}, {"name": "Space Grey", "hex": "#475569"}, {"name": "Champagne Brass", "hex": "#ca8a04"}]'::jsonb,
    '[]'::jsonb,
    'lamp',
    '#f59e0b',
    '["lighting", "desk", "home office", "minimalist", "scandinavian"]'::jsonb
),
(
    'eko-prod-5',
    'Botanical Cell-Renewal Peptide Elixir',
    'Aura Derma Labs',
    'Beauty',
    'Beauty',
    64.00,
    85.00,
    4.85,
    623,
    true,
    true,
    false,
    true,
    false,
    92,
    25,
    'Save 25%',
    'Multi-peptide copper complex with marine bio-ferment and triple-molecular hyaluronic acid.',
    'Formulated by dermatological chemists in Switzerland, this high-potency serum stimulates cellular fibroblast collagen matrix production while restoring skin lipid barrier integrity.',
    '["Multi-Peptide Matrix with 1.5% Pure Copper Tripeptide-1", "Triple molecular weight hyaluronic acid for deep hydration", "Bio-fermented snow algae and antioxidant resveratrol", "Fragrance-free, non-comedogenic, clean clinical formula", "Packaged in UV-filtering amber glass with calibrated glass pipette"]'::jsonb,
    $specs${"Volume": "50ml / 1.7 fl. oz.", "Skin Type": "All skin types, especially dehydrated & aging", "Key Actives": "Copper Tripeptide, Resveratrol, Ectoin", "Certification": "Cruelty-Free, Vegan, Leaping Bunny Certified"}$specs$::jsonb,
    '[{"name": "Amber Dropper Bottle", "hex": "#b45309"}]'::jsonb,
    '["30ml", "50ml"]'::jsonb,
    'serum',
    '#d97706',
    '["skincare", "beauty", "organic", "serum", "anti-aging"]'::jsonb
),
(
    'eko-prod-6',
    'ErgoPro Matrix High-Back Task Chair',
    'ErgoForm Dynamics',
    'Home & Kitchen',
    'Home & Kitchen',
    389.00,
    460.00,
    4.80,
    419,
    true,
    false,
    true,
    false,
    false,
    70,
    15,
    'Best Seller',
    'Dynamic lumbar tracking system with breathable dual-density suspension mesh and 4D armrests.',
    'The ErgoPro Matrix redefines occupational ergonomics. Designed with orthopedic spine specialists, its self-adjusting lumbar mechanism dynamically contours to your posture.',
    '["Autonomous adaptive lumbar spring support", "BIFMA Level 3 certified elastomeric cooling weave mesh", "4D multidirectional adjustable armrests with soft PU pads", "Class 4 heavy-duty pneumatic gas cylinder rated to 350 lbs", "Synchronous multi-angle tilt lock with tension control"]'::jsonb,
    $specs${"Weight Capacity": "350 lbs / 160 kg", "Chair Height": "112cm – 124cm", "Base": "Polished die-cast aluminum 5-star base with 65mm mute casters", "Warranty": "10-Year Comprehensive Mechanism Warranty"}$specs$::jsonb,
    '[{"name": "Stealth Black", "hex": "#111827"}, {"name": "Steel Grey", "hex": "#6b7280"}, {"name": "Teal Accent", "hex": "#0f766e"}]'::jsonb,
    '[]'::jsonb,
    'chair',
    '#0d9488',
    '["furniture", "ergonomic", "office", "chair", "mesh"]'::jsonb
),
(
    'eko-prod-7',
    'SoundSphere 360 Waterproof Bluetooth Speaker',
    'Acoustic Wave',
    'Electronics',
    'Electronics',
    89.00,
    119.00,
    4.65,
    892,
    true,
    false,
    false,
    true,
    false,
    76,
    25,
    'Deal of the Day',
    'Omnidirectional 360° stereo with dual passive radiators, IP67 submersible housing and 24h play.',
    'Fill any room, backyard barbecue, or campsite with deep resonant punch and 360-degree clarity. The SoundSphere 360 features an IP67 rating allowing it to float in swimming pools.',
    '["True 360° omnidirectional soundstage with dual radiators", "IP67 100% dustproof and submersible up to 1 meter", "24 Hours uninterrupted music playback with USB powerbank output", "PartySync link: Connect up to 100+ speakers wirelessly", "Rugged shock-absorbent silicone casing with woven fabric wrap"]'::jsonb,
    $specs${"Output Power": "35W RMS Peak 50W", "Frequency Range": "55Hz – 20kHz", "Battery": "7800mAh Rechargeable Li-Ion", "Water Resistance": "IP67 Submersible and floats", "Weight": "680 grams"}$specs$::jsonb,
    '[{"name": "Ocean Cyan", "hex": "#0891b2"}, {"name": "Blaze Orange", "hex": "#ea580c"}, {"name": "Carbon Slate", "hex": "#1f2937"}]'::jsonb,
    '[]'::jsonb,
    'speaker',
    '#0891b2',
    '["speaker", "bluetooth", "audio", "waterproof", "portable"]'::jsonb
),
(
    'eko-prod-8',
    'Artisan Double-Wall Borosilicate Coffee Carafe',
    'Kōhī Craft Studio',
    'Home & Kitchen',
    'Home & Kitchen',
    48.00,
    60.00,
    4.90,
    215,
    true,
    false,
    false,
    false,
    true,
    0,
    20,
    'New Arrival',
    'Hand-blown heat-resistant borosilicate glass with laser-etched micro-mesh stainless steel dripper.',
    'Brew clean, aromatic pour-over coffee without paper filter waste. The double-wall insulated reservoir maintains optimal 92°C extraction temperatures.',
    '["Mouth-blown laboratory-grade borosilicate thermal glass", "Reusable ultra-fine 304 stainless steel conical mesh dripper", "Thermal double-wall vacuum barrier preserves piping hot coffee", "Ergonomic drip-free contoured spout with natural bamboo collar", "Capacity for 4 generous 200ml cups (800ml total)"]'::jsonb,
    $specs${"Capacity": "800ml (27 fl oz)", "Material": "Borosilicate Glass, 304 Stainless Steel, Organic Bamboo", "Heat Range": "-20°C to 150°C thermal shock proof", "Dishwasher Safe": "Glass carafe is dishwasher safe (hand-wash bamboo)"}$specs$::jsonb,
    '[{"name": "Clear Crystal", "hex": "#e2e8f0"}, {"name": "Smoked Topaz", "hex": "#78350f"}]'::jsonb,
    '[]'::jsonb,
    'carafe',
    '#92400e',
    '["coffee", "kitchen", "pour-over", "glass", "sustainable"]'::jsonb
),
(
    'eko-prod-9',
    'Nomad Apex Expandable Rolltop Backpack 30L',
    'Nomad Gearworks',
    'Fashion',
    'Fashion',
    135.00,
    170.00,
    4.75,
    380,
    true,
    true,
    false,
    false,
    false,
    55,
    21,
    'Trending',
    'Ballistic Cordura nylon with dedicated 16-inch suspended laptop vault and magnetic Fidlock buckle.',
    'Built for daily urban travel and weekend adventures, the Nomad Apex transitions seamlessly from commute to travel. The rolltop design expands capacity from 22L to 32L on demand.',
    '["Weatherproof 1000D Cordura nylon with TPU waterproof coating", "Suspended floating neoprene sleeve fits up to 16-inch MacBook Pro", "German-engineered magnetic Fidlock V-buckle for rapid closure", "Ergonomic EVA molded back panel with concealed luggage pass-through", "Hidden RFID-blocking passport and wallet pocket"]'::jsonb,
    $specs${"Volume": "22L contracted / 32L fully expanded", "Dimensions": "48 x 30 x 18 cm", "Weight": "1.18 kg", "Zippers": "YKK WeatherShield Weatherproof"}$specs$::jsonb,
    '[{"name": "Stealth Slate", "hex": "#334155"}, {"name": "Olive Drab", "hex": "#365314"}, {"name": "Coyote Tan", "hex": "#a16207"}]'::jsonb,
    '[]'::jsonb,
    'backpack',
    '#475569',
    '["backpack", "travel", "laptop bag", "fashion", "commute"]'::jsonb
),
(
    'eko-prod-10',
    'Pure Cloud Ultra-Hydrating Ceramide Barrier Cream',
    'Aura Derma Labs',
    'Beauty',
    'Beauty',
    42.00,
    52.00,
    4.88,
    487,
    true,
    false,
    true,
    false,
    false,
    78,
    19,
    'Top Rated',
    'Biomimetic 5-ceramide complex with colloidal oat and shea lipid butter for deep moisture lock.',
    'Repair compromised epidermal moisture barriers with Pure Cloud cream. Delivers intense 72-hour sustained moisture without heaviness or greasiness.',
    '["Patented 5-Ceramide complex (EOP, NS, NP, AS, AP)", "Micro-encapsulated niacinamide 3% for redness calibration", "Colloidal fermented oat flour soothing eczema-prone skin", "Airless hygienic dispenser protects active botanicals", "Dermatologist tested and approved for sensitive skin"]'::jsonb,
    $specs${"Volume": "60ml / 2.0 fl. oz.", "Texture": "Weightless whipped cloud emulsion", "Fragrance": "100% Unscented & Essential-oil Free", "Country of Origin": "France"}$specs$::jsonb,
    '[{"name": "Porcelain White", "hex": "#f8fafc"}]'::jsonb,
    '["60ml", "100ml"]'::jsonb,
    'cream',
    '#ec4899',
    '["skincare", "moisturizer", "ceramides", "beauty", "sensitive-skin"]'::jsonb
),
(
    'eko-prod-11',
    'OpticShield Titanium Blue-Light Gaming Glasses',
    'OpticVision Labs',
    'Fashion',
    'Fashion',
    79.00,
    99.00,
    4.70,
    312,
    true,
    false,
    false,
    true,
    false,
    81,
    20,
    'Save $20',
    'Super-elastic memory titanium frames weighing only 14 grams with anti-glare anti-fatigue CR-39 lenses.',
    'Say goodbye to dry eyes and late-night digital insomnia. OpticShield filters 95% of harmful 415-455nm blue light spectrum emitted by OLED monitors and smartphone screens.',
    '["Blocks 95% high-energy visible HEV blue spectrum light", "Featherlight Beta-Titanium flex temples (only 14 grams total)", "Hydrophobic & Oleophobic anti-smudge anti-static coating", "Zero color distortion with clear high-definition optical clarity", "Includes hard aluminum travel case and microfiber polishing pouch"]'::jsonb,
    $specs${"Weight": "14 grams", "Frame Width": "138 mm", "Lens Width": "52 mm", "Bridge": "18 mm", "Temple": "145 mm"}$specs$::jsonb,
    '[{"name": "Matte Gunmetal", "hex": "#475569"}, {"name": "Rose Gold Titanium", "hex": "#fb7185"}, {"name": "Obsidian Black", "hex": "#0f172a"}]'::jsonb,
    '[]'::jsonb,
    'glasses',
    '#6366f1',
    '["glasses", "accessories", "eyewear", "gaming", "office"]'::jsonb
),
(
    'eko-prod-12',
    'Minimalist Solid Oak Modular Bookcase Shelf',
    'Nordic Craftwork',
    'Home & Kitchen',
    'Home & Kitchen',
    280.00,
    350.00,
    4.82,
    128,
    true,
    false,
    false,
    false,
    true,
    0,
    20,
    'New Arrival',
    'FSC-certified sustainable solid European white oak with tool-free mortise-and-tenon assembly.',
    'An architectural centerpiece for living spaces and home libraries. Crafted by third-generation Scandinavian woodworkers using heritage joinery.',
    '["100% Solid European White Oak sustainably harvested (FSC-Certified)", "Innovative interlocking mortise-and-tenon joints - zero screws required", "Natural non-toxic matte hardwax oil protective finish", "Configurable tiered shelves accommodate books, vinyl, and ceramics", "Engineered to support over 50kg (110 lbs) per shelf tier"]'::jsonb,
    $specs${"Dimensions": "120cm Width x 35cm Depth x 165cm Height", "Material": "Solid European White Oak", "Assembly Time": "Under 15 minutes, no tools required", "Weight": "38 kg"}$specs$::jsonb,
    '[{"name": "Natural White Oak", "hex": "#d4b996"}, {"name": "Smoked Walnut Stain", "hex": "#573a24"}, {"name": "Ebony Stained Oak", "hex": "#1c1917"}]'::jsonb,
    '[]'::jsonb,
    'shelf',
    '#b45309',
    '["furniture", "home decor", "storage", "oak", "minimalist"]'::jsonb
),
(
    'eko-prod-13',
    'The Modernist Home & Architecture Hardcover Anthology',
    'Atelier Press',
    'Books',
    'Books',
    55.00,
    70.00,
    4.96,
    94,
    true,
    false,
    false,
    false,
    false,
    0,
    21,
    'Curator Choice',
    '420-page collector cloth-bound volume celebrating 20th-century modernist residential design.',
    'A breathtaking exploration of iconic architecture, featuring full-color photography of mid-century residences by Le Corbusier, Alvar Aalto, Mies van der Rohe, and Frank Lloyd Wright.',
    '["420 heavyweight matte 170gsm archival art pages", "Linen cloth-bound hardcover with debossed foil typography", "Over 350 exclusive high-resolution architectural photographs", "Essays by renowned architectural historians and urbanists", "Includes full-scale fold-out blueprint architectural floor plans"]'::jsonb,
    $specs${"Format": "Hardcover with linen slipcase", "Pages": "420 pages", "Dimensions": "26 x 33 x 4.5 cm", "Language": "English", "ISBN": "978-0-394-82194-2"}$specs$::jsonb,
    '[{"name": "Terracotta Cloth", "hex": "#c2410c"}, {"name": "Linen Cream", "hex": "#fef3c7"}]'::jsonb,
    '[]'::jsonb,
    'book',
    '#c2410c',
    '["book", "art", "architecture", "design", "gift"]'::jsonb
),
(
    'eko-prod-14',
    'Single-Origin Yirgacheffe Ethiopia Reserve Whole Beans',
    'Roaster Guild Reserve',
    'Groceries',
    'Groceries',
    22.00,
    26.00,
    4.92,
    410,
    true,
    false,
    true,
    false,
    false,
    89,
    15,
    'Top Seller',
    'Grade 1 heirloom Arabica beans with tasting notes of jasmine blossom, bergamot, and sweet peach.',
    'Grown at altitudes exceeding 2,100 meters in the misty Gedeo zone of southern Ethiopia. Naturally washed and sun-dried on African raised beds to highlight crisp floral acidity.',
    '["Grade 1 certified high-elevation heirloom Ethiopian Arabica", "Notes of delicate jasmine blossom, bergamot tea, and ripe peach", "Light-medium roast profile optimizing delicate floral aromas", "Roasted weekly in small 12kg micro-batches", "Degassing valve foil packaging with resealable zipper seal"]'::jsonb,
    $specs${"Weight": "350 grams (12.3 oz)", "Process": "Washed, Sun-dried on Raised Beds", "Altitude": "2,050 – 2,200 meters", "Roast Level": "Light-Medium Specialty"}$specs$::jsonb,
    '[{"name": "Kraft Matte Pouch", "hex": "#78350f"}]'::jsonb,
    '["250g", "350g", "1kg"]'::jsonb,
    'coffee',
    '#854d0e',
    '["coffee", "groceries", "artisan", "organic", "specialty"]'::jsonb
)
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    brand = EXCLUDED.brand,
    category_id = EXCLUDED.category_id,
    category_name = EXCLUDED.category_name,
    price = EXCLUDED.price,
    original_price = EXCLUDED.original_price,
    rating = EXCLUDED.rating,
    reviews_count = EXCLUDED.reviews_count,
    is_active = EXCLUDED.is_active,
    is_featured = EXCLUDED.is_featured,
    is_bestseller = EXCLUDED.is_bestseller,
    is_special_offer = EXCLUDED.is_special_offer,
    is_new_arrival = EXCLUDED.is_new_arrival,
    claimed_percentage = EXCLUDED.claimed_percentage,
    discount_percentage = EXCLUDED.discount_percentage,
    badge = EXCLUDED.badge,
    short_description = EXCLUDED.short_description,
    full_description = EXCLUDED.full_description,
    features = EXCLUDED.features,
    specs = EXCLUDED.specs,
    colors = EXCLUDED.colors,
    sizes = EXCLUDED.sizes,
    visual_type = EXCLUDED.visual_type,
    accent_color = EXCLUDED.accent_color,
    tags = EXCLUDED.tags;

-- Seed inventory for all products
INSERT INTO public.inventory (product_id, stock_count, low_stock_threshold) VALUES
('eko-prod-1', 18, 5),
('eko-prod-2', 24, 6),
('eko-prod-3', 14, 4),
('eko-prod-4', 32, 5),
('eko-prod-5', 45, 8),
('eko-prod-6', 9, 3),
('eko-prod-7', 28, 5),
('eko-prod-8', 19, 4),
('eko-prod-9', 22, 5),
('eko-prod-10', 36, 6),
('eko-prod-11', 15, 3),
('eko-prod-12', 7, 2),
('eko-prod-13', 25, 5),
('eko-prod-14', 50, 10)
ON CONFLICT (product_id) DO UPDATE SET
    stock_count = EXCLUDED.stock_count,
    low_stock_threshold = EXCLUDED.low_stock_threshold,
    updated_at = timezone('utc'::text, now());

-- ==============================================================================
-- 14. SEED DATA: PRODUCT REVIEWS
-- ==============================================================================
INSERT INTO public.reviews (id, product_id, author_name, rating, title, comment, verified_purchase, helpful_votes, created_at)
VALUES
('a1111111-1111-4111-8111-111111111111', 'eko-prod-1', 'Rahul Sharma', 5, 'Unbelievable sound for this price!', 'The boAt Airdopes 141 Pro battery life is insane. I charged it once on Sunday and it lasted the entire week of office calls and workouts. ASAP charging is a lifesaver.', true, 18, NOW() - INTERVAL '4 days'),
('a1111111-1111-4111-8111-111111111112', 'eko-prod-1', 'Ananya Gupta', 5, 'Crystal clear calling and instant pairing', 'The quad mics with ENx cancel out traffic noise effortlessly. Bluetooth 5.3 connection is instant the moment you flip open the lid.', true, 9, NOW() - INTERVAL '10 days'),
('a1111111-1111-4111-8111-111111111113', 'eko-prod-2', 'Priya Patel', 5, 'Best smartwatch under ₹15,000', 'The rotating crown makes navigating through messages so smooth. Display is super crisp even in bright Indian afternoon sunlight. Calling quality is 10/10.', true, 24, NOW() - INTERVAL '6 days'),
('a1111111-1111-4111-8111-111111111114', 'eko-prod-3', 'Amitabh Sen', 5, 'Solid build and perfect for daily commute', 'Carries my 15.6 inch Dell laptop, charger, umbrella, and water bottle comfortably. The shoulder padding is really thick and does not strain your back.', true, 15, NOW() - INTERVAL '12 days'),
('a1111111-1111-4111-8111-111111111115', 'eko-prod-4', 'Vikram Rathore', 5, 'Extremely comfortable for morning running', 'The hyper-cushion sole absorbs impact very well on asphalt roads. Lightweight breathable mesh prevents sweat build up.', true, 11, NOW() - INTERVAL '15 days'),
('a1111111-1111-4111-8111-111111111116', 'eko-prod-5', 'Meera Nambiar', 5, 'Induction base works like a charm', 'Heats evenly, does not burn lentils, and the safety valve gives great peace of mind. Genuine 304 food-grade steel.', true, 27, NOW() - INTERVAL '8 days')
ON CONFLICT (id) DO NOTHING;
 
-- ==============================================================================
-- 15. STORAGE BUCKET: product-images & RLS POLICIES
-- ==============================================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'product-images',
    'product-images',
    true,
    5242880, -- 5 MB limit
    ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
    public = true,
    file_size_limit = 5242880,
    allowed_mime_types = ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

-- 1. Public Read Access: Anyone can view product images
DROP POLICY IF EXISTS "Public Read Product Images" ON storage.objects;
CREATE POLICY "Public Read Product Images"
ON storage.objects FOR SELECT
USING (bucket_id = 'product-images');

-- 2. Admin Insert Access: Only authenticated admins can upload
DROP POLICY IF EXISTS "Admin Upload Product Images" ON storage.objects;
CREATE POLICY "Admin Upload Product Images"
ON storage.objects FOR INSERT
WITH CHECK (
    bucket_id = 'product-images'
    AND (
        auth.role() = 'authenticated'
        AND EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
        )
    )
);

-- 3. Admin Update Access: Only authenticated admins can update
DROP POLICY IF EXISTS "Admin Update Product Images" ON storage.objects;
CREATE POLICY "Admin Update Product Images"
ON storage.objects FOR UPDATE
USING (
    bucket_id = 'product-images'
    AND (
        auth.role() = 'authenticated'
        AND EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
        )
    )
);

-- 4. Admin Delete Access: Only authenticated admins can delete
DROP POLICY IF EXISTS "Admin Delete Product Images" ON storage.objects;
CREATE POLICY "Admin Delete Product Images"
ON storage.objects FOR DELETE
USING (
    bucket_id = 'product-images'
    AND (
        auth.role() = 'authenticated'
        AND EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
        )
    )
);

