-- Sửa dữ liệu hiển thị sai đã ghi nhận trong vòng kiểm thử UX.

-- Lỗi nhập thừa một số 0 ở mốc mua 3 đơn: 200.000đ -> 20.000đ.
UPDATE mission_definitions
SET reward_amount_vnd = 20000,
    updated_at = now()
WHERE type = 'PURCHASE_MILESTONE'
  AND threshold = 3
  AND reward_amount_vnd = 200000;

-- Nếu còn dãy mốc cũ bị giảm thưởng khi ngưỡng tăng, giữ nguyên quyền lợi ở
-- mốc thấp và nâng các mốc sau lên bằng mức cao nhất trước đó.
WITH normalized AS (
  SELECT id,
    max(reward_amount_vnd) OVER (
      PARTITION BY type
      ORDER BY threshold
      ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
    ) AS normalized_reward
  FROM mission_definitions
)
UPDATE mission_definitions AS definition
SET reward_amount_vnd = normalized.normalized_reward,
    updated_at = now()
FROM normalized
WHERE definition.id = normalized.id
  AND definition.reward_amount_vnd < normalized.normalized_reward;

-- Giá gốc thấp hơn giá bán không tạo ra ưu đãi hợp lệ. Đưa về bằng giá bán
-- để ẩn phần trăm giảm sai, sau đó khóa lỗi này ở tầng cơ sở dữ liệu.
UPDATE content_items
SET original_price_vnd = price_vnd
WHERE price_vnd IS NOT NULL
  AND original_price_vnd IS NOT NULL
  AND original_price_vnd < price_vnd;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'content_items_original_price_not_lower'
  ) THEN
    ALTER TABLE content_items
      ADD CONSTRAINT content_items_original_price_not_lower
      CHECK (
        original_price_vnd IS NULL
        OR price_vnd IS NULL
        OR original_price_vnd >= price_vnd
      );
  END IF;
END
$$;
