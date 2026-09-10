-- Nạp ảnh nền gốc mặc định làm mục ĐẦU TIÊN trong danh sách hero (nếu chưa có).
-- sort_order = 0 để luôn đứng đầu vòng xoay; admin có thể tắt/xoá/đổi thứ tự sau.

INSERT INTO hero_media (kind, url, duration_ms, sort_order, active)
SELECT 'image', '/assets/images/shop-tik-commerce-hero.webp', 6000, 0, true
WHERE NOT EXISTS (
    SELECT 1 FROM hero_media
     WHERE url = '/assets/images/shop-tik-commerce-hero.webp'
);
