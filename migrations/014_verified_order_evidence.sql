BEGIN;

-- Chỉ đơn có chuỗi đối chiếu chính thức từ báo cáo sàn -> Sub ID/Click ID
-- -> affiliate_links -> user_id mới được coi là đủ bằng chứng để hoàn tiền.
ALTER TABLE orders
    ADD COLUMN IF NOT EXISTS evidence_status text NOT NULL DEFAULT 'MANUAL_REVIEW'
        CHECK (evidence_status IN ('VERIFIED', 'MANUAL_REVIEW')),
    ADD COLUMN IF NOT EXISTS evidence_verified_at timestamptz;

UPDATE orders
SET evidence_status = CASE
        WHEN affiliate_link_id IS NOT NULL
          AND raw_conversion_id IS NOT NULL
          AND attribution_method IN ('SUB_ID', 'CLICK_ID')
        THEN 'VERIFIED'
        ELSE 'MANUAL_REVIEW'
    END,
    evidence_verified_at = CASE
        WHEN affiliate_link_id IS NOT NULL
          AND raw_conversion_id IS NOT NULL
          AND attribution_method IN ('SUB_ID', 'CLICK_ID')
        THEN COALESCE(attributed_at, updated_at, created_at)
        ELSE NULL
    END;

CREATE INDEX IF NOT EXISTS orders_evidence_status_idx
    ON orders (evidence_status, updated_at DESC);

COMMIT;
