BEGIN;

ALTER TABLE affiliate_links
    ADD COLUMN IF NOT EXISTS product_id text,
    ADD COLUMN IF NOT EXISTS shop_id text,
    ADD COLUMN IF NOT EXISTS product_name text,
    ADD COLUMN IF NOT EXISTS shop_name text,
    ADD COLUMN IF NOT EXISTS product_image_url text,
    ADD COLUMN IF NOT EXISTS product_price_vnd bigint
        CHECK (product_price_vnd IS NULL OR product_price_vnd >= 0),
    ADD COLUMN IF NOT EXISTS estimated_commission_vnd bigint
        CHECK (
            estimated_commission_vnd IS NULL
            OR estimated_commission_vnd >= 0
        ),
    ADD COLUMN IF NOT EXISTS estimated_cashback_vnd bigint
        CHECK (
            estimated_cashback_vnd IS NULL
            OR estimated_cashback_vnd >= 0
        ),
    ADD COLUMN IF NOT EXISTS buyer_cashback_percent integer
        CHECK (
            buyer_cashback_percent IS NULL
            OR buyer_cashback_percent BETWEEN 0 AND 100
        ),
    ADD COLUMN IF NOT EXISTS commission_source text
        CHECK (
            commission_source IS NULL
            OR commission_source IN (
                'PARTNER_API',
                'CONFIGURED_RATE',
                'UNAVAILABLE'
            )
        );

CREATE INDEX IF NOT EXISTS affiliate_links_product_idx
    ON affiliate_links (platform, product_id, shop_id, created_at DESC);

COMMIT;
