BEGIN;

ALTER TABLE affiliate_links
    ADD COLUMN IF NOT EXISTS product_original_price_vnd bigint
        CHECK (
            product_original_price_vnd IS NULL
            OR product_original_price_vnd >= 0
        );

COMMIT;
