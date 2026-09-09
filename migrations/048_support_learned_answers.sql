-- Tự học chăm sóc khách hàng: mỗi khi AI trả lời, lưu cặp (câu hỏi chuẩn hóa →
-- câu trả lời) làm "tài liệu RAG động". Lần sau gặp câu HỎI TƯƠNG TỰ thì trả
-- lời ngay từ kho này, KHÔNG cần gọi AI (tiết kiệm chi phí + nhanh).

ALTER TABLE support_autoreply_settings
    ADD COLUMN IF NOT EXISTS learn_enabled boolean NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS similarity_threshold integer NOT NULL DEFAULT 82
        CHECK (similarity_threshold BETWEEN 50 AND 100);

CREATE TABLE IF NOT EXISTS support_learned_answers (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Câu hỏi gốc (để admin đọc) + bản CHUẨN HÓA (để so khớp) + token đã tách.
    question text NOT NULL,
    question_norm text NOT NULL,
    tokens text[] NOT NULL DEFAULT '{}',
    answer text NOT NULL,
    hits integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- Một câu hỏi chuẩn hóa chỉ giữ MỘT câu trả lời (mới nhất ghi đè).
CREATE UNIQUE INDEX IF NOT EXISTS support_learned_answers_norm_uidx
    ON support_learned_answers (question_norm);
