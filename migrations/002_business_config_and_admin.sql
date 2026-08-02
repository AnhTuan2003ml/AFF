BEGIN;

-- Thêm vai trò SUPER_ADMIN cho tài khoản quản trị đồng bộ từ ENV.
ALTER TABLE users DROP CONSTRAINT users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
    CHECK (role IN ('USER', 'SUPPORT', 'FINANCE', 'RISK', 'ADMIN', 'AUDITOR', 'SUPER_ADMIN'));

-- Cấu hình nghiệp vụ hoa hồng/chia sẻ/giới thiệu: bảng đơn dòng (singleton).
-- ENV chỉ seed giá trị ban đầu; admin chỉnh trong trang quản trị có hiệu lực
-- ngay, không cần sửa .env hay khởi động lại.
CREATE TABLE business_config (
    id boolean PRIMARY KEY DEFAULT true CHECK (id),
    buyer_cashback_percent integer NOT NULL
        CHECK (buyer_cashback_percent BETWEEN 0 AND 100),
    platform_share_percent integer NOT NULL
        CHECK (platform_share_percent BETWEEN 0 AND 100),
    sharer_reward_from_platform_percent integer NOT NULL
        CHECK (sharer_reward_from_platform_percent BETWEEN 0 AND 100),
    referrer_reward_amount_vnd bigint NOT NULL DEFAULT 0
        CHECK (referrer_reward_amount_vnd >= 0),
    referred_user_bonus_amount_vnd bigint NOT NULL DEFAULT 0
        CHECK (referred_user_bonus_amount_vnd >= 0),
    referral_reward_trigger text NOT NULL DEFAULT 'first_approved_order'
        CHECK (referral_reward_trigger IN ('first_approved_order')),
    affiliate_attribution_days integer NOT NULL DEFAULT 30
        CHECK (affiliate_attribution_days > 0),
    cashback_hold_days integer NOT NULL DEFAULT 30
        CHECK (cashback_hold_days >= 0),
    min_withdraw_amount_vnd bigint NOT NULL DEFAULT 100000
        CHECK (min_withdraw_amount_vnd > 0),
    enable_share_link boolean NOT NULL DEFAULT true,
    enable_referral_program boolean NOT NULL DEFAULT true,
    updated_by uuid REFERENCES users(id),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK (buyer_cashback_percent + platform_share_percent = 100)
);

-- Bản chụp tỷ lệ chia hoa hồng tại thời điểm ghi nhận đơn, để thay đổi cấu
-- hình sau này không tác động hồi tố tới các đơn đã xử lý.
ALTER TABLE commission_entries
    ADD COLUMN sharer_user_id uuid REFERENCES users(id),
    ADD COLUMN buyer_percent integer NOT NULL DEFAULT 0
        CHECK (buyer_percent BETWEEN 0 AND 100),
    ADD COLUMN platform_percent integer NOT NULL DEFAULT 0
        CHECK (platform_percent BETWEEN 0 AND 100),
    ADD COLUMN sharer_percent integer NOT NULL DEFAULT 0
        CHECK (sharer_percent BETWEEN 0 AND 100);

-- Tài khoản hệ thống ghi nhận phần hoa hồng nền tảng giữ lại.
INSERT INTO ledger_accounts (owner_type, owner_id, code) VALUES
    ('SYSTEM', NULL, 'PLATFORM_REVENUE')
ON CONFLICT DO NOTHING;

CREATE TRIGGER business_config_set_updated_at BEFORE UPDATE ON business_config
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMIT;
