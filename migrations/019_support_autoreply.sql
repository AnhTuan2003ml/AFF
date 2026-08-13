-- Tự trả lời chat hỗ trợ: trả lời mẫu (CANNED) hoặc AI (OpenAI/Anthropic/Gemini)
-- kèm kho tài liệu tham khảo (RAG đơn giản, xếp hạng theo trùng từ khóa).

-- Đánh dấu tin nhắn do hệ thống tự sinh (bot) để phân biệt với nhân viên thật.
ALTER TABLE support_chat_messages
ADD COLUMN is_auto boolean NOT NULL DEFAULT false;

-- Cấu hình singleton (đúng 1 dòng, id luôn = true).
CREATE TABLE support_autoreply_settings (
    id boolean PRIMARY KEY DEFAULT true CHECK (id),
    mode text NOT NULL DEFAULT 'OFF' CHECK (mode IN ('OFF', 'CANNED', 'AI')),
    canned_message text NOT NULL DEFAULT '',
    ai_provider text NOT NULL DEFAULT 'openai'
        CHECK (ai_provider IN ('openai', 'anthropic', 'gemini')),
    -- API key mã hóa AES-256-GCM bằng FIELD_ENCRYPTION_KEY (như cookie sàn).
    ai_api_key_ciphertext text NOT NULL DEFAULT '',
    ai_model text NOT NULL DEFAULT '',
    -- "Skill": system prompt định hình vai trò/giọng điệu/nghiệp vụ của AI.
    ai_system_prompt text NOT NULL DEFAULT '',
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- Tài liệu RAG: nội dung thuần văn bản do admin dán vào, đưa vào ngữ cảnh AI
-- khi trùng từ khóa với câu hỏi của khách.
CREATE TABLE support_kb_documents (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
    content text NOT NULL CHECK (char_length(content) BETWEEN 1 AND 20000),
    created_at timestamptz NOT NULL DEFAULT now()
);
