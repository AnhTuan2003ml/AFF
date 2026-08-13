-- Chat hỗ trợ: mỗi người dùng một hội thoại, ánh xạ 1-1 với một thread Slack
-- (đối soát bằng cặp slack_channel_id + slack_thread_ts).
CREATE TABLE support_conversations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    -- Trống cho tới khi gửi được tin đầu tiên sang Slack (tạo thread gốc).
    slack_channel_id text NOT NULL DEFAULT '',
    slack_thread_ts text NOT NULL DEFAULT '',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX support_conversations_thread_idx
ON support_conversations (slack_channel_id, slack_thread_ts)
WHERE slack_thread_ts <> '';

CREATE TABLE support_chat_messages (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id uuid NOT NULL
        REFERENCES support_conversations(id) ON DELETE CASCADE,
    author_role text NOT NULL CHECK (author_role IN ('USER', 'AGENT')),
    body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 3000),
    -- ts phía Slack (chỉ tin AGENT) — khử trùng lặp khi Slack gửi lại sự kiện.
    slack_ts text,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX support_chat_messages_conversation_idx
ON support_chat_messages (conversation_id, created_at);

CREATE UNIQUE INDEX support_chat_messages_slack_ts_idx
ON support_chat_messages (conversation_id, slack_ts)
WHERE slack_ts IS NOT NULL;
