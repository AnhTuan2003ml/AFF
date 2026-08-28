-- Mã giới thiệu theo chính sách mới:
--   - Khách thường: hệ thống random 6 CHỮ SỐ, không được sửa.
--   - Đối tác/KOL (is_special_partner): được đổi MỘT lần sang mã tự chọn
--     (chữ + số, tối đa 9 ký tự) nhưng phải được admin phê duyệt.
-- Quan hệ giới thiệu lưu theo user id (referred_by_user_id, referrals) nên đổi
-- chuỗi mã KHÔNG mất dữ liệu cũ; mã cũ còn được giữ ở old_code để link đã chia
-- sẻ trước đó vẫn quy về đúng người.

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS referral_code_customized_at timestamptz;

CREATE TABLE IF NOT EXISTS referral_code_requests (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    old_code text NOT NULL,
    requested_code text NOT NULL,
    status text NOT NULL DEFAULT 'PENDING'
        CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
    decided_by uuid REFERENCES users(id),
    decided_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS referral_code_requests_status_idx
    ON referral_code_requests (status, created_at DESC);
-- Mỗi người tối đa MỘT yêu cầu đang chờ.
CREATE UNIQUE INDEX IF NOT EXISTS referral_code_requests_pending_unique
    ON referral_code_requests (user_id)
    WHERE status = 'PENDING';

-- Đưa mọi mã hiện có (base64 8 ký tự đời cũ) về chuẩn 6 chữ số random.
DO $$
DECLARE
    r record;
    new_code text;
BEGIN
    FOR r IN SELECT id FROM users WHERE referral_code !~ '^[0-9]{6}$' LOOP
        LOOP
            new_code := lpad(floor(random() * 1000000)::int::text, 6, '0');
            BEGIN
                UPDATE users SET referral_code = new_code WHERE id = r.id;
                EXIT;
            EXCEPTION WHEN unique_violation THEN
                -- trùng thì quay số lại
            END;
        END LOOP;
    END LOOP;
END $$;
