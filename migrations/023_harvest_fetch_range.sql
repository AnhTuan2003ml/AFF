-- Lấy sản phẩm theo DẢI TRANG: admin chọn "từ trang A đến B" cho Đề xuất
-- hoặc Bán chạy; worker click qua từng trang, lưu vào cache DB để tái dùng.
ALTER TABLE harvest_jobs DROP CONSTRAINT harvest_jobs_kind_check;
ALTER TABLE harvest_jobs ADD CONSTRAINT harvest_jobs_kind_check
  CHECK (kind IN ('LOGIN', 'FETCH', 'FETCH_PAGE', 'FETCH_RANGE'));
