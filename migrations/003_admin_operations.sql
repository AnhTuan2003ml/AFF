BEGIN;

-- Xóa tài khoản trong khu vực quản trị là xóa mềm: ngừng đăng nhập nhưng vẫn
-- giữ đơn và bút toán phục vụ đối soát. Chỉ SUPER_ADMIN được thực hiện.
ALTER TABLE users
    ADD COLUMN deleted_at timestamptz,
    ADD COLUMN deleted_by uuid REFERENCES users(id),
    ADD COLUMN deletion_reason text;

CREATE INDEX users_status_created_idx ON users (status, created_at DESC);
CREATE INDEX users_deleted_idx ON users (deleted_at DESC)
WHERE deleted_at IS NOT NULL;

-- Lưu dấu vết quyết định duyệt/từ chối hoàn tiền thủ công.
ALTER TABLE orders
    ADD COLUMN reviewed_by uuid REFERENCES users(id),
    ADD COLUMN reviewed_at timestamptz,
    ADD COLUMN review_reason text;

CREATE INDEX orders_review_queue_idx ON orders (status, created_at DESC)
WHERE status = 'PENDING';

COMMIT;
