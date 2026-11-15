-- ==============================================================================
-- SHOPCART – FINAL DATABASE SECURITY & SAFETY HARDENING MIGRATION
-- (NON-DESTRUCTIVE / PHASED / IDEMPOTENT / FAIL-CLOSED)
-- ==============================================================================
-- CRITICAL EXECUTION ORDER FOR LIVE SUPABASE SQL EDITOR:
--   Because PostgreSQL rolls back an entire transaction if a later statement
--   raises an exception, run this migration in THREE SEPARATELY COMMITTED PHASES:
--
--     PHASE 1 (Execute & Commit FIRST):
--       Immediate permission lockdown on all functions and order/payment tables.
--       Revokes EXECUTE from PUBLIC, anon, authenticated, AND service_role on
--       every overload of deduct_product_inventory and create_complete_order.
--       Contains NO RAISE EXCEPTION statements so the security lockdown is
--       permanently committed even if Phase 2 detects manual prerequisites.
--
--     PHASE 2 (Execute & Commit SECOND):
--       Complete prerequisite validation (columns, data types, PK/UNIQUE/FK
--       constraints, ID type compatibility, and public.is_admin() helper),
--       gst_rate CHECK constraint audit, function overload dependency audit
--       (NO CASCADE), PG index definition verification, and accurate full-table
--       historical orders/UTR data integrity audit.
--       Halts cleanly with diagnostic errors if manual review is needed.
--
--     PHASE 3 (Execute & Commit THIRD, after Phase 2 passes cleanly):
--       Upgrades inventory_deductions (ON DELETE SET NULL), installs hardened
--       deduct_product_inventory & create_complete_order (with row-locked
--       product pricing/GST snapshots and ZERO 8% universal GST fallback),
--       creates verified unique indexes/triggers, audits ALL RLS policies
--       including broad authenticated SELECT policies, and verifies final state.
--
--   DO NOT wrap Phases 1, 2, and 3 inside one combined BEGIN ... COMMIT block.
--   Zero customer, product, order, payment, inventory, or audit rows are
--   deleted, overwritten, or fabricated. Existing order totals stay untouched.
-- ==============================================================================


-- ##############################################################################
-- PHASE 1: IMMEDIATE PERMISSION LOCKDOWN (EXECUTE & COMMIT INDEPENDENTLY FIRST)
-- ##############################################################################
-- Revokes PUBLIC, anon, authenticated, and service_role EXECUTE across ALL
-- overloads of deduct_product_inventory and create_complete_order, and revokes
-- direct browser write privileges on orders, order_items, payment_records, and
-- order_shipment_updates BEFORE any Phase 2 audit that might raise an exception.
-- NOTE: service_role EXECUTE is NOT granted here; it is granted ONLY to the
-- verified canonical signatures after Phase 3 installs them.
DO $$
DECLARE
    fn_record RECORD;
BEGIN
    FOR fn_record IN
        SELECT p.oid::regprocedure AS fn_sig
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname IN ('deduct_product_inventory', 'create_complete_order')
          AND p.prokind = 'f'
    LOOP
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated, service_role;', fn_record.fn_sig);
    END LOOP;
END;
$$;

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_shipment_updates ENABLE ROW LEVEL SECURITY;

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

DO $$
BEGIN
    IF to_regclass('public.inventory_deductions') IS NOT NULL THEN
        ALTER TABLE public.inventory_deductions ENABLE ROW LEVEL SECURITY;
        REVOKE ALL ON TABLE public.inventory_deductions FROM PUBLIC, anon, authenticated;
        GRANT SELECT ON TABLE public.inventory_deductions TO authenticated;
        GRANT ALL ON TABLE public.inventory_deductions TO service_role;
    END IF;
END;
$$;


-- ##############################################################################
-- PHASE 2: PRE-MIGRATION STRUCTURE, OVERLOAD, INDEX & DATA AUDITS
-- (EXECUTE & COMMIT SECOND AFTER PHASE 1 HAS COMMITTED)
-- ##############################################################################

-- 2A. Complete prerequisite validation: columns, compatible types, PK/UNIQUE/FK
--     constraints, cross-table ID type compatibility, and public.is_admin()
DO $$
DECLARE
    v_issues TEXT[] := ARRAY[]::TEXT[];
    v_req RECORD;
    v_actual_udt TEXT;
    v_id_pair RECORD;
    v_type_a OID;
    v_type_b OID;
    v_type_a_name TEXT;
    v_type_b_name TEXT;
    v_pk_req RECORD;
    v_fk_req RECORD;
    v_is_admin_rec RECORD;
BEGIN
    -- 2A-1. Required base columns and compatible PostgreSQL data types
    FOR v_req IN
        SELECT * FROM (VALUES
            ('auth', 'users', 'id', ARRAY['uuid']),
            ('public', 'categories', 'id', ARRAY['text']),
            ('public', 'profiles', 'id', ARRAY['uuid']),
            ('public', 'profiles', 'role', ARRAY['text', 'varchar']),
            ('public', 'products', 'id', ARRAY['text']),
            ('public', 'products', 'name', ARRAY['text', 'varchar']),
            ('public', 'products', 'price', ARRAY['numeric', 'float8', 'float4']),
            ('public', 'products', 'is_active', ARRAY['bool']),
            ('public', 'inventory', 'id', ARRAY['uuid']),
            ('public', 'inventory', 'product_id', ARRAY['text']),
            ('public', 'inventory', 'stock_count', ARRAY['int4', 'int8']),
            ('public', 'inventory', 'updated_at', ARRAY['timestamptz']),
            ('public', 'orders', 'id', ARRAY['uuid']),
            ('public', 'orders', 'order_number', ARRAY['text', 'varchar']),
            ('public', 'orders', 'user_id', ARRAY['uuid']),
            ('public', 'orders', 'guest_email', ARRAY['text', 'varchar']),
            ('public', 'orders', 'status', ARRAY['text', 'varchar']),
            ('public', 'orders', 'subtotal', ARRAY['numeric']),
            ('public', 'orders', 'discount_amount', ARRAY['numeric']),
            ('public', 'orders', 'shipping_fee', ARRAY['numeric']),
            ('public', 'orders', 'tax_amount', ARRAY['numeric']),
            ('public', 'orders', 'total_amount', ARRAY['numeric']),
            ('public', 'orders', 'coupon_code', ARRAY['text', 'varchar']),
            ('public', 'orders', 'shipping_address', ARRAY['jsonb']),
            ('public', 'orders', 'customer_notes', ARRAY['text', 'varchar']),
            ('public', 'orders', 'tracking_number', ARRAY['text', 'varchar']),
            ('public', 'orders', 'carrier', ARRAY['text', 'varchar']),
            ('public', 'orders', 'estimated_delivery_date', ARRAY['timestamptz']),
            ('public', 'orders', 'shipment_updates', ARRAY['jsonb']),
            ('public', 'orders', 'created_at', ARRAY['timestamptz']),
            ('public', 'orders', 'updated_at', ARRAY['timestamptz']),
            ('public', 'order_items', 'id', ARRAY['uuid']),
            ('public', 'order_items', 'order_id', ARRAY['uuid']),
            ('public', 'order_items', 'product_id', ARRAY['text']),
            ('public', 'order_items', 'product_name', ARRAY['text', 'varchar']),
            ('public', 'order_items', 'unit_price', ARRAY['numeric']),
            ('public', 'order_items', 'quantity', ARRAY['int4', 'int8']),
            ('public', 'order_items', 'total_price', ARRAY['numeric']),
            ('public', 'order_items', 'selected_color', ARRAY['text', 'varchar']),
            ('public', 'order_items', 'selected_size', ARRAY['text', 'varchar']),
            ('public', 'order_items', 'created_at', ARRAY['timestamptz']),
            ('public', 'payment_records', 'id', ARRAY['uuid']),
            ('public', 'payment_records', 'order_id', ARRAY['uuid']),
            ('public', 'payment_records', 'payment_method', ARRAY['text', 'varchar']),
            ('public', 'payment_records', 'amount', ARRAY['numeric']),
            ('public', 'payment_records', 'currency', ARRAY['text', 'varchar']),
            ('public', 'payment_records', 'payment_status', ARRAY['text', 'varchar']),
            ('public', 'payment_records', 'transaction_reference', ARRAY['text', 'varchar']),
            ('public', 'payment_records', 'raw_details', ARRAY['jsonb']),
            ('public', 'payment_records', 'created_at', ARRAY['timestamptz']),
            ('public', 'order_shipment_updates', 'id', ARRAY['uuid']),
            ('public', 'order_shipment_updates', 'order_id', ARRAY['uuid']),
            ('public', 'order_shipment_updates', 'status', ARRAY['text', 'varchar']),
            ('public', 'order_shipment_updates', 'title', ARRAY['text', 'varchar']),
            ('public', 'order_shipment_updates', 'description', ARRAY['text', 'varchar']),
            ('public', 'order_shipment_updates', 'location', ARRAY['text', 'varchar']),
            ('public', 'order_shipment_updates', 'created_at', ARRAY['timestamptz'])
        ) AS req(schema_name, table_name, col_name, allowed_udts)
    LOOP
        SELECT c.udt_name INTO v_actual_udt
        FROM information_schema.columns c
        WHERE c.table_schema = v_req.schema_name
          AND c.table_name = v_req.table_name
          AND c.column_name = v_req.col_name;

        IF NOT FOUND THEN
            v_issues := array_append(
                v_issues,
                format('missing column %s.%s.%s', v_req.schema_name, v_req.table_name, v_req.col_name)
            );
        ELSIF NOT (v_actual_udt = ANY (v_req.allowed_udts)) THEN
            v_issues := array_append(
                v_issues,
                format('incompatible type on %s.%s.%s (found=%s, expected=%s)', v_req.schema_name, v_req.table_name, v_req.col_name, v_actual_udt, array_to_string(v_req.allowed_udts, '|'))
            );
        END IF;
    END LOOP;

    -- 2A-2. Check optional/additive columns IF they already exist before Phase 2B/3C/3E
    FOR v_req IN
        SELECT * FROM (VALUES
            ('public', 'products', 'gst_rate', ARRAY['numeric']),
            ('public', 'orders', 'status_history', ARRAY['jsonb']),
            ('public', 'orders', 'is_archived_by_admin', ARRAY['bool']),
            ('public', 'orders', 'is_hidden_by_customer', ARRAY['bool']),
            ('public', 'orders', 'customer_name', ARRAY['text', 'varchar']),
            ('public', 'orders', 'customer_email', ARRAY['text', 'varchar']),
            ('public', 'orders', 'customer_phone', ARRAY['text', 'varchar']),
            ('public', 'orders', 'payment_method', ARRAY['text', 'varchar']),
            ('public', 'orders', 'payment_status', ARRAY['text', 'varchar']),
            ('public', 'payment_records', 'screenshot_url', ARRAY['text', 'varchar']),
            ('public', 'payment_records', 'ai_analysis', ARRAY['jsonb']),
            ('public', 'payment_records', 'ai_confidence_score', ARRAY['numeric', 'float8', 'float4', 'int4']),
            ('public', 'payment_records', 'ai_recommendation', ARRAY['text', 'varchar']),
            ('public', 'payment_records', 'suspicious_indicators', ARRAY['jsonb']),
            ('public', 'payment_records', 'verified_at', ARRAY['timestamptz']),
            ('public', 'payment_records', 'verified_by', ARRAY['text', 'varchar']),
            ('public', 'payment_records', 'rejection_reason', ARRAY['text', 'varchar'])
        ) AS opt(schema_name, table_name, col_name, allowed_udts)
    LOOP
        SELECT c.udt_name INTO v_actual_udt
        FROM information_schema.columns c
        WHERE c.table_schema = v_req.schema_name
          AND c.table_name = v_req.table_name
          AND c.column_name = v_req.col_name;

        IF FOUND AND NOT (v_actual_udt = ANY (v_req.allowed_udts)) THEN
            v_issues := array_append(
                v_issues,
                format('incompatible pre-existing column type on %s.%s.%s (found=%s, expected=%s)', v_req.schema_name, v_req.table_name, v_req.col_name, v_actual_udt, array_to_string(v_req.allowed_udts, '|'))
            );
        END IF;
    END LOOP;

    -- 2A-3. If public.inventory_deductions already exists, validate its required base columns & types
    IF to_regclass('public.inventory_deductions') IS NOT NULL THEN
        FOR v_req IN
            SELECT * FROM (VALUES
                ('public', 'inventory_deductions', 'id', ARRAY['uuid']),
                ('public', 'inventory_deductions', 'order_id', ARRAY['uuid']),
                ('public', 'inventory_deductions', 'order_number', ARRAY['text', 'varchar']),
                ('public', 'inventory_deductions', 'product_id', ARRAY['text']),
                ('public', 'inventory_deductions', 'quantity', ARRAY['int4', 'int8']),
                ('public', 'inventory_deductions', 'created_at', ARRAY['timestamptz'])
            ) AS invd(schema_name, table_name, col_name, allowed_udts)
        LOOP
            SELECT c.udt_name INTO v_actual_udt
            FROM information_schema.columns c
            WHERE c.table_schema = v_req.schema_name
              AND c.table_name = v_req.table_name
              AND c.column_name = v_req.col_name;

            IF NOT FOUND THEN
                v_issues := array_append(
                    v_issues,
                    format('missing column %s.%s.%s on pre-existing inventory_deductions', v_req.schema_name, v_req.table_name, v_req.col_name)
                );
            ELSIF NOT (v_actual_udt = ANY (v_req.allowed_udts)) THEN
                v_issues := array_append(
                    v_issues,
                    format('incompatible type on %s.%s.%s (found=%s, expected=%s)', v_req.schema_name, v_req.table_name, v_req.col_name, v_actual_udt, array_to_string(v_req.allowed_udts, '|'))
                );
            END IF;
        END LOOP;
    END IF;

    -- 2A-4. Cross-table ID type equality checks
    FOR v_id_pair IN
        SELECT * FROM (VALUES
            ('public', 'products', 'id', 'public', 'inventory', 'product_id'),
            ('public', 'products', 'id', 'public', 'order_items', 'product_id'),
            ('public', 'orders', 'id', 'public', 'order_items', 'order_id'),
            ('public', 'orders', 'id', 'public', 'payment_records', 'order_id'),
            ('public', 'orders', 'id', 'public', 'order_shipment_updates', 'order_id'),
            ('auth', 'users', 'id', 'public', 'orders', 'user_id'),
            ('auth', 'users', 'id', 'public', 'profiles', 'id')
        ) AS pairs(s1, t1, c1, s2, t2, c2)
    LOOP
        SELECT a.atttypid, format_type(a.atttypid, a.atttypmod)
        INTO v_type_a, v_type_a_name
        FROM pg_attribute a
        JOIN pg_class cls ON cls.oid = a.attrelid
        JOIN pg_namespace nsp ON nsp.oid = cls.relnamespace
        WHERE nsp.nspname = v_id_pair.s1 AND cls.relname = v_id_pair.t1 AND a.attname = v_id_pair.c1 AND NOT a.attisdropped;

        SELECT a.atttypid, format_type(a.atttypid, a.atttypmod)
        INTO v_type_b, v_type_b_name
        FROM pg_attribute a
        JOIN pg_class cls ON cls.oid = a.attrelid
        JOIN pg_namespace nsp ON nsp.oid = cls.relnamespace
        WHERE nsp.nspname = v_id_pair.s2 AND cls.relname = v_id_pair.t2 AND a.attname = v_id_pair.c2 AND NOT a.attisdropped;

        IF v_type_a IS NOT NULL AND v_type_b IS NOT NULL AND v_type_a IS DISTINCT FROM v_type_b THEN
            v_issues := array_append(
                v_issues,
                format('ID type mismatch: %s.%s.%s (%s) <> %s.%s.%s (%s)',
                    v_id_pair.s1, v_id_pair.t1, v_id_pair.c1, v_type_a_name,
                    v_id_pair.s2, v_id_pair.t2, v_id_pair.c2, v_type_b_name)
            );
        END IF;
    END LOOP;

    -- 2A-5. Required Primary Key & Unique constraints (referencing integrity)
    FOR v_pk_req IN
        SELECT * FROM (VALUES
            ('auth', 'users', 'id', false),
            ('public', 'profiles', 'id', false),
            ('public', 'categories', 'id', false),
            ('public', 'products', 'id', false),
            ('public', 'orders', 'id', false),
            ('public', 'order_items', 'id', false),
            ('public', 'payment_records', 'id', false),
            ('public', 'order_shipment_updates', 'id', false),
            ('public', 'inventory', 'product_id', true)
        ) AS pks(schema_name, table_name, col_name, allow_unique_index)
    LOOP
        IF NOT EXISTS (
            SELECT 1
            FROM pg_constraint con
            JOIN pg_class rel ON rel.oid = con.conrelid
            JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
            JOIN pg_attribute att ON att.attrelid = rel.oid AND att.attnum = con.conkey[1]
            WHERE nsp.nspname = v_pk_req.schema_name
              AND rel.relname = v_pk_req.table_name
              AND att.attname = v_pk_req.col_name
              AND array_length(con.conkey, 1) = 1
              AND (con.contype = 'p' OR (v_pk_req.allow_unique_index AND con.contype = 'u'))
        ) AND NOT (
            v_pk_req.allow_unique_index AND EXISTS (
                SELECT 1
                FROM pg_index ix
                JOIN pg_class rel ON rel.oid = ix.indrelid
                JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
                JOIN pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ix.indkey[0]
                WHERE nsp.nspname = v_pk_req.schema_name
                  AND rel.relname = v_pk_req.table_name
                  AND att.attname = v_pk_req.col_name
                  AND ix.indisunique = true
                  AND ix.indisvalid = true
                  AND ix.indnkeyatts = 1
                  AND ix.indpred IS NULL
            )
        ) THEN
            v_issues := array_append(
                v_issues,
                format('missing %s on %s.%s(%s)',
                    CASE WHEN v_pk_req.allow_unique_index THEN 'PRIMARY KEY or UNIQUE constraint' ELSE 'PRIMARY KEY' END,
                    v_pk_req.schema_name, v_pk_req.table_name, v_pk_req.col_name)
            );
        END IF;
    END LOOP;

    -- 2A-6. Required Foreign Key constraints across core tables
    FOR v_fk_req IN
        SELECT * FROM (VALUES
            ('public', 'inventory', 'product_id', 'public', 'products', 'id'),
            ('public', 'order_items', 'order_id', 'public', 'orders', 'id'),
            ('public', 'order_items', 'product_id', 'public', 'products', 'id'),
            ('public', 'payment_records', 'order_id', 'public', 'orders', 'id'),
            ('public', 'order_shipment_updates', 'order_id', 'public', 'orders', 'id'),
            ('public', 'orders', 'user_id', 'auth', 'users', 'id'),
            ('public', 'profiles', 'id', 'auth', 'users', 'id')
        ) AS fks(child_schema, child_table, child_col, parent_schema, parent_table, parent_col)
    LOOP
        IF NOT EXISTS (
            SELECT 1
            FROM pg_constraint con
            JOIN pg_class c_rel ON c_rel.oid = con.conrelid
            JOIN pg_namespace c_nsp ON c_nsp.oid = c_rel.relnamespace
            JOIN pg_attribute c_att ON c_att.attrelid = c_rel.oid AND c_att.attnum = con.conkey[1]
            JOIN pg_class p_rel ON p_rel.oid = con.confrelid
            JOIN pg_namespace p_nsp ON p_nsp.oid = p_rel.relnamespace
            JOIN pg_attribute p_att ON p_att.attrelid = p_rel.oid AND p_att.attnum = con.confkey[1]
            WHERE con.contype = 'f'
              AND array_length(con.conkey, 1) = 1
              AND c_nsp.nspname = v_fk_req.child_schema
              AND c_rel.relname = v_fk_req.child_table
              AND c_att.attname = v_fk_req.child_col
              AND p_nsp.nspname = v_fk_req.parent_schema
              AND p_rel.relname = v_fk_req.parent_table
              AND p_att.attname = v_fk_req.parent_col
        ) THEN
            v_issues := array_append(
                v_issues,
                format('missing FOREIGN KEY %s.%s(%s) -> %s.%s(%s)',
                    v_fk_req.child_schema, v_fk_req.child_table, v_fk_req.child_col,
                    v_fk_req.parent_schema, v_fk_req.parent_table, v_fk_req.parent_col)
            );
        END IF;
    END LOOP;

    -- 2A-7. Required helper function public.is_admin() returning boolean with SECURITY DEFINER
    SELECT p.prorettype, p.prosecdef, p.pronargs
    INTO v_is_admin_rec
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'is_admin'
      AND p.prokind = 'f'
      AND p.pronargs = 0;

    IF NOT FOUND THEN
        v_issues := array_append(v_issues, 'missing function public.is_admin()');
    ELSE
        IF v_is_admin_rec.prorettype IS DISTINCT FROM 'boolean'::regtype THEN
            v_issues := array_append(v_issues, 'public.is_admin() must return boolean');
        END IF;
        IF v_is_admin_rec.prosecdef IS DISTINCT FROM TRUE THEN
            v_issues := array_append(v_issues, 'public.is_admin() must be SECURITY DEFINER');
        END IF;
    END IF;

    IF array_length(v_issues, 1) IS NOT NULL THEN
        RAISE EXCEPTION
            'Pre-migration check failed (% issue(s)): [%]. Ensure base supabase/schema.sql has been applied cleanly before running Phase 3.',
            array_length(v_issues, 1),
            array_to_string(v_issues, '; ');
    END IF;
END;
$$;

-- 2B. Verify/install public.products.gst_rate AND enforce its CHECK constraint
--     even when the gst_rate column already existed prior to this migration.
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS gst_rate NUMERIC(5, 2);

DO $$
DECLARE
    v_bad_gst_count INTEGER;
    v_has_gst_check BOOLEAN;
    v_unconfigured_tax_count INTEGER;
BEGIN
    SELECT count(*) INTO v_bad_gst_count
    FROM public.products
    WHERE gst_rate IS NOT NULL AND (gst_rate < 0 OR gst_rate > 100);

    IF v_bad_gst_count > 0 THEN
        RAISE EXCEPTION
            'Manual reconciliation required: % product(s) in public.products have invalid gst_rate values outside 0..100. Inspect via: SELECT id, name, gst_rate FROM public.products WHERE gst_rate IS NOT NULL AND (gst_rate < 0 OR gst_rate > 100);',
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

    SELECT count(*) INTO v_unconfigured_tax_count
    FROM public.products
    WHERE is_active = true AND gst_rate IS NULL;

    IF v_unconfigured_tax_count > 0 THEN
        RAISE NOTICE
            'GST PREREQUISITE: % active product(s) have gst_rate IS NULL. Commercial checkout will reject orders containing any active product without an explicit gst_rate. Historical order totals are preserved.',
            v_unconfigured_tax_count;
    END IF;
END;
$$;

-- 2C. Function overload dependency inspection & safe cleanup (NO DROP ... CASCADE)
--     Note: Phase 1 already committed permission revocations on ALL overloads.
DO $$
DECLARE
    fn_record RECORD;
    v_dependents TEXT;
    v_triggers TEXT;
    v_views TEXT;
    v_policies TEXT;
    v_source_callers TEXT;
    v_is_canonical BOOLEAN;
BEGIN
    SELECT string_agg(n.nspname || '.' || p.oid::regprocedure::text, ', ')
    INTO v_source_callers
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
      AND p.prokind IN ('f', 'p')
      AND NOT (n.nspname = 'public' AND p.proname IN ('deduct_product_inventory', 'create_complete_order'))
      AND p.prosrc ILIKE '%deduct_product_inventory%';

    SELECT string_agg(schemaname || '.' || viewname, ', ')
    INTO v_views
    FROM pg_views
    WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
      AND definition ILIKE '%deduct_product_inventory%';

    SELECT string_agg(schemaname || '.' || tablename || ':' || policyname, ', ')
    INTO v_policies
    FROM pg_policies
    WHERE COALESCE(qual, '') ILIKE '%deduct_product_inventory%'
       OR COALESCE(with_check, '') ILIKE '%deduct_product_inventory%';

    FOR fn_record IN
        SELECT
            p.oid AS fn_oid,
            p.oid::regprocedure AS fn_sig,
            oidvectortypes(p.proargtypes) AS arg_types,
            p.proargnames AS arg_names
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname = 'deduct_product_inventory'
          AND p.prokind = 'f'
    LOOP
        v_is_canonical := (
            fn_record.arg_types = 'text, integer, text, uuid'
            AND fn_record.arg_names = ARRAY['p_product_id', 'p_quantity', 'p_order_number', 'p_order_id']::text[]
        );

        IF NOT v_is_canonical THEN
            SELECT string_agg(pg_describe_object(d.classid, d.objid, d.objsubid) || ' (deptype=' || d.deptype || ')', '; ')
            INTO v_dependents
            FROM pg_depend d
            WHERE d.refclassid = 'pg_proc'::regclass
              AND d.refobjid = fn_record.fn_oid
              AND d.objid <> fn_record.fn_oid;

            SELECT string_agg(t.tgname || ' on ' || c.oid::regclass::text, ', ')
            INTO v_triggers
            FROM pg_trigger t
            JOIN pg_class c ON c.oid = t.tgrelid
            WHERE t.tgfoid = fn_record.fn_oid
              AND NOT t.tgisinternal;

            IF v_source_callers IS NOT NULL OR v_views IS NOT NULL OR v_policies IS NOT NULL OR v_dependents IS NOT NULL OR v_triggers IS NOT NULL THEN
                RAISE EXCEPTION
                    'Unsafe to drop deduct_product_inventory overload % (oid=%): source_callers=[%], views=[%], policies=[%], triggers=[%], pg_depend=[%]. Permissions remain locked down from Phase 1; inspect callers manually before dropping (never use CASCADE).',
                    fn_record.fn_sig,
                    fn_record.fn_oid,
                    COALESCE(v_source_callers, 'none'),
                    COALESCE(v_views, 'none'),
                    COALESCE(v_policies, 'none'),
                    COALESCE(v_triggers, 'none'),
                    COALESCE(v_dependents, 'none');
            END IF;

            EXECUTE format('DROP FUNCTION %s;', fn_record.fn_sig);
        END IF;
    END LOOP;
END;
$$;

DO $$
DECLARE
    fn_record RECORD;
    v_dependents TEXT;
    v_triggers TEXT;
    v_views TEXT;
    v_policies TEXT;
    v_source_callers TEXT;
    v_is_canonical BOOLEAN;
BEGIN
    SELECT string_agg(n.nspname || '.' || p.oid::regprocedure::text, ', ')
    INTO v_source_callers
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
      AND p.prokind IN ('f', 'p')
      AND NOT (n.nspname = 'public' AND p.proname = 'create_complete_order')
      AND p.prosrc ILIKE '%create_complete_order%';

    SELECT string_agg(schemaname || '.' || viewname, ', ')
    INTO v_views
    FROM pg_views
    WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
      AND definition ILIKE '%create_complete_order%';

    SELECT string_agg(schemaname || '.' || tablename || ':' || policyname, ', ')
    INTO v_policies
    FROM pg_policies
    WHERE COALESCE(qual, '') ILIKE '%create_complete_order%'
       OR COALESCE(with_check, '') ILIKE '%create_complete_order%';

    FOR fn_record IN
        SELECT
            p.oid AS fn_oid,
            p.oid::regprocedure AS fn_sig,
            oidvectortypes(p.proargtypes) AS arg_types,
            p.proargnames AS arg_names
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname = 'create_complete_order'
          AND p.prokind = 'f'
    LOOP
        v_is_canonical := (
            fn_record.arg_types = 'jsonb, jsonb, jsonb'
            AND fn_record.arg_names = ARRAY['p_order', 'p_items', 'p_payment']::text[]
        );

        IF NOT v_is_canonical THEN
            SELECT string_agg(pg_describe_object(d.classid, d.objid, d.objsubid) || ' (deptype=' || d.deptype || ')', '; ')
            INTO v_dependents
            FROM pg_depend d
            WHERE d.refclassid = 'pg_proc'::regclass
              AND d.refobjid = fn_record.fn_oid
              AND d.objid <> fn_record.fn_oid;

            SELECT string_agg(t.tgname || ' on ' || c.oid::regclass::text, ', ')
            INTO v_triggers
            FROM pg_trigger t
            JOIN pg_class c ON c.oid = t.tgrelid
            WHERE t.tgfoid = fn_record.fn_oid
              AND NOT t.tgisinternal;

            IF v_source_callers IS NOT NULL OR v_views IS NOT NULL OR v_policies IS NOT NULL OR v_dependents IS NOT NULL OR v_triggers IS NOT NULL THEN
                RAISE EXCEPTION
                    'Unsafe to drop create_complete_order overload % (oid=%): source_callers=[%], views=[%], policies=[%], triggers=[%], pg_depend=[%]. Permissions remain locked down from Phase 1; inspect callers manually before dropping (never use CASCADE).',
                    fn_record.fn_sig,
                    fn_record.fn_oid,
                    COALESCE(v_source_callers, 'none'),
                    COALESCE(v_views, 'none'),
                    COALESCE(v_policies, 'none'),
                    COALESCE(v_triggers, 'none'),
                    COALESCE(v_dependents, 'none');
            END IF;

            EXECUTE format('DROP FUNCTION %s;', fn_record.fn_sig);
        END IF;
    END LOOP;
END;
$$;

-- 2D. Verify existing index definitions via pg_index/pg_class/pg_attribute/pg_get_indexdef
--     Never trust index names alone; halt safely if an existing index has a conflicting definition.
DO $$
DECLARE
    idx_rec RECORD;
BEGIN
    -- 1) idx_orders_unique_order_number on public.orders(order_number)
    SELECT
        c.relname AS index_name,
        tbl.relname AS table_name,
        ix.indisunique,
        ix.indisvalid,
        ix.indisready,
        ix.indpred IS NOT NULL AS is_partial,
        att.attname AS col_name,
        pg_get_indexdef(ix.indexrelid) AS index_def
    INTO idx_rec
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_index ix ON ix.indexrelid = c.oid
    JOIN pg_class tbl ON tbl.oid = ix.indrelid
    LEFT JOIN pg_attribute att ON att.attrelid = tbl.oid AND att.attnum = ix.indkey[0] AND ix.indnkeyatts = 1
    WHERE n.nspname = 'public'
      AND c.relname = 'idx_orders_unique_order_number'
      AND c.relkind = 'i';

    IF FOUND THEN
        IF idx_rec.table_name <> 'orders'
           OR NOT idx_rec.indisunique
           OR NOT idx_rec.indisvalid
           OR NOT idx_rec.indisready
           OR idx_rec.is_partial
           OR idx_rec.col_name IS DISTINCT FROM 'order_number' THEN
            RAISE EXCEPTION
                'Conflicting index definition for public.idx_orders_unique_order_number: expected UNIQUE valid non-partial index on public.orders(order_number), found [table=%, unique=%, valid=%, ready=%, partial=%, def=%].',
                idx_rec.table_name, idx_rec.indisunique, idx_rec.indisvalid, idx_rec.indisready, idx_rec.is_partial, idx_rec.index_def;
        END IF;
    END IF;

    -- 2) idx_orders_unique_trimmed_order_number on public.orders((trim(order_number)))
    SELECT
        c.relname AS index_name,
        tbl.relname AS table_name,
        ix.indisunique,
        ix.indisvalid,
        ix.indisready,
        ix.indpred IS NOT NULL AS is_partial,
        ix.indnkeyatts,
        pg_get_indexdef(ix.indexrelid) AS index_def
    INTO idx_rec
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_index ix ON ix.indexrelid = c.oid
    JOIN pg_class tbl ON tbl.oid = ix.indrelid
    WHERE n.nspname = 'public'
      AND c.relname = 'idx_orders_unique_trimmed_order_number'
      AND c.relkind = 'i';

    IF FOUND THEN
        IF idx_rec.table_name <> 'orders'
           OR NOT idx_rec.indisunique
           OR NOT idx_rec.indisvalid
           OR NOT idx_rec.indisready
           OR idx_rec.is_partial
           OR idx_rec.indnkeyatts <> 1
           OR idx_rec.index_def !~* '(btrim|trim)\s*\(\s*order_number\s*\)' THEN
            RAISE EXCEPTION
                'Conflicting index definition for public.idx_orders_unique_trimmed_order_number: expected UNIQUE valid non-partial expression index on public.orders((trim(order_number))), found [table=%, unique=%, valid=%, ready=%, partial=%, def=%].',
                idx_rec.table_name, idx_rec.indisunique, idx_rec.indisvalid, idx_rec.indisready, idx_rec.is_partial, idx_rec.index_def;
        END IF;
    END IF;

    -- 3) idx_payment_records_unique_order_id on public.payment_records(order_id)
    SELECT
        c.relname AS index_name,
        tbl.relname AS table_name,
        ix.indisunique,
        ix.indisvalid,
        ix.indisready,
        ix.indpred IS NOT NULL AS is_partial,
        att.attname AS col_name,
        pg_get_indexdef(ix.indexrelid) AS index_def
    INTO idx_rec
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_index ix ON ix.indexrelid = c.oid
    JOIN pg_class tbl ON tbl.oid = ix.indrelid
    LEFT JOIN pg_attribute att ON att.attrelid = tbl.oid AND att.attnum = ix.indkey[0] AND ix.indnkeyatts = 1
    WHERE n.nspname = 'public'
      AND c.relname = 'idx_payment_records_unique_order_id'
      AND c.relkind = 'i';

    IF FOUND THEN
        IF idx_rec.table_name <> 'payment_records'
           OR NOT idx_rec.indisunique
           OR NOT idx_rec.indisvalid
           OR NOT idx_rec.indisready
           OR idx_rec.is_partial
           OR idx_rec.col_name IS DISTINCT FROM 'order_id' THEN
            RAISE EXCEPTION
                'Conflicting index definition for public.idx_payment_records_unique_order_id: expected UNIQUE valid non-partial index on public.payment_records(order_id), found [table=%, unique=%, valid=%, ready=%, partial=%, def=%].',
                idx_rec.table_name, idx_rec.indisunique, idx_rec.indisvalid, idx_rec.indisready, idx_rec.is_partial, idx_rec.index_def;
        END IF;
    END IF;

    -- 4) idx_payment_records_unique_utr on normalized non-empty transaction_reference
    SELECT
        c.relname AS index_name,
        tbl.relname AS table_name,
        ix.indisunique,
        ix.indisvalid,
        ix.indisready,
        ix.indpred IS NOT NULL AS is_partial,
        ix.indnkeyatts,
        pg_get_indexdef(ix.indexrelid) AS index_def
    INTO idx_rec
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_index ix ON ix.indexrelid = c.oid
    JOIN pg_class tbl ON tbl.oid = ix.indrelid
    WHERE n.nspname = 'public'
      AND c.relname = 'idx_payment_records_unique_utr'
      AND c.relkind = 'i';

    IF FOUND THEN
        IF idx_rec.table_name <> 'payment_records'
           OR NOT idx_rec.indisunique
           OR NOT idx_rec.indisvalid
           OR NOT idx_rec.indisready
           OR NOT idx_rec.is_partial
           OR idx_rec.indnkeyatts <> 1
           OR idx_rec.index_def !~* 'upper\s*\(\s*regexp_replace\s*\(\s*(btrim|trim)\s*\(\s*transaction_reference'
           OR idx_rec.index_def !~* 'WHERE.*transaction_reference IS NOT NULL' THEN
            RAISE EXCEPTION
                'Conflicting index definition for public.idx_payment_records_unique_utr: expected UNIQUE valid partial index on normalized transaction_reference, found [table=%, unique=%, valid=%, ready=%, partial=%, def=%].',
                idx_rec.table_name, idx_rec.indisunique, idx_rec.indisvalid, idx_rec.indisready, idx_rec.is_partial, idx_rec.index_def;
        END IF;
    END IF;
END;
$$;

-- 2E. Non-destructive existing data integrity audits on public.orders & public.payment_records
--     Computes exact full-table COUNT(*) separately from bounded LIMIT 10 diagnostic samples.
DO $$
DECLARE
    v_empty_order_num_count INTEGER;
    v_dup_order_num_count INTEGER;
    v_dup_order_samples TEXT;
    v_empty_utr_count INTEGER;
    v_empty_utr_samples TEXT;
    v_invalid_utr_count INTEGER;
    v_invalid_utr_samples TEXT;
    v_dup_utr_count INTEGER;
    v_dup_utr_samples TEXT;
    v_dup_order_payment_count INTEGER;
    v_dup_order_payment_samples TEXT;
BEGIN
    -- Audit public.orders order_number (empty/NULL)
    SELECT count(*) INTO v_empty_order_num_count
    FROM public.orders
    WHERE order_number IS NULL OR trim(order_number) = '';

    IF v_empty_order_num_count > 0 THEN
        RAISE EXCEPTION
            'Manual reconciliation required: % row(s) in public.orders have NULL or empty order_number. Zero rows modified. Inspect via: SELECT id, order_number, user_id, total_amount, status, created_at FROM public.orders WHERE order_number IS NULL OR trim(order_number) = '''' ORDER BY created_at ASC;',
            v_empty_order_num_count;
    END IF;

    -- Audit duplicate trimmed order_number values (exact total count + bounded 10 samples)
    WITH dup_orders AS (
        SELECT trim(order_number) AS clean_ord_num, count(*) AS cnt
        FROM public.orders
        GROUP BY trim(order_number)
        HAVING count(*) > 1
    )
    SELECT
        (SELECT count(*) FROM dup_orders),
        (
            SELECT string_agg(format('"%s" (%s rows)', clean_ord_num, cnt), ', ')
            FROM (
                SELECT clean_ord_num, cnt
                FROM dup_orders
                ORDER BY cnt DESC, clean_ord_num ASC
                LIMIT 10
            ) s
        )
    INTO v_dup_order_num_count, v_dup_order_samples;

    IF COALESCE(v_dup_order_num_count, 0) > 0 THEN
        RAISE EXCEPTION
            'Manual reconciliation required: % duplicate order_number value(s) exist in public.orders [samples: %]. Zero rows modified. Inspect via: SELECT id, order_number, user_id, customer_email, total_amount, status, created_at FROM public.orders WHERE trim(order_number) IN (SELECT trim(order_number) FROM public.orders GROUP BY 1 HAVING count(*) > 1) ORDER BY created_at ASC;',
            v_dup_order_num_count, v_dup_order_samples;
    END IF;

    -- Audit public.payment_records rows lacking UTRs (exact total count + bounded 10 samples)
    WITH empty_utrs AS (
        SELECT pr.id, pr.order_id, o.order_number, pr.payment_method, pr.payment_status, pr.created_at
        FROM public.payment_records pr
        LEFT JOIN public.orders o ON o.id = pr.order_id
        WHERE pr.transaction_reference IS NULL
           OR length(regexp_replace(trim(pr.transaction_reference), '[\s-]+', '', 'g')) = 0
    )
    SELECT
        (SELECT count(*) FROM empty_utrs),
        (
            SELECT string_agg(format('payment_id=%s/order=%s (%s, status=%s)', id, COALESCE(order_number, order_id::text), payment_method, payment_status), '; ')
            FROM (
                SELECT id, order_id, order_number, payment_method, payment_status
                FROM empty_utrs
                ORDER BY created_at ASC
                LIMIT 10
            ) s
        )
    INTO v_empty_utr_count, v_empty_utr_samples;

    IF COALESCE(v_empty_utr_count, 0) > 0 THEN
        RAISE EXCEPTION
            'Manual review required: % row(s) in public.payment_records have NULL or empty transaction_reference [samples: %]. Verify whether these are legitimate historical records needing backfilled references; migration halted safely without deleting or altering any payment rows. Inspect via: SELECT pr.id, pr.order_id, o.order_number, o.status AS order_status, pr.payment_method, pr.amount, pr.payment_status, pr.transaction_reference, pr.created_at FROM public.payment_records pr LEFT JOIN public.orders o ON o.id = pr.order_id WHERE pr.transaction_reference IS NULL OR length(regexp_replace(trim(pr.transaction_reference), ''[\s-]+'', '''', ''g'')) = 0 ORDER BY pr.created_at ASC;',
            v_empty_utr_count, v_empty_utr_samples;
    END IF;

    -- Audit existing UTRs failing 12-character alphanumeric format (exact total count + bounded 10 samples)
    WITH invalid_utrs AS (
        SELECT
            id,
            created_at,
            upper(regexp_replace(trim(transaction_reference), '[\s-]+', '', 'g')) AS norm_utr
        FROM public.payment_records
        WHERE transaction_reference IS NOT NULL
          AND length(regexp_replace(trim(transaction_reference), '[\s-]+', '', 'g')) > 0
          AND upper(regexp_replace(trim(transaction_reference), '[\s-]+', '', 'g')) !~ '^[0-9A-Z]{12}$'
    )
    SELECT
        (SELECT count(*) FROM invalid_utrs),
        (
            SELECT string_agg(format('id=%s (%s)', id, norm_utr), ', ')
            FROM (
                SELECT id, norm_utr
                FROM invalid_utrs
                ORDER BY created_at ASC
                LIMIT 10
            ) s
        )
    INTO v_invalid_utr_count, v_invalid_utr_samples;

    IF COALESCE(v_invalid_utr_count, 0) > 0 THEN
        RAISE EXCEPTION
            'Manual reconciliation required: % row(s) in public.payment_records have transaction_reference values not matching the 12-character alphanumeric UTR format [samples: %]. Zero rows modified. Inspect via: SELECT id, order_id, payment_method, amount, payment_status, transaction_reference, upper(regexp_replace(trim(transaction_reference), ''[\s-]+'', '''', ''g'')) AS normalized_utr, created_at FROM public.payment_records WHERE upper(regexp_replace(trim(COALESCE(transaction_reference, '''')), ''[\s-]+'', '''', ''g'')) !~ ''^[0-9A-Z]{12}$'' ORDER BY created_at ASC;',
            v_invalid_utr_count, v_invalid_utr_samples;
    END IF;

    -- Audit normalized duplicate UTR references (exact total count + bounded 10 samples)
    WITH dup_utrs AS (
        SELECT
            upper(regexp_replace(trim(transaction_reference), '[\s-]+', '', 'g')) AS norm_utr,
            count(*) AS cnt
        FROM public.payment_records
        WHERE transaction_reference IS NOT NULL
          AND length(regexp_replace(trim(transaction_reference), '[\s-]+', '', 'g')) > 0
        GROUP BY upper(regexp_replace(trim(transaction_reference), '[\s-]+', '', 'g'))
        HAVING count(*) > 1
    )
    SELECT
        (SELECT count(*) FROM dup_utrs),
        (
            SELECT string_agg(format('%s (%s rows)', norm_utr, cnt), ', ')
            FROM (
                SELECT norm_utr, cnt
                FROM dup_utrs
                ORDER BY cnt DESC, norm_utr ASC
                LIMIT 10
            ) s
        )
    INTO v_dup_utr_count, v_dup_utr_samples;

    IF COALESCE(v_dup_utr_count, 0) > 0 THEN
        RAISE EXCEPTION
            'Manual reconciliation required: % duplicate normalized UPI UTR reference(s) exist in public.payment_records [samples: %]. Zero rows modified. Inspect via: SELECT id, order_id, transaction_reference, upper(regexp_replace(trim(transaction_reference), ''[\s-]+'', '''', ''g'')) AS normalized_utr, payment_status, created_at FROM public.payment_records WHERE upper(regexp_replace(trim(transaction_reference), ''[\s-]+'', '''', ''g'')) IN (SELECT upper(regexp_replace(trim(transaction_reference), ''[\s-]+'', '''', ''g'')) FROM public.payment_records GROUP BY 1 HAVING count(*) > 1) ORDER BY created_at ASC;',
            v_dup_utr_count, v_dup_utr_samples;
    END IF;

    -- Audit duplicate payment_records per order_id (exact total count + bounded 10 samples)
    WITH dup_order_pays AS (
        SELECT order_id, count(*) AS cnt
        FROM public.payment_records
        GROUP BY order_id
        HAVING count(*) > 1
    )
    SELECT
        (SELECT count(*) FROM dup_order_pays),
        (
            SELECT string_agg(format('order_id=%s (%s rows)', order_id, cnt), ', ')
            FROM (
                SELECT order_id, cnt
                FROM dup_order_pays
                ORDER BY cnt DESC, order_id ASC
                LIMIT 10
            ) s
        )
    INTO v_dup_order_payment_count, v_dup_order_payment_samples;

    IF COALESCE(v_dup_order_payment_count, 0) > 0 THEN
        RAISE EXCEPTION
            'Manual reconciliation required: % order(s) have multiple rows in public.payment_records [samples: %]. Zero rows modified. Inspect via: SELECT id, order_id, payment_method, amount, payment_status, transaction_reference, created_at FROM public.payment_records WHERE order_id IN (SELECT order_id FROM public.payment_records GROUP BY order_id HAVING count(*) > 1) ORDER BY order_id, created_at ASC;',
            v_dup_order_payment_count, v_dup_order_payment_samples;
    END IF;
END;
$$;


-- ##############################################################################
-- PHASE 3: HARDENED SCHEMA, INDEXES, ATOMIC FUNCTIONS & COMPLETE RLS AUDIT
-- (EXECUTE & COMMIT THIRD AFTER PHASE 2 PASSES CLEANLY)
-- ##############################################################################

-- 3A. Upgrade public.inventory_deductions with ON DELETE SET NULL preservation
CREATE TABLE IF NOT EXISTS public.inventory_deductions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
    order_number TEXT NOT NULL,
    product_id TEXT REFERENCES public.products(id) ON DELETE SET NULL,
    audited_product_id TEXT NOT NULL,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE (order_number, audited_product_id)
);

DO $$
DECLARE
    fk_rec RECORD;
    uq_rec RECORD;
    v_null_audit_count INTEGER;
    v_dup_audit_count INTEGER;
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'inventory_deductions'
          AND column_name = 'audited_product_id'
    ) THEN
        ALTER TABLE public.inventory_deductions ADD COLUMN audited_product_id TEXT;
    END IF;

    UPDATE public.inventory_deductions
    SET audited_product_id = NULLIF(trim(product_id), '')
    WHERE audited_product_id IS NULL
      AND NULLIF(trim(product_id), '') IS NOT NULL;

    SELECT count(*) INTO v_null_audit_count
    FROM public.inventory_deductions
    WHERE audited_product_id IS NULL OR trim(audited_product_id) = '';

    IF v_null_audit_count > 0 THEN
        RAISE EXCEPTION
            'Manual reconciliation required: % row(s) in public.inventory_deductions have NULL or empty product_id/audited_product_id. Migration halted safely without deleting or fabricating audit rows. Inspect via: SELECT id, order_id, order_number, product_id, audited_product_id, quantity, created_at FROM public.inventory_deductions WHERE audited_product_id IS NULL OR trim(audited_product_id) = '''';',
            v_null_audit_count;
    END IF;

    ALTER TABLE public.inventory_deductions ALTER COLUMN audited_product_id SET NOT NULL;
    ALTER TABLE public.inventory_deductions ALTER COLUMN product_id DROP NOT NULL;
    ALTER TABLE public.inventory_deductions ALTER COLUMN order_id DROP NOT NULL;

    FOR fk_rec IN
        SELECT con.conname, con.confdeltype
        FROM pg_constraint con
        JOIN pg_class rel ON rel.oid = con.conrelid
        JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
        JOIN pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY (con.conkey)
        WHERE nsp.nspname = 'public'
          AND rel.relname = 'inventory_deductions'
          AND con.contype = 'f'
          AND att.attname = 'product_id'
    LOOP
        IF fk_rec.confdeltype <> 'n' THEN
            EXECUTE format('ALTER TABLE public.inventory_deductions DROP CONSTRAINT IF EXISTS %I;', fk_rec.conname);
        END IF;
    END LOOP;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint con
        JOIN pg_class rel ON rel.oid = con.conrelid
        JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
        JOIN pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY (con.conkey)
        WHERE nsp.nspname = 'public'
          AND rel.relname = 'inventory_deductions'
          AND con.contype = 'f'
          AND att.attname = 'product_id'
          AND con.confdeltype = 'n'
    ) THEN
        ALTER TABLE public.inventory_deductions
            ADD CONSTRAINT inventory_deductions_product_id_fkey
            FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE SET NULL;
    END IF;

    FOR fk_rec IN
        SELECT con.conname, con.confdeltype
        FROM pg_constraint con
        JOIN pg_class rel ON rel.oid = con.conrelid
        JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
        JOIN pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY (con.conkey)
        WHERE nsp.nspname = 'public'
          AND rel.relname = 'inventory_deductions'
          AND con.contype = 'f'
          AND att.attname = 'order_id'
    LOOP
        IF fk_rec.confdeltype <> 'n' THEN
            EXECUTE format('ALTER TABLE public.inventory_deductions DROP CONSTRAINT IF EXISTS %I;', fk_rec.conname);
        END IF;
    END LOOP;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint con
        JOIN pg_class rel ON rel.oid = con.conrelid
        JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
        JOIN pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY (con.conkey)
        WHERE nsp.nspname = 'public'
          AND rel.relname = 'inventory_deductions'
          AND con.contype = 'f'
          AND att.attname = 'order_id'
          AND con.confdeltype = 'n'
    ) THEN
        ALTER TABLE public.inventory_deductions
            ADD CONSTRAINT inventory_deductions_order_id_fkey
            FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE SET NULL;
    END IF;

    FOR uq_rec IN
        SELECT con.conname
        FROM pg_constraint con
        JOIN pg_class rel ON rel.oid = con.conrelid
        JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
        WHERE nsp.nspname = 'public'
          AND rel.relname = 'inventory_deductions'
          AND con.contype = 'u'
          AND (
              SELECT array_agg(att.attname::text ORDER BY att.attname::text)
              FROM pg_attribute att
              WHERE att.attrelid = rel.oid AND att.attnum = ANY (con.conkey)
          ) = ARRAY['order_number', 'product_id']::text[]
    LOOP
        EXECUTE format('ALTER TABLE public.inventory_deductions DROP CONSTRAINT IF EXISTS %I;', uq_rec.conname);
    END LOOP;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint con
        JOIN pg_class rel ON rel.oid = con.conrelid
        JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
        WHERE nsp.nspname = 'public'
          AND rel.relname = 'inventory_deductions'
          AND con.contype = 'u'
          AND (
              SELECT array_agg(att.attname::text ORDER BY att.attname::text)
              FROM pg_attribute att
              WHERE att.attrelid = rel.oid AND att.attnum = ANY (con.conkey)
          ) = ARRAY['audited_product_id', 'order_number']::text[]
    ) THEN
        SELECT count(*) INTO v_dup_audit_count
        FROM (
            SELECT order_number, audited_product_id
            FROM public.inventory_deductions
            GROUP BY order_number, audited_product_id
            HAVING count(*) > 1
        ) dups;

        IF v_dup_audit_count > 0 THEN
            RAISE EXCEPTION
                'Manual reconciliation required: % duplicate (order_number, audited_product_id) pair(s) exist in public.inventory_deductions. Migration halted safely without deleting audit rows.',
                v_dup_audit_count;
        END IF;

        ALTER TABLE public.inventory_deductions
            ADD CONSTRAINT inventory_deductions_order_number_audited_product_id_key
            UNIQUE (order_number, audited_product_id);
    END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_inventory_deductions_order_id ON public.inventory_deductions(order_id);
CREATE INDEX IF NOT EXISTS idx_inventory_deductions_order_number ON public.inventory_deductions(order_number);
CREATE INDEX IF NOT EXISTS idx_inventory_deductions_product_id ON public.inventory_deductions(product_id);
CREATE INDEX IF NOT EXISTS idx_inventory_deductions_audited_product_id ON public.inventory_deductions(audited_product_id);

ALTER TABLE public.inventory_deductions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view inventory deductions" ON public.inventory_deductions;
CREATE POLICY "Admins can view inventory deductions" ON public.inventory_deductions
    FOR SELECT TO authenticated
    USING (public.is_admin());

REVOKE ALL ON TABLE public.inventory_deductions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.inventory_deductions TO authenticated;
GRANT ALL ON TABLE public.inventory_deductions TO service_role;

-- 3B. Install hardened, atomic, idempotent public.deduct_product_inventory
CREATE OR REPLACE FUNCTION public.deduct_product_inventory(
    p_product_id TEXT,
    p_quantity INTEGER,
    p_order_number TEXT DEFAULT NULL,
    p_order_id UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_product_id TEXT;
    v_order_number TEXT;
    v_order_id UUID;
    v_existing_order_number TEXT;
    current_stock INTEGER;
    v_deduction_id UUID;
BEGIN
    IF current_user NOT IN ('postgres', 'supabase_admin', 'service_role')
       AND COALESCE(auth.role(), '') <> 'service_role' THEN
        RAISE EXCEPTION 'Unauthorized: deduct_product_inventory can only be executed by authorized server-side workflows.';
    END IF;

    v_product_id := NULLIF(trim(COALESCE(p_product_id, '')), '');
    IF v_product_id IS NULL THEN
        RAISE EXCEPTION 'Invalid product_id: product_id is required.';
    END IF;

    IF p_quantity IS NULL OR p_quantity <= 0 THEN
        RAISE EXCEPTION 'Invalid quantity (%): deduction quantity must be greater than zero.', p_quantity;
    END IF;

    v_order_number := NULLIF(trim(COALESCE(p_order_number, '')), '');
    IF v_order_number IS NULL OR length(v_order_number) < 3 THEN
        RAISE EXCEPTION 'Invalid order_number: a valid order_number (min 3 characters) is required for idempotent inventory deduction.';
    END IF;

    IF p_order_id IS NOT NULL THEN
        SELECT trim(o.order_number) INTO v_existing_order_number
        FROM public.orders o
        WHERE o.id = p_order_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Invalid p_order_id (%): referenced order does not exist in public.orders.', p_order_id;
        END IF;

        IF v_existing_order_number IS DISTINCT FROM v_order_number THEN
            RAISE EXCEPTION 'Order mismatch: p_order_id (%) belongs to order_number "%", not "%".', p_order_id, v_existing_order_number, v_order_number;
        END IF;

        v_order_id := p_order_id;
    ELSE
        SELECT o.id INTO v_order_id
        FROM public.orders o
        WHERE trim(o.order_number) = v_order_number
        LIMIT 1;
    END IF;

    SELECT stock_count INTO current_stock
    FROM public.inventory
    WHERE product_id = v_product_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Product with ID % not found in inventory', v_product_id;
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.inventory_deductions
        WHERE order_number = v_order_number
          AND audited_product_id = v_product_id
    ) THEN
        RETURN FALSE;
    END IF;

    IF current_stock < p_quantity OR (current_stock - p_quantity) < 0 THEN
        RETURN FALSE;
    END IF;

    UPDATE public.inventory
    SET stock_count = stock_count - p_quantity,
        updated_at = timezone('utc'::text, now())
    WHERE product_id = v_product_id
      AND stock_count >= p_quantity;

    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;

    INSERT INTO public.inventory_deductions (
        order_id,
        order_number,
        product_id,
        audited_product_id,
        quantity
    )
    VALUES (
        v_order_id,
        v_order_number,
        v_product_id,
        v_product_id,
        p_quantity
    )
    ON CONFLICT (order_number, audited_product_id) DO NOTHING
    RETURNING id INTO v_deduction_id;

    IF v_deduction_id IS NULL THEN
        RAISE EXCEPTION 'Concurrent duplicate inventory deduction detected for order % and product %; rolling back.', v_order_number, v_product_id;
    END IF;

    RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.deduct_product_inventory(TEXT, INTEGER, TEXT, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.deduct_product_inventory(TEXT, INTEGER, TEXT, UUID) TO service_role;

-- 3C. Create unique indexes, normalization triggers, and verify index catalog definitions
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_unique_order_number
    ON public.orders (order_number);
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_unique_trimmed_order_number
    ON public.orders ((trim(order_number)));

CREATE OR REPLACE FUNCTION public.normalize_and_validate_order_number()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
    v_clean TEXT;
BEGIN
    v_clean := NULLIF(trim(COALESCE(NEW.order_number, '')), '');
    IF v_clean IS NULL OR length(v_clean) < 3 THEN
        RAISE EXCEPTION 'Invalid order_number: order_number must be at least 3 non-whitespace characters.'
            USING ERRCODE = '22023';
    END IF;
    NEW.order_number := v_clean;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_order_number ON public.orders;
CREATE TRIGGER trg_normalize_order_number
    BEFORE INSERT OR UPDATE OF order_number ON public.orders
    FOR EACH ROW
    EXECUTE FUNCTION public.normalize_and_validate_order_number();

ALTER TABLE public.payment_records ADD COLUMN IF NOT EXISTS screenshot_url TEXT;
ALTER TABLE public.payment_records ADD COLUMN IF NOT EXISTS ai_analysis JSONB DEFAULT '{}'::jsonb;
ALTER TABLE public.payment_records ADD COLUMN IF NOT EXISTS ai_confidence_score NUMERIC(5, 2);
ALTER TABLE public.payment_records ADD COLUMN IF NOT EXISTS ai_recommendation TEXT;
ALTER TABLE public.payment_records ADD COLUMN IF NOT EXISTS suspicious_indicators JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.payment_records ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;
ALTER TABLE public.payment_records ADD COLUMN IF NOT EXISTS verified_by TEXT;
ALTER TABLE public.payment_records ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_payment_records_order ON public.payment_records(order_id);
CREATE INDEX IF NOT EXISTS idx_payment_records_utr ON public.payment_records(transaction_reference);
CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_records_unique_order_id
    ON public.payment_records (order_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_records_unique_utr
    ON public.payment_records ((upper(regexp_replace(trim(transaction_reference), '[\s-]+', '', 'g'))))
    WHERE transaction_reference IS NOT NULL
      AND length(regexp_replace(trim(transaction_reference), '[\s-]+', '', 'g')) > 0;

CREATE OR REPLACE FUNCTION public.normalize_and_validate_payment_utr()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
    v_norm TEXT;
BEGIN
    v_norm := NULLIF(upper(regexp_replace(trim(COALESCE(NEW.transaction_reference, '')), '[\s-]+', '', 'g')), '');
    NEW.transaction_reference := v_norm;

    IF v_norm IS NULL THEN
        RAISE EXCEPTION 'UPI transaction_reference (UTR) is required and cannot be empty or cleared.'
            USING ERRCODE = '22023';
    END IF;

    IF v_norm !~ '^[0-9A-Z]{12}$' THEN
        RAISE EXCEPTION 'Invalid UPI UTR reference (%): must be a 12-character alphanumeric UTR.', v_norm
            USING ERRCODE = '22023';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_payment_utr ON public.payment_records;
CREATE TRIGGER trg_normalize_payment_utr
    BEFORE INSERT OR UPDATE OF transaction_reference ON public.payment_records
    FOR EACH ROW
    EXECUTE FUNCTION public.normalize_and_validate_payment_utr();

-- Verify all 4 unique indexes exist cleanly with indisunique & indisvalid & indisready
DO $$
DECLARE
    v_verified_count INTEGER;
BEGIN
    SELECT count(*) INTO v_verified_count
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_index ix ON ix.indexrelid = c.oid
    WHERE n.nspname = 'public'
      AND c.relname IN (
          'idx_orders_unique_order_number',
          'idx_orders_unique_trimmed_order_number',
          'idx_payment_records_unique_order_id',
          'idx_payment_records_unique_utr'
      )
      AND ix.indisunique = true
      AND ix.indisvalid = true
      AND ix.indisready = true;

    IF v_verified_count <> 4 THEN
        RAISE EXCEPTION 'Index verification failed: expected 4 unique valid ready indexes, found %.', v_verified_count;
    END IF;
END;
$$;

-- 3D. Complete RLS policy audit across SELECT, INSERT, UPDATE, DELETE, ALL
--     Drops ANY unsafe/broad policy (including broad authenticated SELECT policies
--     without strict ownership OR is_admin()), recreates canonical secure policies,
--     and verifies final RLS policies and role_table_grants.
DO $$
DECLARE
    pol RECORD;
    v_is_safe_select BOOLEAN;
    v_is_safe_admin_write BOOLEAN;
    v_has_bypass_expr BOOLEAN;
BEGIN
    FOR pol IN
        SELECT schemaname, tablename, policyname, cmd, roles, permissive, qual, with_check
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename IN ('orders', 'order_items', 'payment_records', 'order_shipment_updates')
    LOOP
        v_has_bypass_expr := (
            COALESCE(pol.qual, '') ~* '\m(true|1\s*=\s*1)\M'
            OR COALESCE(pol.with_check, '') ~* '\m(true|1\s*=\s*1)\M'
            OR COALESCE(pol.qual, '') ~* '\mOR\M'
            OR COALESCE(pol.qual, '') ~* 'user_id\s+IS\s+NULL'
        );

        IF pol.cmd = 'SELECT' THEN
            IF pol.roles = ARRAY['authenticated']::name[] AND NOT v_has_bypass_expr THEN
                IF COALESCE(pol.qual, '') ~* 'public\.is_admin\s*\(\s*\)|is_admin\s*\(\s*\)' THEN
                    v_is_safe_select := true;
                ELSIF pol.tablename = 'orders' THEN
                    v_is_safe_select := (
                        COALESCE(pol.qual, '') ~* 'auth\.uid\s*\(\s*\)'
                        AND COALESCE(pol.qual, '') ~* '\muser_id\M'
                    );
                ELSE
                    v_is_safe_select := (
                        COALESCE(pol.qual, '') ~* 'EXISTS\s*\('
                        AND COALESCE(pol.qual, '') ~* '\morders\M'
                        AND COALESCE(pol.qual, '') ~* 'auth\.uid\s*\(\s*\)'
                        AND COALESCE(pol.qual, '') ~* '\muser_id\M'
                    );
                END IF;
            ELSE
                v_is_safe_select := false;
            END IF;

            IF NOT v_is_safe_select THEN
                RAISE NOTICE 'Dropping unsafe/broad SELECT policy "%" (roles=%, qual=%) on public.%',
                    pol.policyname, pol.roles, COALESCE(pol.qual, '<null>'), pol.tablename;
                EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', pol.policyname, pol.tablename);
            END IF;
        ELSE
            v_is_safe_admin_write := (
                pol.roles = ARRAY['authenticated']::name[]
                AND NOT v_has_bypass_expr
                AND COALESCE(pol.qual, '') ~* 'is_admin\s*\(\s*\)'
                AND (pol.cmd = 'DELETE' OR COALESCE(pol.with_check, '') ~* 'is_admin\s*\(\s*\)')
            );

            IF NOT v_is_safe_admin_write THEN
                RAISE NOTICE 'Dropping unsafe/non-admin write policy "%" (% roles=%) on public.%',
                    pol.policyname, pol.cmd, pol.roles, pol.tablename;
                EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', pol.policyname, pol.tablename);
            END IF;
        END IF;
    END LOOP;
END;
$$;

-- Recreate deterministic customer-own-order SELECT and Admin policies
DROP POLICY IF EXISTS "Users can view own orders" ON public.orders;
CREATE POLICY "Users can view own orders" ON public.orders
    FOR SELECT TO authenticated
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins can view all orders" ON public.orders;
CREATE POLICY "Admins can view all orders" ON public.orders
    FOR SELECT TO authenticated
    USING (public.is_admin());

DROP POLICY IF EXISTS "Admins can update orders" ON public.orders;
CREATE POLICY "Admins can update orders" ON public.orders
    FOR UPDATE TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins can delete orders" ON public.orders;
CREATE POLICY "Admins can delete orders" ON public.orders
    FOR DELETE TO authenticated
    USING (public.is_admin());

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

DROP POLICY IF EXISTS "Admins can manage order items" ON public.order_items;
CREATE POLICY "Admins can manage order items" ON public.order_items
    FOR ALL TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

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

DROP POLICY IF EXISTS "Admins can manage payment records" ON public.payment_records;
CREATE POLICY "Admins can manage payment records" ON public.payment_records
    FOR ALL TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

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

-- Verify RLS, required policies, and table-level write revocations
DO $$
DECLARE
    tbl TEXT;
    v_rls_enabled BOOLEAN;
    v_own_select_cnt INTEGER;
    v_admin_select_cnt INTEGER;
    v_bad_priv_cnt INTEGER;
BEGIN
    FOREACH tbl IN ARRAY ARRAY['orders', 'order_items', 'payment_records', 'order_shipment_updates']
    LOOP
        SELECT c.relrowsecurity INTO v_rls_enabled
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relname = tbl;

        IF v_rls_enabled IS DISTINCT FROM TRUE THEN
            RAISE EXCEPTION 'RLS verification failed: public.% does not have ROW LEVEL SECURITY enabled.', tbl;
        END IF;

        SELECT count(*) INTO v_own_select_cnt
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = tbl
          AND cmd = 'SELECT'
          AND roles = ARRAY['authenticated']::name[]
          AND qual ~* 'auth\.uid\s*\(\s*\)';

        SELECT count(*) INTO v_admin_select_cnt
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = tbl
          AND cmd IN ('SELECT', 'ALL')
          AND roles = ARRAY['authenticated']::name[]
          AND qual ~* 'is_admin\s*\(\s*\)';

        IF v_own_select_cnt = 0 OR v_admin_select_cnt = 0 THEN
            RAISE EXCEPTION 'Policy verification failed on public.% (own_select=%, admin_select=%).', tbl, v_own_select_cnt, v_admin_select_cnt;
        END IF;

        SELECT count(*) INTO v_bad_priv_cnt
        FROM information_schema.role_table_grants
        WHERE table_schema = 'public'
          AND table_name = tbl
          AND (
              (grantee IN ('PUBLIC', 'anon') AND privilege_type IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE'))
              OR (grantee = 'authenticated' AND privilege_type IN ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE'))
          );

        IF v_bad_priv_cnt > 0 THEN
            RAISE EXCEPTION 'Grant verification failed: unexpected client privilege(s) still exist on public.% (count=%).', tbl, v_bad_priv_cnt;
        END IF;
    END LOOP;
END;
$$;

-- 3E. Install hardened, row-locked public.create_complete_order (ZERO 8% GST fallback)
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS status_history JSONB DEFAULT '[]'::jsonb NOT NULL;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS is_archived_by_admin BOOLEAN DEFAULT false NOT NULL;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS is_hidden_by_customer BOOLEAN DEFAULT false NOT NULL;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS customer_name TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS customer_email TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS customer_phone TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS payment_method TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'pending_admin_verification';

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
    -- 1. Enforce server-side / privileged database execution only
    IF current_user NOT IN ('postgres', 'supabase_admin', 'service_role')
       AND COALESCE(auth.role(), '') <> 'service_role' THEN
        RAISE EXCEPTION 'Unauthorized: create_complete_order can only be executed by authorized server-side workflows.';
    END IF;

    -- 2. Validate order_number & block duplicates
    v_order_number := NULLIF(trim(COALESCE(p_order->>'order_number', '')), '');
    IF v_order_number IS NULL OR length(v_order_number) < 3 THEN
        RAISE EXCEPTION 'Invalid order_number: a valid order_number (min 3 characters) is required.'
            USING ERRCODE = '22023';
    END IF;

    IF EXISTS (SELECT 1 FROM public.orders WHERE trim(order_number) = v_order_number) THEN
        RAISE EXCEPTION 'Duplicate order_number (%): order already exists.', v_order_number
            USING ERRCODE = '23505';
    END IF;

    -- 3. Lock initial status & payment_status (never allow client spoofing)
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

    -- 4. Validate customer info & shipping address strictly
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

    -- 6. Validate mandatory normalized 12-character alphanumeric UPI UTR & prevent duplicates
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

    -- 7. Validate items & acquire consistent FOR SHARE row locks in sorted product_id order
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

    -- 8. Authoritative coupon, shipping, strict per-product GST, and final total
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

    -- 9. Insert into public.orders with authoritative locked totals & initial statuses
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

    -- 10. Insert order items strictly using the transaction-locked product snapshot
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

    -- 11. Aggregated atomic inventory deduction per distinct product_id
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

    -- 12. Insert single authoritative payment record with locked pending_admin_verification status
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

-- 3F. Final post-install RPC overload & privilege verification
--     Confirms NO legacy overload remains executable by PUBLIC, anon, authenticated,
--     or service_role, and ONLY the canonical signatures are executable by service_role.
DO $$
DECLARE
    fn_record RECORD;
    v_is_canonical BOOLEAN;
    v_canonical_deduct_count INTEGER := 0;
    v_canonical_create_count INTEGER := 0;
    v_has_public_exec BOOLEAN;
BEGIN
    FOR fn_record IN
        SELECT
            p.oid AS fn_oid,
            p.proname,
            p.oid::regprocedure AS fn_sig,
            oidvectortypes(p.proargtypes) AS arg_types,
            p.proargnames AS arg_names,
            p.proacl
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname IN ('deduct_product_inventory', 'create_complete_order')
          AND p.prokind = 'f'
    LOOP
        v_is_canonical := (
            (
                fn_record.proname = 'deduct_product_inventory'
                AND fn_record.arg_types = 'text, integer, text, uuid'
                AND fn_record.arg_names = ARRAY['p_product_id', 'p_quantity', 'p_order_number', 'p_order_id']::text[]
            )
            OR
            (
                fn_record.proname = 'create_complete_order'
                AND fn_record.arg_types = 'jsonb, jsonb, jsonb'
                AND fn_record.arg_names = ARRAY['p_order', 'p_items', 'p_payment']::text[]
            )
        );

        SELECT EXISTS (
            SELECT 1
            FROM aclexplode(COALESCE(fn_record.proacl, acldefault('f', (SELECT proowner FROM pg_proc WHERE oid = fn_record.fn_oid)))) acl
            WHERE acl.grantee = 0
              AND acl.privilege_type = 'EXECUTE'
        ) INTO v_has_public_exec;

        IF v_has_public_exec
           OR has_function_privilege('anon', fn_record.fn_oid, 'EXECUTE')
           OR has_function_privilege('authenticated', fn_record.fn_oid, 'EXECUTE') THEN
            RAISE EXCEPTION
                'RPC privilege verification failed: function % remains executable by PUBLIC/anon/authenticated.',
                fn_record.fn_sig;
        END IF;

        IF NOT v_is_canonical THEN
            IF has_function_privilege('service_role', fn_record.fn_oid, 'EXECUTE') THEN
                RAISE EXCEPTION
                    'RPC privilege verification failed: non-canonical overload % remains executable by service_role.',
                    fn_record.fn_sig;
            END IF;
        ELSE
            IF NOT has_function_privilege('service_role', fn_record.fn_oid, 'EXECUTE') THEN
                RAISE EXCEPTION
                    'RPC privilege verification failed: canonical function % is missing EXECUTE grant for service_role.',
                    fn_record.fn_sig;
            END IF;

            IF fn_record.proname = 'deduct_product_inventory' THEN
                v_canonical_deduct_count := v_canonical_deduct_count + 1;
            ELSE
                v_canonical_create_count := v_canonical_create_count + 1;
            END IF;
        END IF;
    END LOOP;

    IF v_canonical_deduct_count <> 1 OR v_canonical_create_count <> 1 THEN
        RAISE EXCEPTION
            'RPC verification failed: expected 1 canonical deduct_product_inventory (found %) and 1 canonical create_complete_order (found %).',
            v_canonical_deduct_count, v_canonical_create_count;
    END IF;
END;
$$;

NOTIFY pgrst, 'reload schema';
