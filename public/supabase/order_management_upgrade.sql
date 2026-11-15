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

-- Create fast lookup & uniqueness indexes
CREATE INDEX IF NOT EXISTS idx_orders_is_archived ON public.orders(is_archived_by_admin);
CREATE INDEX IF NOT EXISTS idx_orders_is_hidden ON public.orders(is_hidden_by_customer);
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders(status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_unique_order_number ON public.orders(order_number);
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_unique_trimmed_order_number ON public.orders((trim(order_number)));
CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_records_unique_order_id ON public.payment_records(order_id);
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS gst_rate NUMERIC(5, 2);

DO $$
DECLARE
    v_bad_gst_count INTEGER;
    v_has_gst_check BOOLEAN;
BEGIN
    SELECT count(*) INTO v_bad_gst_count
    FROM public.products
    WHERE gst_rate IS NOT NULL AND (gst_rate < 0 OR gst_rate > 100);

    IF v_bad_gst_count > 0 THEN
        RAISE EXCEPTION
            'Manual reconciliation required: % product(s) in public.products have invalid gst_rate values outside 0..100.',
            v_bad_gst_count;
    END IF;

    SELECT EXISTS (
        SELECT 1
        FROM pg_constraint con
        JOIN pg_class rel ON rel.oid = con.conrelid
        JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
        JOIN pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY (con.conkey)
        WHERE nsp.nspname = 'public'
          AND rel.relname = 'products'
          AND con.contype = 'c'
          AND con.convalidated = true
          AND att.attname = 'gst_rate'
          AND pg_get_constraintdef(con.oid) ~* 'gst_rate\s*>=\s*0'
          AND pg_get_constraintdef(con.oid) ~* 'gst_rate\s*<=\s*100'
    ) INTO v_has_gst_check;

    IF NOT v_has_gst_check THEN
        ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_gst_rate_check;
        ALTER TABLE public.products
            ADD CONSTRAINT products_gst_rate_check
            CHECK (gst_rate IS NULL OR (gst_rate >= 0 AND gst_rate <= 100));
    END IF;
END;
$$;

-- 2. Upgrade public.profiles with Multiple Saved Addresses and Detailed Address Fields
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS saved_addresses JSONB DEFAULT '[]'::jsonb NOT NULL;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS district TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS pin_code TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS house_building TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS street_area TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS landmark TEXT;

-- 3. Atomic Order Placement RPC (ACID Transaction, Server-Only, Row-Locked Pricing/GST)
-- Wraps order creation, authoritative row-locked product/GST pricing, customer/address validation,
-- UTR check, order_items insertion, aggregated inventory deduction, and payment record creation in a single transaction.
CREATE OR REPLACE FUNCTION public.create_complete_order(
    p_order JSONB,
    p_items JSONB,
    p_payment JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_order_id UUID;
    v_order_number TEXT;
    v_user_id UUID;
    v_raw_user_id TEXT;
    v_requested_status TEXT;
    v_requested_payment_status TEXT;
    v_order_payment_status TEXT;
    v_payment_method TEXT;
    v_tx_ref TEXT;

    -- Customer & shipping address validation
    v_addr JSONB;
    v_customer_name TEXT;
    v_customer_email TEXT;
    v_customer_phone TEXT;
    v_house TEXT;
    v_street TEXT;
    v_city TEXT;
    v_state TEXT;
    v_pin TEXT;

    -- Server-computed pricing
    v_coupon_code TEXT;
    v_shipping_speed TEXT;
    v_subtotal NUMERIC(10, 2) := 0;
    v_discount NUMERIC(10, 2) := 0;
    v_base_shipping NUMERIC(10, 2) := 0;
    v_shipping NUMERIC(10, 2) := 0;
    v_taxable NUMERIC(10, 2) := 0;
    v_tax NUMERIC(10, 2) := 0;
    v_total NUMERIC(10, 2) := 0;

    -- Row-locked consistent product pricing & GST snapshot
    v_product_ids TEXT[] := ARRAY[]::TEXT[];
    v_product_snapshot JSONB := '{}'::jsonb;
    v_prod_row RECORD;
    v_snap JSONB;
    v_item JSONB;
    v_item_product_id TEXT;
    v_item_qty INTEGER;
    v_db_price NUMERIC(10, 2);
    v_db_name TEXT;
    v_db_gst_rate NUMERIC(5, 2);
    v_line_total NUMERIC(10, 2);
    v_item_taxable_share NUMERIC(10, 2);
    v_item_tax NUMERIC(10, 2);
    v_agg RECORD;
    v_deducted BOOLEAN;
BEGIN
    IF current_user NOT IN ('postgres', 'supabase_admin', 'service_role')
       AND COALESCE(auth.role(), '') <> 'service_role' THEN
        RAISE EXCEPTION 'Unauthorized: create_complete_order can only be executed by authorized server-side workflows.';
    END IF;

    v_order_number := NULLIF(trim(COALESCE(p_order->>'order_number', '')), '');
    IF v_order_number IS NULL OR length(v_order_number) < 3 THEN
        RAISE EXCEPTION 'Invalid order_number: a valid order_number (min 3 characters) is required.'
            USING ERRCODE = '22023';
    END IF;

    IF EXISTS (SELECT 1 FROM public.orders WHERE trim(order_number) = v_order_number) THEN
        RAISE EXCEPTION 'Duplicate order_number (%): order already exists.', v_order_number
            USING ERRCODE = '23505';
    END IF;

    v_requested_status := NULLIF(trim(COALESCE(p_order->>'status', '')), '');
    IF v_requested_status IS NOT NULL AND v_requested_status <> 'order_placed' THEN
        RAISE EXCEPTION 'Invalid initial order status (%): new orders must start in order_placed state.', v_requested_status
            USING ERRCODE = '22023';
    END IF;

    v_requested_payment_status := NULLIF(trim(COALESCE(p_payment->>'payment_status', '')), '');
    IF v_requested_payment_status IS NOT NULL AND v_requested_payment_status <> 'pending_admin_verification' THEN
        RAISE EXCEPTION 'Invalid initial payment status (%): new orders must start in pending_admin_verification state.', v_requested_payment_status
            USING ERRCODE = '22023';
    END IF;

    v_order_payment_status := NULLIF(trim(COALESCE(p_order->>'payment_status', '')), '');
    IF v_order_payment_status IS NOT NULL AND v_order_payment_status <> 'pending_admin_verification' THEN
        RAISE EXCEPTION 'Invalid initial order payment_status (%): new orders must start in pending_admin_verification state.', v_order_payment_status
            USING ERRCODE = '22023';
    END IF;

    v_addr := COALESCE(p_order->'shipping_address', '{}'::jsonb);
    IF jsonb_typeof(v_addr) <> 'object' THEN
        RAISE EXCEPTION 'Invalid shipping_address: object is required.' USING ERRCODE = '22023';
    END IF;

    v_customer_name := NULLIF(trim(COALESCE(p_order->>'customer_name', v_addr->>'fullName', '')), '');
    IF v_customer_name IS NULL THEN
        RAISE EXCEPTION 'Customer full name is required.' USING ERRCODE = '22023';
    END IF;

    v_customer_email := NULLIF(trim(COALESCE(p_order->>'customer_email', p_order->>'guest_email', v_addr->>'email', '')), '');
    IF v_customer_email IS NULL OR v_customer_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN
        RAISE EXCEPTION 'A valid customer email address is required.' USING ERRCODE = '22023';
    END IF;

    v_customer_phone := regexp_replace(
        regexp_replace(trim(COALESCE(p_order->>'customer_phone', v_addr->>'phone', '')), '[\s\-\+\(\)]+', '', 'g'),
        '^91(?=[0-9]{10}$)',
        ''
    );
    IF v_customer_phone !~ '^[6-9][0-9]{9}$' THEN
        RAISE EXCEPTION 'A valid 10-digit Indian mobile number is required.' USING ERRCODE = '22023';
    END IF;

    v_house := NULLIF(trim(COALESCE(v_addr->>'houseBuilding', v_addr->>'apartment', '')), '');
    v_street := NULLIF(trim(COALESCE(v_addr->>'streetArea', v_addr->>'street', '')), '');
    v_city := NULLIF(trim(COALESCE(v_addr->>'city', '')), '');
    v_state := NULLIF(trim(COALESCE(v_addr->>'state', '')), '');
    v_pin := regexp_replace(trim(COALESCE(v_addr->>'pinCode', v_addr->>'postalCode', '')), '\s+', '', 'g');

    IF v_house IS NULL OR v_street IS NULL OR v_city IS NULL OR v_state IS NULL OR v_pin !~ '^[0-9]{6}$' THEN
        RAISE EXCEPTION 'Complete shipping address (house/building, street/area, city, state, and 6-digit PIN code) is required.'
            USING ERRCODE = '22023';
    END IF;

    -- 5. Strict user_id ownership verification against auth.uid() & auth.users/profiles
    v_raw_user_id := NULLIF(trim(COALESCE(p_order->>'user_id', '')), '');
    IF auth.uid() IS NOT NULL THEN
        IF v_raw_user_id IS NOT NULL THEN
            IF v_raw_user_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
                RAISE EXCEPTION 'Invalid user_id UUID format.' USING ERRCODE = '22023';
            END IF;
            IF v_raw_user_id::UUID IS DISTINCT FROM auth.uid() THEN
                RAISE EXCEPTION 'Ownership mismatch: provided user_id does not match authenticated user.'
                    USING ERRCODE = '42501';
            END IF;
        END IF;
        v_user_id := auth.uid();
    ELSIF v_raw_user_id IS NOT NULL THEN
        IF v_raw_user_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
            RAISE EXCEPTION 'Invalid user_id UUID format.' USING ERRCODE = '22023';
        END IF;
        v_user_id := v_raw_user_id::UUID;
        IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = v_user_id)
           OR NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_user_id) THEN
            RAISE EXCEPTION 'Invalid user_id (%): user account or profile does not exist.', v_user_id
                USING ERRCODE = '22023';
        END IF;
    ELSE
        -- Legitimate guest checkout (validated customer_name, customer_email, customer_phone, and shipping_address)
        v_user_id := NULL;
    END IF;

    v_payment_method := lower(COALESCE(NULLIF(trim(p_payment->>'payment_method'), ''), 'all_upi'));
    IF v_payment_method NOT IN ('google_pay', 'phonepe', 'paytm', 'bhim', 'all_upi', 'gpay_upi') THEN
        RAISE EXCEPTION 'Unsupported payment method (%): only Universal UPI methods are accepted.', v_payment_method
            USING ERRCODE = '22023';
    END IF;

    v_tx_ref := NULLIF(upper(regexp_replace(trim(COALESCE(p_payment->>'transaction_reference', '')), '[\s-]+', '', 'g')), '');
    IF v_tx_ref IS NULL OR v_tx_ref !~ '^[0-9A-Z]{12}$' THEN
        RAISE EXCEPTION 'A valid 12-character alphanumeric UPI Transaction Reference (UTR) is required.'
            USING ERRCODE = '22023';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.payment_records
        WHERE upper(regexp_replace(trim(COALESCE(transaction_reference, '')), '[\s-]+', '', 'g')) = v_tx_ref
    ) THEN
        RAISE EXCEPTION 'Duplicate transaction reference (%): already recorded for another order.', v_tx_ref
            USING ERRCODE = '23505';
    END IF;

    IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'Order must contain at least one item.' USING ERRCODE = '22023';
    END IF;

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_item_product_id := NULLIF(trim(COALESCE(v_item->>'product_id', '')), '');
        IF v_item_product_id IS NULL THEN
            RAISE EXCEPTION 'Invalid order item: product_id is required for every item.' USING ERRCODE = '22023';
        END IF;

        IF COALESCE(v_item->>'quantity', '') !~ '^[0-9]+$' THEN
            RAISE EXCEPTION 'Invalid order item quantity (%): must be a positive integer.', v_item->>'quantity'
                USING ERRCODE = '22023';
        END IF;
        v_item_qty := (v_item->>'quantity')::INTEGER;
        IF v_item_qty <= 0 THEN
            RAISE EXCEPTION 'Invalid order item quantity (%): quantity must be greater than zero.', v_item_qty
                USING ERRCODE = '22023';
        END IF;

        IF NOT (v_item_product_id = ANY (v_product_ids)) THEN
            v_product_ids := array_append(v_product_ids, v_item_product_id);
        END IF;
    END LOOP;

    -- Lock all ordered products (FOR SHARE blocks concurrent Admin price/gst_rate updates
    -- for this transaction without blocking concurrent read-only checkouts) and capture
    -- a single authoritative transaction-consistent snapshot.
    FOR v_prod_row IN
        SELECT p.id, p.name, ROUND(p.price::NUMERIC, 2) AS unit_price, p.gst_rate, p.is_active
        FROM public.products p
        WHERE p.id = ANY (v_product_ids)
        ORDER BY p.id
        FOR SHARE
    LOOP
        IF v_prod_row.is_active IS DISTINCT FROM TRUE THEN
            RAISE EXCEPTION 'Product "%" (%) is inactive or unavailable and cannot be ordered.',
                v_prod_row.name, v_prod_row.id
                USING ERRCODE = '22023';
        END IF;

        IF v_prod_row.gst_rate IS NULL OR v_prod_row.gst_rate < 0 OR v_prod_row.gst_rate > 100 THEN
            RAISE EXCEPTION 'GST configuration error for product "%" (%): product gst_rate is not configured. Configure an explicit GST slab before commercial checkout.',
                v_prod_row.name, v_prod_row.id
                USING ERRCODE = '22023';
        END IF;

        v_product_snapshot := jsonb_set(
            v_product_snapshot,
            ARRAY[v_prod_row.id],
            jsonb_build_object(
                'name', v_prod_row.name,
                'price', v_prod_row.unit_price,
                'gst_rate', v_prod_row.gst_rate
            ),
            true
        );
    END LOOP;

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_item_product_id := trim(v_item->>'product_id');
        v_item_qty := (v_item->>'quantity')::INTEGER;
        v_snap := v_product_snapshot -> v_item_product_id;

        IF v_snap IS NULL THEN
            RAISE EXCEPTION 'Invalid or nonexistent product (%) in order items.', v_item_product_id
                USING ERRCODE = '22023';
        END IF;

        v_db_price := (v_snap->>'price')::NUMERIC(10, 2);
        v_db_name := v_snap->>'name';
        v_line_total := ROUND(v_db_price * v_item_qty, 2);

        IF NULLIF(trim(COALESCE(v_item->>'unit_price', '')), '') IS NOT NULL THEN
            IF trim(v_item->>'unit_price') !~ '^-?[0-9]+(\.[0-9]+)?$'
               OR ABS((v_item->>'unit_price')::NUMERIC - v_db_price) > 0.01 THEN
                RAISE EXCEPTION 'Price mismatch for product %: submitted unit_price (%) does not match authoritative snapshot price (%).',
                    v_item_product_id, v_item->>'unit_price', v_db_price
                    USING ERRCODE = '22023';
            END IF;
        END IF;

        IF NULLIF(trim(COALESCE(v_item->>'total_price', '')), '') IS NOT NULL THEN
            IF trim(v_item->>'total_price') !~ '^-?[0-9]+(\.[0-9]+)?$'
               OR ABS((v_item->>'total_price')::NUMERIC - v_line_total) > 0.01 THEN
                RAISE EXCEPTION 'Line total mismatch for product %: submitted total_price (%) does not match calculated total (%).',
                    v_item_product_id, v_item->>'total_price', v_line_total
                    USING ERRCODE = '22023';
            END IF;
        END IF;

        v_subtotal := ROUND(v_subtotal + v_line_total, 2);
    END LOOP;

    v_coupon_code := NULLIF(upper(trim(COALESCE(p_order->>'coupon_code', ''))), '');
    IF v_coupon_code IS NULL THEN
        v_discount := 0;
    ELSIF v_coupon_code = 'SHOPCART10' THEN
        v_discount := ROUND((v_subtotal * 10.0) / 100.0, 2);
    ELSIF v_coupon_code = 'SAVE20' THEN
        v_discount := ROUND(LEAST(200.0, v_subtotal), 2);
    ELSIF v_coupon_code = 'WELCOME' THEN
        v_discount := ROUND((v_subtotal * 15.0) / 100.0, 2);
    ELSE
        RAISE EXCEPTION 'Invalid or unsupported coupon code (%).', v_coupon_code USING ERRCODE = '22023';
    END IF;

    v_shipping_speed := lower(COALESCE(
        NULLIF(trim(COALESCE(p_order->>'shipping_speed', '')), ''),
        NULLIF(trim(COALESCE(v_addr->>'shippingSpeed', '')), ''),
        'standard'
    ));
    IF v_shipping_speed NOT IN ('standard', 'express') THEN
        RAISE EXCEPTION 'Invalid shipping_speed (%): expected standard or express.', v_shipping_speed
            USING ERRCODE = '22023';
    END IF;

    v_base_shipping := CASE
        WHEN v_subtotal = 0 THEN 0
        WHEN v_subtotal >= 499 THEN 0
        ELSE 49
    END;
    v_shipping := ROUND(CASE WHEN v_shipping_speed = 'express' THEN v_base_shipping + 99 ELSE v_base_shipping END, 2);
    v_taxable := GREATEST(0, ROUND(v_subtotal - v_discount, 2));

    -- Strictly compute per-item GST using the locked snapshot (NEVER falls back to 8%)
    v_tax := 0;
    IF v_subtotal > 0 AND v_taxable > 0 THEN
        FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
        LOOP
            v_item_product_id := trim(v_item->>'product_id');
            v_item_qty := (v_item->>'quantity')::INTEGER;
            v_snap := v_product_snapshot -> v_item_product_id;

            v_db_price := (v_snap->>'price')::NUMERIC(10, 2);
            v_db_gst_rate := (v_snap->>'gst_rate')::NUMERIC(5, 2);
            v_line_total := ROUND(v_db_price * v_item_qty, 2);
            v_item_taxable_share := ROUND((v_line_total * v_taxable) / v_subtotal, 2);
            v_item_tax := ROUND((v_item_taxable_share * v_db_gst_rate) / 100.0, 2);
            v_tax := ROUND(v_tax + v_item_tax, 2);
        END LOOP;
    END IF;

    v_total := ROUND(v_taxable + v_shipping + v_tax, 2);

    IF NULLIF(trim(COALESCE(p_order->>'subtotal', '')), '') IS NOT NULL THEN
        IF trim(p_order->>'subtotal') !~ '^-?[0-9]+(\.[0-9]+)?$'
           OR ABS((p_order->>'subtotal')::NUMERIC - v_subtotal) > 0.01 THEN
            RAISE EXCEPTION 'Order subtotal mismatch: submitted (%) vs authoritative (%).', p_order->>'subtotal', v_subtotal
                USING ERRCODE = '22023';
        END IF;
    END IF;
    IF NULLIF(trim(COALESCE(p_order->>'discount_amount', '')), '') IS NOT NULL THEN
        IF trim(p_order->>'discount_amount') !~ '^-?[0-9]+(\.[0-9]+)?$'
           OR ABS((p_order->>'discount_amount')::NUMERIC - v_discount) > 0.01 THEN
            RAISE EXCEPTION 'Order discount mismatch: submitted (%) vs authoritative (%).', p_order->>'discount_amount', v_discount
                USING ERRCODE = '22023';
        END IF;
    END IF;
    IF NULLIF(trim(COALESCE(p_order->>'shipping_fee', '')), '') IS NOT NULL THEN
        IF trim(p_order->>'shipping_fee') !~ '^-?[0-9]+(\.[0-9]+)?$'
           OR ABS((p_order->>'shipping_fee')::NUMERIC - v_shipping) > 0.01 THEN
            RAISE EXCEPTION 'Shipping fee mismatch: submitted (%) vs authoritative (%).', p_order->>'shipping_fee', v_shipping
                USING ERRCODE = '22023';
        END IF;
    END IF;
    IF NULLIF(trim(COALESCE(p_order->>'tax_amount', '')), '') IS NOT NULL THEN
        IF trim(p_order->>'tax_amount') !~ '^-?[0-9]+(\.[0-9]+)?$'
           OR ABS((p_order->>'tax_amount')::NUMERIC - v_tax) > 0.01 THEN
            RAISE EXCEPTION 'Tax amount mismatch: submitted (%) vs authoritative (%).', p_order->>'tax_amount', v_tax
                USING ERRCODE = '22023';
        END IF;
    END IF;
    IF NULLIF(trim(COALESCE(p_order->>'total_amount', '')), '') IS NOT NULL THEN
        IF trim(p_order->>'total_amount') !~ '^-?[0-9]+(\.[0-9]+)?$'
           OR ABS((p_order->>'total_amount')::NUMERIC - v_total) > 0.01 THEN
            RAISE EXCEPTION 'Order total mismatch: submitted (%) vs authoritative (%).', p_order->>'total_amount', v_total
                USING ERRCODE = '22023';
        END IF;
    END IF;
    IF NULLIF(trim(COALESCE(p_payment->>'amount', '')), '') IS NOT NULL THEN
        IF trim(p_payment->>'amount') !~ '^-?[0-9]+(\.[0-9]+)?$'
           OR ABS((p_payment->>'amount')::NUMERIC - v_total) > 0.01 THEN
            RAISE EXCEPTION 'Payment amount mismatch: submitted (%) vs authoritative order total (%).', p_payment->>'amount', v_total
                USING ERRCODE = '22023';
        END IF;
    END IF;

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
        CASE WHEN v_user_id IS NULL THEN v_customer_email ELSE NULLIF(trim(COALESCE(p_order->>'guest_email', '')), '') END,
        v_customer_name,
        v_customer_email,
        v_customer_phone,
        'order_placed',
        v_subtotal,
        v_discount,
        v_shipping,
        v_tax,
        v_total,
        v_coupon_code,
        v_addr || jsonb_build_object(
            'fullName', v_customer_name,
            'phone', v_customer_phone,
            'email', v_customer_email,
            'houseBuilding', v_house,
            'streetArea', v_street,
            'city', v_city,
            'state', v_state,
            'pinCode', v_pin,
            'postalCode', v_pin,
            'shippingSpeed', v_shipping_speed
        ),
        p_order->>'customer_notes',
        p_order->>'tracking_number',
        COALESCE(NULLIF(trim(COALESCE(p_order->>'carrier', '')), ''), 'Shop Cart Express'),
        (p_order->>'estimated_delivery_date')::TIMESTAMPTZ,
        COALESCE(p_order->'shipment_updates', '[]'::jsonb),
        jsonb_build_array(
            jsonb_build_object(
                'status', 'order_placed',
                'changedAt', timezone('utc'::text, now()),
                'changedBy', v_customer_name,
                'note', 'Order placed successfully'
            )
        ),
        v_payment_method,
        'pending_admin_verification',
        false,
        false
    )
    RETURNING id INTO v_order_id;

    -- Insert order items strictly using the transaction-locked product snapshot
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_item_product_id := trim(v_item->>'product_id');
        v_item_qty := (v_item->>'quantity')::INTEGER;
        v_snap := v_product_snapshot -> v_item_product_id;

        v_db_price := (v_snap->>'price')::NUMERIC(10, 2);
        v_db_name := v_snap->>'name';
        v_line_total := ROUND(v_db_price * v_item_qty, 2);

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
            v_item_product_id,
            v_db_name,
            v_db_price,
            v_item_qty,
            v_line_total,
            v_item->>'selected_color',
            v_item->>'selected_size'
        );
    END LOOP;

    FOR v_agg IN
        SELECT
            trim(elem->>'product_id') AS product_id,
            SUM((elem->>'quantity')::INTEGER)::INTEGER AS total_qty
        FROM jsonb_array_elements(p_items) AS elem
        GROUP BY trim(elem->>'product_id')
    LOOP
        v_deducted := public.deduct_product_inventory(
            v_agg.product_id,
            v_agg.total_qty,
            v_order_number,
            v_order_id
        );

        IF v_deducted IS DISTINCT FROM TRUE THEN
            RAISE EXCEPTION 'Insufficient stock or duplicate inventory deduction for product % on order %.',
                v_agg.product_id, v_order_number
                USING ERRCODE = '22023';
        END IF;
    END LOOP;

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
        v_payment_method,
        v_total,
        'INR',
        'pending_admin_verification',
        v_tx_ref,
        p_payment->>'screenshot_url',
        COALESCE(p_payment->'ai_analysis', '{}'::jsonb),
        (p_payment->>'ai_confidence_score')::NUMERIC,
        p_payment->>'ai_recommendation',
        COALESCE(p_payment->'suspicious_indicators', '[]'::jsonb),
        COALESCE(p_payment->'raw_details', '{}'::jsonb)
    );

    RETURN jsonb_build_object(
        'success', true,
        'order_id', v_order_id,
        'order_number', v_order_number,
        'status', 'order_placed',
        'payment_status', 'pending_admin_verification',
        'transaction_reference', v_tx_ref,
        'subtotal', v_subtotal,
        'discount_amount', v_discount,
        'shipping_fee', v_shipping,
        'tax_amount', v_tax,
        'total_amount', v_total
    );
END;
$$;

REVOKE ALL ON FUNCTION public.create_complete_order(JSONB, JSONB, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_complete_order(JSONB, JSONB, JSONB) TO service_role;

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

DROP POLICY IF EXISTS "Anyone can place order" ON public.orders;
DROP POLICY IF EXISTS "Users can update own orders" ON public.orders;
DROP POLICY IF EXISTS "Anyone can insert order items with order" ON public.order_items;
DROP POLICY IF EXISTS "Anyone can record payment during checkout" ON public.payment_records;

REVOKE ALL ON TABLE public.orders FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.order_items FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.payment_records FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.order_shipment_updates FROM PUBLIC, anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.orders FROM authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.order_items FROM authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.payment_records FROM authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.order_shipment_updates FROM authenticated;
GRANT SELECT ON TABLE public.orders TO authenticated;
GRANT SELECT ON TABLE public.order_items TO authenticated;
GRANT SELECT ON TABLE public.payment_records TO authenticated;
GRANT SELECT ON TABLE public.order_shipment_updates TO authenticated;
GRANT ALL ON TABLE public.orders TO service_role;
GRANT ALL ON TABLE public.order_items TO service_role;
GRANT ALL ON TABLE public.payment_records TO service_role;
GRANT ALL ON TABLE public.order_shipment_updates TO service_role;

-- Customer can view own orders
DROP POLICY IF EXISTS "Users can view own orders" ON public.orders;
CREATE POLICY "Users can view own orders" ON public.orders
    FOR SELECT TO authenticated
    USING (auth.uid() = user_id);

-- Admins can view all orders
DROP POLICY IF EXISTS "Admins can view all orders" ON public.orders;
CREATE POLICY "Admins can view all orders" ON public.orders
    FOR SELECT TO authenticated
    USING (public.is_admin());

-- Admins can manage all orders
DROP POLICY IF EXISTS "Admins can update orders" ON public.orders;
CREATE POLICY "Admins can update orders" ON public.orders
    FOR UPDATE TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
