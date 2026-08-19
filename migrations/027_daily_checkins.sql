-- Điểm danh mỗi ngày: mỗi tài khoản 1 lần/ngày khi vào ứng dụng.
CREATE TABLE daily_checkins (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES users(id),
    checkin_date date NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (user_id, checkin_date)
);

CREATE INDEX idx_daily_checkins_user
    ON daily_checkins (user_id, checkin_date DESC);
