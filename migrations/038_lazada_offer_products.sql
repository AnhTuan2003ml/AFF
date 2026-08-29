-- Kho sản phẩm affiliate LAZADA cho trang Khám phá (menu con Lazada của
-- Hot/Bán chạy/Đề xuất). Cập nhật 1 lần/ngày lúc 1h sáng, SONG SONG với luồng
-- Shopee — lưu sẵn vào DB để tab Lazada đọc nhanh, không gọi API mỗi lượt xem.
-- Nguồn: API affiliate /marketing/product/feed (offerType=1, hoa hồng thật).

CREATE TABLE lazada_offer_products (
    item_id             text PRIMARY KEY,
    name                text NOT NULL,
    image_url           text,
    price_vnd           numeric(14, 0),
    commission_rate_bps integer,
    commission_vnd      numeric(14, 0),
    shop_name           text,
    product_url         text NOT NULL,
    sales_count         integer,
    position            integer NOT NULL DEFAULT 0,
    fetched_at          timestamptz NOT NULL DEFAULT now()
);

-- Sắp xếp phục vụ các mục: hot = hoa hồng cao, best = bán chạy 7 ngày,
-- recommend = thứ tự feed (position).
CREATE INDEX lazada_offer_products_commission_idx
    ON lazada_offer_products (commission_vnd DESC NULLS LAST);
CREATE INDEX lazada_offer_products_sales_idx
    ON lazada_offer_products (sales_count DESC NULLS LAST);
CREATE INDEX lazada_offer_products_position_idx
    ON lazada_offer_products (position);
