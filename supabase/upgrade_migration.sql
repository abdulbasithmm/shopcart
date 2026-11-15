-- ==============================================================================
-- SHOPCART – SAFE UPGRADE MIGRATION (NON-DESTRUCTIVE & IDEMPOTENT)
-- ==============================================================================
-- Features covered:
--   1. Customer Language Preference on public.profiles (en, ml, hi)
--   2. Demo / Promotional Videos & Persistent Per-User Likes (public.videos, public.video_likes)
--   3. Storage Bucket: product-videos (Admin upload, Public read)
--   4. Verified-Purchase Product Reviews & Admin Moderation Hardening (public.reviews)
--
-- SAFETY GUARANTEES:
--   - Does NOT drop or reset any existing tables or delete any customer/order/product data.
--   - Preserves Row Level Security (RLS) on every table.
--   - Inspects for pre-existing duplicate (product_id, user_id) reviews safely before
--     creating the unique partial index so existing live databases are never broken.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. USER LANGUAGE PREFERENCE (public.profiles)
-- ------------------------------------------------------------------------------
ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS preferred_language TEXT NOT NULL DEFAULT 'en';

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'public.profiles'::regclass
          AND conname = 'profiles_preferred_language_check'
    ) THEN
        ALTER TABLE public.profiles
            ADD CONSTRAINT profiles_preferred_language_check
            CHECK (preferred_language IN ('en', 'ml', 'hi'));
    END IF;
END;
$$;

-- ------------------------------------------------------------------------------
-- 2. DEMO & PROMOTIONAL VIDEOS + PERSISTENT LIKES
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.videos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    description TEXT,
    video_url TEXT NOT NULL,
    thumbnail_url TEXT,
    product_id TEXT REFERENCES public.products(id) ON DELETE SET NULL,
    likes_count INTEGER NOT NULL DEFAULT 0 CHECK (likes_count >= 0),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_videos_is_active ON public.videos(is_active);
CREATE INDEX IF NOT EXISTS idx_videos_created_at ON public.videos(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_videos_product_id ON public.videos(product_id);

CREATE TABLE IF NOT EXISTS public.video_likes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    video_id UUID NOT NULL REFERENCES public.videos(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    UNIQUE (video_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_video_likes_video_id ON public.video_likes(video_id);
CREATE INDEX IF NOT EXISTS idx_video_likes_user_id ON public.video_likes(user_id);

-- Keep updated_at current on public.videos
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'handle_updated_at' AND pronamespace = 'public'::regnamespace) THEN
        DROP TRIGGER IF EXISTS set_videos_updated_at ON public.videos;
        CREATE TRIGGER set_videos_updated_at
            BEFORE UPDATE ON public.videos
            FOR EACH ROW
            EXECUTE FUNCTION public.handle_updated_at();
    END IF;
END;
$$;

-- Sync videos.likes_count accurately via trigger whenever video_likes changes
CREATE OR REPLACE FUNCTION public.sync_video_likes_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_target_video_id UUID;
BEGIN
    v_target_video_id := COALESCE(NEW.video_id, OLD.video_id);
    IF v_target_video_id IS NOT NULL THEN
        UPDATE public.videos
        SET likes_count = (
            SELECT COUNT(*)::INTEGER
            FROM public.video_likes vl
            WHERE vl.video_id = v_target_video_id
        )
        WHERE id = v_target_video_id;
    END IF;
    RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_video_likes_count ON public.video_likes;
CREATE TRIGGER trg_sync_video_likes_count
    AFTER INSERT OR DELETE ON public.video_likes
    FOR EACH ROW
    EXECUTE FUNCTION public.sync_video_likes_count();

-- RLS for public.videos
ALTER TABLE public.videos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can view active videos" ON public.videos;
CREATE POLICY "Public can view active videos" ON public.videos
    FOR SELECT
    USING (is_active = true OR public.is_admin());

DROP POLICY IF EXISTS "Admins manage videos" ON public.videos;
CREATE POLICY "Admins manage videos" ON public.videos
    FOR ALL TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- RLS for public.video_likes
ALTER TABLE public.video_likes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can count video likes" ON public.video_likes;
CREATE POLICY "Public can count video likes" ON public.video_likes
    FOR SELECT
    USING (true);

DROP POLICY IF EXISTS "Authenticated users can like videos once" ON public.video_likes;
CREATE POLICY "Authenticated users can like videos once" ON public.video_likes
    FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Authenticated users can unlike own likes" ON public.video_likes;
CREATE POLICY "Authenticated users can unlike own likes" ON public.video_likes
    FOR DELETE TO authenticated
    USING (auth.uid() = user_id OR public.is_admin());

GRANT SELECT ON public.videos TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.videos TO authenticated;
GRANT ALL ON public.videos TO service_role;

GRANT SELECT ON public.video_likes TO anon, authenticated;
GRANT INSERT, DELETE ON public.video_likes TO authenticated;
GRANT ALL ON public.video_likes TO service_role;

-- ------------------------------------------------------------------------------
-- 3. STORAGE BUCKET: product-videos (Admin upload, Public read)
-- ------------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'product-videos',
    'product-videos',
    true,
    52428800, -- 50 MB limit
    ARRAY['video/mp4', 'video/webm', 'video/quicktime']
)
ON CONFLICT (id) DO UPDATE SET
    public = true,
    file_size_limit = 52428800,
    allowed_mime_types = ARRAY['video/mp4', 'video/webm', 'video/quicktime'];

DROP POLICY IF EXISTS "Public Read Product Videos" ON storage.objects;
CREATE POLICY "Public Read Product Videos"
ON storage.objects FOR SELECT
USING (bucket_id = 'product-videos');

DROP POLICY IF EXISTS "Admin Upload Product Videos" ON storage.objects;
CREATE POLICY "Admin Upload Product Videos"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
    bucket_id = 'product-videos'
    AND public.is_admin()
);

DROP POLICY IF EXISTS "Admin Update Product Videos" ON storage.objects;
CREATE POLICY "Admin Update Product Videos"
ON storage.objects FOR UPDATE TO authenticated
USING (
    bucket_id = 'product-videos'
    AND public.is_admin()
);

DROP POLICY IF EXISTS "Admin Delete Product Videos" ON storage.objects;
CREATE POLICY "Admin Delete Product Videos"
ON storage.objects FOR DELETE TO authenticated
USING (
    bucket_id = 'product-videos'
    AND public.is_admin()
);

-- ------------------------------------------------------------------------------
-- 4. VERIFIED-PURCHASE REVIEWS & MODERATION HARDENING (public.reviews)
-- ------------------------------------------------------------------------------
ALTER TABLE public.reviews
    ADD COLUMN IF NOT EXISTS order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS moderation_status TEXT NOT NULL DEFAULT 'approved',
    ADD COLUMN IF NOT EXISTS moderated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS moderated_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now());

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'public.reviews'::regclass
          AND conname = 'reviews_moderation_status_check'
    ) THEN
        ALTER TABLE public.reviews
            ADD CONSTRAINT reviews_moderation_status_check
            CHECK (moderation_status IN ('approved', 'hidden', 'pending', 'rejected'));
    END IF;
END;
$$;

-- Safe non-destructive creation of unique index on (product_id, user_id)
DO $$
DECLARE
    v_dup_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_dup_count
    FROM (
        SELECT product_id, user_id
        FROM public.reviews
        WHERE user_id IS NOT NULL
        GROUP BY product_id, user_id
        HAVING COUNT(*) > 1
    ) d;

    IF v_dup_count = 0 THEN
        CREATE UNIQUE INDEX IF NOT EXISTS idx_reviews_unique_product_user
            ON public.reviews (product_id, user_id)
            WHERE user_id IS NOT NULL;
    ELSE
        RAISE NOTICE 'Skipped idx_reviews_unique_product_user creation because % duplicate (product_id, user_id) pairs already exist in public.reviews. Inspect manually without deleting rows.', v_dup_count;
    END IF;
END;
$$;

-- Helper function: checks whether authenticated user has a verified purchase/delivery of a product
CREATE OR REPLACE FUNCTION public.has_verified_product_purchase(p_user_id UUID, p_product_id TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.orders o
        JOIN public.order_items oi ON oi.order_id = o.id
        WHERE o.user_id = p_user_id
          AND oi.product_id = p_product_id
          AND COALESCE(o.status, '') NOT IN ('cancelled', 'refunded')
          AND (
              o.status = 'delivered'
              OR o.payment_status = 'verified'
          )
    );
$$;

-- Replace insecure permissive RLS policies on public.reviews
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can update review helpful votes" ON public.reviews;
DROP POLICY IF EXISTS "Public can view product reviews" ON public.reviews;
CREATE POLICY "Public can view approved product reviews" ON public.reviews
    FOR SELECT
    USING (moderation_status = 'approved' OR auth.uid() = user_id OR public.is_admin());

DROP POLICY IF EXISTS "Authenticated users can submit reviews" ON public.reviews;
DROP POLICY IF EXISTS "Verified buyers can submit reviews" ON public.reviews;
CREATE POLICY "Verified buyers can submit reviews" ON public.reviews
    FOR INSERT TO authenticated
    WITH CHECK (
        auth.uid() = user_id
        AND public.has_verified_product_purchase(auth.uid(), product_id)
    );

DROP POLICY IF EXISTS "Users can update own reviews" ON public.reviews;
CREATE POLICY "Users can update own reviews" ON public.reviews
    FOR UPDATE TO authenticated
    USING (auth.uid() = user_id OR public.is_admin())
    WITH CHECK (auth.uid() = user_id OR public.is_admin());

DROP POLICY IF EXISTS "Admins and authors can delete reviews" ON public.reviews;
CREATE POLICY "Admins and authors can delete reviews" ON public.reviews
    FOR DELETE TO authenticated
    USING (auth.uid() = user_id OR public.is_admin());

GRANT SELECT ON public.reviews TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.reviews TO authenticated;
GRANT ALL ON public.reviews TO service_role;
