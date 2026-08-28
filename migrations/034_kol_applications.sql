-- Đăng ký KOL/KOC: thông tin hồ sơ + KYC (2 mặt CCCD + video khuôn mặt).
-- File lưu trong bảng riêng (bytea) để hàng hồ sơ nhẹ; admin duyệt xem lại.
CREATE TABLE IF NOT EXISTS kol_applications (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status text NOT NULL DEFAULT 'PENDING'
        CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
    full_name text NOT NULL,
    birth_date text,
    cccd_number text NOT NULL,
    cccd_issue text,
    address text,
    phone text NOT NULL,
    email text,
    tax_code text,
    bank_account text,
    bank_name text,
    social_links text,
    agreement_version integer NOT NULL,
    note text,
    decided_by uuid REFERENCES users(id),
    decided_at timestamptz,
    reject_reason text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- Mỗi người chỉ có MỘT hồ sơ đang chờ duyệt.
CREATE UNIQUE INDEX IF NOT EXISTS kol_applications_pending_unique
    ON kol_applications (user_id) WHERE status = 'PENDING';
CREATE INDEX IF NOT EXISTS kol_applications_status_idx
    ON kol_applications (status, created_at DESC);

-- File KYC: 2 mặt CCCD + video khuôn mặt.
CREATE TABLE IF NOT EXISTS kol_application_files (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    application_id uuid NOT NULL REFERENCES kol_applications(id) ON DELETE CASCADE,
    kind text NOT NULL CHECK (kind IN ('CCCD_FRONT', 'CCCD_BACK', 'FACE_VIDEO')),
    content_type text NOT NULL,
    byte_size integer NOT NULL,
    content bytea NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (application_id, kind)
);
