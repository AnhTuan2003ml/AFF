-- Phản hồi/timeline của ticket hỗ trợ: nhân viên trả lời người dùng và
-- người dùng bổ sung thông tin ngay trong ticket, thay vì chỉ đổi trạng thái.
CREATE TABLE support_ticket_replies (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id uuid NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
    author_id uuid NOT NULL REFERENCES users(id),
    author_role text NOT NULL CHECK (author_role IN ('USER', 'STAFF')),
    body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 3000),
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX support_ticket_replies_ticket_idx
ON support_ticket_replies (ticket_id, created_at);
