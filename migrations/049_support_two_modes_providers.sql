-- CSKH: rút còn 2 chế độ (Thủ công / Tự động) và mở rộng nhà cung cấp AI.
-- Tự động = ưu tiên trả lời từ kho đã học (DB); chưa có mẫu phù hợp thì gọi AI
-- rồi lưu lại. Thêm ai_base_url cho provider tùy chỉnh (DeepSeek / bất kỳ API
-- tương thích OpenAI): dán link + model + key.

ALTER TABLE support_autoreply_settings
    ADD COLUMN IF NOT EXISTS ai_base_url text NOT NULL DEFAULT '';

-- OFF/CANNED → MANUAL, AI → AUTO.
UPDATE support_autoreply_settings
    SET mode = CASE WHEN mode = 'AI' THEN 'AUTO' ELSE 'MANUAL' END;

ALTER TABLE support_autoreply_settings
    DROP CONSTRAINT IF EXISTS support_autoreply_settings_mode_check;
ALTER TABLE support_autoreply_settings
    ALTER COLUMN mode SET DEFAULT 'MANUAL';
ALTER TABLE support_autoreply_settings
    ADD CONSTRAINT support_autoreply_settings_mode_check
    CHECK (mode IN ('MANUAL', 'AUTO'));

ALTER TABLE support_autoreply_settings
    DROP CONSTRAINT IF EXISTS support_autoreply_settings_ai_provider_check;
ALTER TABLE support_autoreply_settings
    ADD CONSTRAINT support_autoreply_settings_ai_provider_check
    CHECK (ai_provider IN ('openai', 'anthropic', 'gemini', 'deepseek', 'custom'));
