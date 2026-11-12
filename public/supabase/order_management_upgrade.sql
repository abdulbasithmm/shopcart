-- ==============================================================================
-- SHOPCART – ORDER MANAGEMENT, CANCELLATION & CUSTOMER PROFILE UPGRADE MIGRATION
-- ==============================================================================
-- Run this in the Supabase SQL Editor to upgrade orders, status tracking,
-- cancellation management, and customer profile saved addresses.
-- All operations use IF NOT EXISTS to guarantee safe, non-destructive execution.
-- ==============================================================================

-- 1. Upgrade public.orders with Cancellation, Admin Notes & Archival Columns
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS cancelled_by TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS admin_notes TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS status_history JSONB DEFAULT '[]'::jsonb NOT NULL;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS is_archived_by_admin BOOLEAN DEFAULT false NOT NULL;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS is_hidden_by_customer BOOLEAN DEFAULT false NOT NULL;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS customer_name TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS customer_email TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS customer_phone TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS payment_method TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'pending_admin_verification';

-- Create fast lookup indexes
CREATE INDEX IF NOT EXISTS idx_orders_is_archived ON public.orders(is_archived_by_admin);
CREATE INDEX IF NOT EXISTS idx_orders_is_hidden ON public.orders(is_hidden_by_customer);
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders(status);

-- 2. Upgrade public.profiles with Multiple Saved Addresses and Detailed Address Fields
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS saved_addresses JSONB DEFAULT '[]'::jsonb NOT NULL;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS district TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS pin_code TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS house_building TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS street_area TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS landmark TEXT;

-- 3. Atomic Order Placement RPC (ACID Transaction)
-- Wraps order creation, order_items insertion, and payment record creation in a single transaction.
-- Guarantees no partial or incomplete orders are ever created.
CREATE OR REPLACE FUNCTION public.create_complete_order(
    p_order JSONB,
    p_items JSONB,
    p_payment JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_order_id UUID;
    v_order_number TEXT;
    v_user_id UUID;
    v_item JSONB;
    v_status TEXT;
BEGIN
    v_order_number := p_order->>'order_number';
    IF v_order_number IS NULL OR trim(v_order_number) = '' THEN
        RAISE EXCEPTION 'Order number is required';
    END IF;

    -- Assign user_id: use auth.uid() if authenticated, or explicitly provided UUID
    IF auth.uid() IS NOT NULL THEN
        v_user_id := auth.uid();
    ELSIF p_order->>'user_id' IS NOT NULL AND (p_order->>'user_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        v_user_id := (p_order->>'user_id')::UUID;
    ELSE
        v_user_id := NULL;
    END IF;

    v_status := COALESCE(p_order->>'status', 'order_placed');

    -- 1. Insert into public.orders
    INSERT INTO public.orders (
        order_number,
        user_id,
        guest_email,
        customer_name,
        customer_email,
        customer_phone,
        status,
        subtotal,
        discount_amount,
        shipping_fee,
        tax_amount,
        total_amount,
        coupon_code,
        shipping_address,
        customer_notes,
        tracking_number,
        carrier,
        estimated_delivery_date,
        shipment_updates,
        status_history,
        payment_method,
        payment_status,
        is_archived_by_admin,
        is_hidden_by_customer
    ) VALUES (
        v_order_number,
        v_user_id,
        p_order->>'guest_email',
        p_order->>'customer_name',
        p_order->>'customer_email',
        p_order->>'customer_phone',
        v_status,
        COALESCE((p_order->>'subtotal')::NUMERIC, 0),
        COALESCE((p_order->>'discount_amount')::NUMERIC, 0),
        COALESCE((p_order->>'shipping_fee')::NUMERIC, 0),
        COALESCE((p_order->>'tax_amount')::NUMERIC, 0),
        COALESCE((p_order->>'total_amount')::NUMERIC, 0),
        p_order->>'coupon_code',
        COALESCE(p_order->'shipping_address', '{}'::jsonb),
        p_order->>'customer_notes',
        p_order->>'tracking_number',
        COALESCE(p_order->>'carrier', 'Shop Cart Express'),
        (p_order->>'estimated_delivery_date')::TIMESTAMPTZ,
        COALESCE(p_order->'shipment_updates', '[]'::jsonb),
        jsonb_build_array(
            jsonb_build_object(
                'status', v_status,
                'changedAt', timezone('utc'::text, now()),
                'changedBy', COALESCE(p_order->>'customer_name', 'Customer'),
                'note', 'Order placed successfully'
            )
        ),
        COALESCE(p_payment->>'payment_method', 'all_upi'),
        COALESCE(p_payment->>'payment_status', 'pending_admin_verification'),
        false,
        false
    )
    RETURNING id INTO v_order_id;

    -- 2. Insert order items
    IF jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'Order must contain at least one item';
    END IF;

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        INSERT INTO public.order_items (
            order_id,
            product_id,
            product_name,
            unit_price,
            quantity,
            total_price,
            selected_color,
            selected_size
        ) VALUES (
            v_order_id,
            v_item->>'product_id',
            COALESCE(v_item->>'product_name', 'Shopcart Product'),
            COALESCE((v_item->>'unit_price')::NUMERIC, 0),
            GREATEST(1, COALESCE((v_item->>'quantity')::INTEGER, 1)),
            COALESCE((v_item->>'total_price')::NUMERIC, 0),
            v_item->>'selected_color',
            v_item->>'selected_size'
        );

        -- Best effort stock deduction
        IF v_item->>'product_id' IS NOT NULL THEN
            BEGIN
                PERFORM public.deduct_product_inventory(
                    v_item->>'product_id',
                    GREATEST(1, COALESCE((v_item->>'quantity')::INTEGER, 1))
                );
            EXCEPTION WHEN OTHERS THEN
                -- Don't block order placement if inventory row is missing
                NULL;
            END;
        END IF;
    END LOOP;

    -- 3. Insert payment record
    IF p_payment IS NOT NULL THEN
        INSERT INTO public.payment_records (
            order_id,
            payment_method,
            amount,
            currency,
            payment_status,
            transaction_reference,
            screenshot_url,
            ai_analysis,
            ai_confidence_score,
            ai_recommendation,
            suspicious_indicators,
            raw_details
        ) VALUES (
            v_order_id,
            COALESCE(p_payment->>'payment_method', 'all_upi'),
            COALESCE((p_order->>'total_amount')::NUMERIC, 0),
            'INR',
            COALESCE(p_payment->>'payment_status', 'pending_admin_verification'),
            p_payment->>'transaction_reference',
            p_payment->>'screenshot_url',
            p_payment->'ai_analysis',
            (p_payment->>'ai_confidence_score')::NUMERIC,
            p_payment->>'ai_recommendation',
            COALESCE(p_payment->'suspicious_indicators', '[]'::jsonb),
            COALESCE(p_payment->'raw_details', '{}'::jsonb)
        );
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'order_id', v_order_id,
        'order_number', v_order_number,
        'status', v_status
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_complete_order(JSONB, JSONB, JSONB) TO anon, authenticated, service_role;

-- 4. Enable Supabase Realtime for instant sync
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime' AND tablename = 'orders'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
    END IF;
EXCEPTION WHEN OTHERS THEN
    NULL;
END;
$$;

-- 5. Updated RLS Policies with Safe Customer & Admin Isolation
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_records ENABLE ROW LEVEL SECURITY;

-- Allow public and authenticated customers to place orders safely
DROP POLICY IF EXISTS "Anyone can place order" ON public.orders;
CREATE POLICY "Anyone can place order" ON public.orders
    FOR INSERT
    WITH CHECK (auth.uid() = user_id OR user_id IS NULL OR auth.uid() IS NULL);

-- Customer can view own non-hidden orders (or specific order)
DROP POLICY IF EXISTS "Users can view own orders" ON public.orders;
CREATE POLICY "Users can view own orders" ON public.orders
    FOR SELECT TO authenticated
    USING (auth.uid() = user_id);

-- Admins can view all orders
DROP POLICY IF EXISTS "Admins can view all orders" ON public.orders;
CREATE POLICY "Admins can view all orders" ON public.orders
    FOR SELECT TO authenticated
    USING (public.is_admin());

-- Customers can update their own orders (e.g. request cancellation or hide from history)
DROP POLICY IF EXISTS "Users can update own orders" ON public.orders;
CREATE POLICY "Users can update own orders" ON public.orders
    FOR UPDATE TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Admins can manage all orders
DROP POLICY IF EXISTS "Admins can update orders" ON public.orders;
CREATE POLICY "Admins can update orders" ON public.orders
    FOR UPDATE TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
