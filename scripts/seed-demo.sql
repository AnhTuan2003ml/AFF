-- Dữ liệu kiểm thử mô phỏng: 28 người dùng, giới thiệu ngẫu nhiên,
-- mỗi người mua 0–8 sản phẩm với số tiền thật.
-- An toàn chạy lại: chỉ tạo/xóa dữ liệu có email @demo.shoptik.
-- Chạy: docker compose exec -T postgres psql -U aff_user -d aff_cashback -f - < scripts/seed-demo.sql
--
-- Mọi tài khoản demo đăng nhập được ngay bằng mật khẩu chung:
--   Email: demo1@demo.shoptik .. demo28@demo.shoptik
--   Mật khẩu: Shoptik@2026
-- (hash argon2id bên dưới sinh từ đúng src/lib/password.ts để verifyPassword khớp)

BEGIN;

-- Dọn dữ liệu demo của lần chạy trước.
-- Ledger vốn bất biến (trigger chặn sửa/xóa) — riêng bước dọn demo này tắt
-- trigger trong phạm vi transaction, xóa xong bật lại ngay trước khi tạo mới.
SET LOCAL session_replication_role = 'replica';
DELETE FROM commission_entries ce USING orders o, users u
  WHERE ce.order_id = o.id AND o.user_id = u.id AND u.email LIKE '%@demo.shoptik';
DELETE FROM orders o USING users u
  WHERE o.user_id = u.id AND u.email LIKE '%@demo.shoptik';
DELETE FROM referrals r USING users u
  WHERE (r.referred_user_id = u.id OR r.referrer_user_id = u.id)
    AND u.email LIKE '%@demo.shoptik';
-- Bút toán từng phát sinh khi duyệt đơn demo: xóa trọn các giao dịch có
-- chạm tới ví demo (kể cả chân bút toán phía tài khoản hệ thống) trước.
DELETE FROM ledger_entries e
  WHERE e.transaction_id IN (
    SELECT DISTINCT e2.transaction_id
    FROM ledger_entries e2
    JOIN ledger_accounts la ON la.id = e2.account_id
    JOIN users u ON u.id = la.owner_id
    WHERE la.owner_type = 'USER' AND u.email LIKE '%@demo.shoptik'
  );
DELETE FROM ledger_transactions t
  WHERE NOT EXISTS (
    SELECT 1 FROM ledger_entries e WHERE e.transaction_id = t.id
  );
DELETE FROM ledger_accounts la USING users u
  WHERE la.owner_type = 'USER' AND la.owner_id = u.id
    AND u.email LIKE '%@demo.shoptik';
DELETE FROM users WHERE email LIKE '%@demo.shoptik';

-- Bật lại toàn bộ trigger (tạo ví tự động, kiểm tra cân bằng…) cho phần tạo mới.
SET LOCAL session_replication_role = 'origin';

DO $$
DECLARE
  names text[] := ARRAY[
    'Nguyễn Văn An','Trần Thị Bích','Lê Minh Châu','Phạm Quốc Dũng',
    'Hoàng Thu Em','Vũ Gia Phong','Đặng Thúy Hằng','Bùi Đức Huy',
    'Đỗ Khánh Linh','Ngô Bảo Long','Dương Thị Mai','Lý Hoài Nam',
    'Trịnh Yến Oanh','Phan Thanh Phúc','Võ Diễm Quỳnh','Đinh Trường Sơn',
    'Mai Anh Thư','Hồ Văn Tùng','Chu Hải Uyên','Tạ Quang Vinh',
    'La Tường Vy','Quách Thế Xuân','Ninh Hồng Yến','Ông Ích Khiêm',
    'Thái Mỹ Duyên','Triệu Văn Đạt','Kiều Trang Nhung','Lâm Gia Bảo'
  ];
  products text[] := ARRAY[
    'Robot hút bụi mini','Tai nghe Bluetooth chống ồn','Áo thun cotton unisex',
    'Nồi chiên không dầu 5L','Bình giữ nhiệt 500ml','Chuột không dây im lặng',
    'Đèn ngủ cảm ứng','Ốp lưng điện thoại trong suốt','Son dưỡng môi Hàn Quốc',
    'Serum dưỡng da vitamin C','Giày thể thao nam nữ','Balo laptop chống nước',
    'Cáp sạc nhanh Type-C','Máy xay sinh tố đa năng','Kem chống nắng SPF50',
    'Quạt mini để bàn USB'
  ];
  prices bigint[] := ARRAY[
    450000, 320000, 120000, 1250000, 180000, 210000,
    95000, 45000, 85000, 350000, 650000, 420000,
    65000, 780000, 265000, 150000
  ];
  -- Argon2id của mật khẩu demo "Shoptik@2026" — xem ghi chú đầu file.
  demo_password_hash text :=
    '$argon2id$v=19$m=65536,p=1,t=3$e0ZZG05DoKsSZK7AWYMArg$HnEfU3L/N91TZbB5v9ZjHXPjNFgc7E5lo9B35L9zb30';
  demo_ids uuid[] := '{}';
  uid uuid;
  referrer_id uuid;
  my_referrer uuid;
  order_id uuid;
  ucreated timestamptz;
  i int; k int; j int; n_orders int; pidx int; hr int;
  price bigint; comm bigint; cb bigint; sh bigint;
  st text;
  pt timestamptz;
  r double precision;
BEGIN
  FOR i IN 1..array_length(names, 1) LOOP
    -- Ngày tham gia rải trong 10 tháng, người tạo sau có index lớn hơn
    ucreated := now()
      - (((array_length(names, 1) - i) * 10 + floor(random() * 10))::int || ' days')::interval
      - ((floor(random() * 86400))::int || ' seconds')::interval;

    INSERT INTO users (
      email, full_name, status, role, referral_code, password_hash,
      email_verified_at, created_at
    ) VALUES (
      'demo' || i || '@demo.shoptik', names[i], 'ACTIVE', 'USER',
      'DEMO' || lpad(i::text, 3, '0'), demo_password_hash, ucreated, ucreated
    ) RETURNING id INTO uid;
    demo_ids := demo_ids || uid;

    -- 65% người (từ người thứ 4) vào qua giới thiệu của người đăng ký trước đó
    my_referrer := NULL;
    IF i > 3 AND random() < 0.65 THEN
      j := 1 + floor(random() * (i - 1))::int;
      referrer_id := demo_ids[j];
      my_referrer := referrer_id;
      UPDATE users SET referred_by_user_id = referrer_id WHERE id = uid;
      INSERT INTO referrals (referrer_user_id, referred_user_id, status, created_at)
      VALUES (referrer_id, uid, 'PENDING', ucreated);
    END IF;

    -- Mỗi người mua 0–8 đơn
    n_orders := floor(random() * 9)::int;
    FOR k IN 1..n_orders LOOP
      pidx := 1 + floor(random() * array_length(products, 1))::int;
      price := ((prices[pidx] * (0.8 + random() * 0.5))::bigint / 1000) * 1000;
      comm := floor(price * (300 + random() * 700) / 10000)::bigint;  -- hoa hồng 3–10%
      cb := comm * 80 / 100;                                           -- hoàn 80%

      r := random();
      st := CASE WHEN r < 0.78 THEN 'APPROVED'
                 WHEN r < 0.90 THEN 'PENDING'
                 ELSE 'INVALID' END;

      -- Thời điểm mua sau ngày tham gia; khung giờ thiên về buổi tối
      pt := ucreated + (floor(random() * GREATEST(1, EXTRACT(EPOCH FROM (now() - ucreated))))::bigint || ' seconds')::interval;
      r := random();
      hr := CASE WHEN r < 0.12 THEN 5 + floor(random() * 6)::int
                 WHEN r < 0.27 THEN 11 + floor(random() * 3)::int
                 WHEN r < 0.50 THEN 14 + floor(random() * 4)::int
                 WHEN r < 0.88 THEN 18 + floor(random() * 5)::int
                 ELSE (23 + floor(random() * 6)::int) % 24 END;
      pt := date_trunc('day', pt)
        + (hr || ' hours')::interval
        + (floor(random() * 60)::int || ' minutes')::interval;
      IF pt > now() THEN pt := now() - interval '2 hours'; END IF;
      IF pt < ucreated THEN pt := ucreated + interval '1 hour'; END IF;

      INSERT INTO orders (
        user_id, platform, platform_order_id, status,
        order_amount_vnd, commission_vnd, cashback_vnd,
        purchased_at, approved_at, created_at, updated_at
      ) VALUES (
        uid, 'SHOPEE', 'DEMO' || i || '-' || k || '-' || floor(random() * 1000000)::int, st,
        price, comm, cb, pt,
        CASE WHEN st = 'APPROVED'
          THEN LEAST(pt + ((3 + floor(random() * 8))::int || ' days')::interval, now()) END,
        pt, pt
      ) RETURNING id INTO order_id;

      INSERT INTO order_items (order_id, external_item_key, item_name, quantity, amount_vnd)
      VALUES (order_id, 'demo-item-' || i || '-' || k, products[pidx], 1, price);

      IF st = 'APPROVED' THEN
        -- B do A giới thiệu: A hưởng 20% phần nền tảng = 4% hoa hồng.
        sh := CASE WHEN my_referrer IS NOT NULL
          THEN floor(comm * 4 / 100)::bigint ELSE 0 END;
        INSERT INTO commission_entries (
          order_id, user_id, sharer_user_id, user_amount_vnd,
          referral_amount_vnd, platform_amount_vnd, status,
          buyer_percent, platform_percent, sharer_percent, created_at
        ) VALUES (
          order_id, uid, my_referrer, cb, sh, comm - cb - sh, 'AVAILABLE',
          80, CASE WHEN my_referrer IS NOT NULL THEN 16 ELSE 20 END,
          CASE WHEN my_referrer IS NOT NULL THEN 4 ELSE 0 END, pt
        );
      END IF;
    END LOOP;
  END LOOP;

  -- Trạng thái giới thiệu theo hành vi mua của người được mời
  UPDATE referrals r SET status = 'REWARDED'
  FROM users u
  WHERE u.id = r.referred_user_id AND u.email LIKE '%@demo.shoptik'
    AND EXISTS (SELECT 1 FROM orders o
      WHERE o.user_id = u.id AND o.status = 'APPROVED');
  UPDATE referrals r SET status = 'ELIGIBLE'
  FROM users u
  WHERE u.id = r.referred_user_id AND u.email LIKE '%@demo.shoptik'
    AND r.status = 'PENDING'
    AND EXISTS (SELECT 1 FROM orders o WHERE o.user_id = u.id);
END $$;

COMMIT;
