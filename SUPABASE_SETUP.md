# Ekomart — Supabase Backend Integration Guide

This guide walks you through connecting Ekomart to your live Supabase PostgreSQL database in under 3 minutes.

---

## 1. Quick Architecture Overview

Ekomart is fully integrated with Supabase for:
- **Product Catalog & Categories**: Fetches real-time products, categories, specs, variants, and badges from PostgreSQL.
- **Inventory Control**: Real-time stock counts and atomic deductions using the PostgreSQL function `deduct_product_inventory`.
- **User Authentication & Customer Profiles**: Syncs with Supabase Auth (`auth.users`) and customer profile metadata (`public.profiles`).
- **Shopping Cart Persistence**: Authenticated customer cart items and "Saved for Later" products are persisted to `public.carts` and `public.cart_items`.
- **Order Management & Checkout**: Saves validated orders (`public.orders`), purchased line items (`public.order_items`), and payment audit records (`public.payment_records`).
- **Row Level Security (RLS)**: Enforces that customers only read and modify their own carts/orders, while the public can read active products.

---

## 2. Step 1: Create a Free Supabase Project

1. Go to [https://supabase.com](https://supabase.com) and log in or create a free account.
2. Click **"New Project"**.
3. Choose a name (e.g. `ekomart-store`), generate a secure database password, and pick your closest region.
4. Click **"Create new project"** and wait ~60 seconds for provisioning.

---

## 3. Step 2: Run the SQL Schema Migration

1. In your Supabase Dashboard, click on **SQL Editor** in the left sidebar.
2. Click **"New query"**.
3. Copy the entire contents of the `supabase/schema.sql` file in this repository.
4. Paste it into the SQL editor and click **"Run"** (or press `Cmd + Enter` / `Ctrl + Enter`).
5. You should see `Success. No rows returned`. All tables, triggers, inventory functions, RLS policies, and seed products are now live!

---

## 4. Step 3: Get Your API Credentials

1. In your Supabase Dashboard, go to **Project Settings** (gear icon at the bottom of the left sidebar).
2. Select **API**.
3. Find your **Project URL** (e.g. `https://xyzcompany.supabase.co`).
4. Find your **Project API keys** and copy the **`anon` `public`** key.
   > ⚠️ **SECURITY WARNING**: Never expose your `service_role` secret key in frontend code. Ekomart uses the `anon` key combined with Supabase Row Level Security (RLS) to keep customer data completely safe.

---

## 5. Step 4: Configure Ekomart

You can connect in either of two ways:

### Option A: Via Environment Variables (Recommended for Deployment)
Create or edit your `.env` file in the root directory:

```env
VITE_SUPABASE_URL="https://your-project-id.supabase.co"
VITE_SUPABASE_ANON_KEY="your-anon-public-key-here"
```

### Option B: Instant In-App Connect (Zero-Restart UI)
1. Open the Ekomart web app in your browser.
2. Look at the top navigation bar or footer and click **"Supabase Backend"** or the database connection status indicator.
3. Paste your **Supabase URL** and **Anon Key** into the connection modal.
4. Click **"Save & Connect"**. The app will immediately verify connection to your live database!

---

## 6. Verification Checklist

- [x] Check **Table Editor** in Supabase: Verify 14 products in `products`, 8 categories in `categories`, and 14 records in `inventory`.
- [x] Sign up a new user or log in on Ekomart: A row will automatically appear in `profiles`.
- [x] Add an item to the shopping cart: A row will appear in `carts` and `cart_items`.
- [x] Complete checkout: A new order appears in `orders`, items in `order_items`, payment reference in `payment_records`, and inventory stock count decrements safely!
- [x] Amazon-style Order Tracking: Tracks package milestones (`order_placed`, `confirmed`, `processing`, `shipped`, `out_for_delivery`, `delivered`, `cancelled`, `refunded`), carrier tracking numbers, and real-time shipment updates in `public.orders` and `public.order_shipment_updates`!

---

## 7. Migration for Existing Projects (Order Tracking Upgrade)

If you already created your database earlier, run this quick SQL update in the Supabase **SQL Editor**:

```sql
-- Add tracking and logistics columns to orders table
ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS tracking_number TEXT,
ADD COLUMN IF NOT EXISTS carrier TEXT DEFAULT 'Ekomart Express',
ADD COLUMN IF NOT EXISTS estimated_delivery_date TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS shipment_updates JSONB DEFAULT '[]'::jsonb NOT NULL;

-- Create order_shipment_updates table
CREATE TABLE IF NOT EXISTS public.order_shipment_updates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE NOT NULL,
    status TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    location TEXT,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS for order_shipment_updates
ALTER TABLE public.order_shipment_updates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own order shipment updates" ON public.order_shipment_updates;
CREATE POLICY "Users can view own order shipment updates" ON public.order_shipment_updates
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.orders
            WHERE orders.id = order_shipment_updates.order_id
            AND (orders.user_id = auth.uid() OR public.is_admin())
        )
    );

DROP POLICY IF EXISTS "Admins can manage order shipment updates" ON public.order_shipment_updates;
CREATE POLICY "Admins can manage order shipment updates" ON public.order_shipment_updates
    FOR ALL USING (public.is_admin());

DROP POLICY IF EXISTS "Admins can update orders" ON public.orders;
CREATE POLICY "Admins can update orders" ON public.orders
    FOR UPDATE USING (public.is_admin());
```
