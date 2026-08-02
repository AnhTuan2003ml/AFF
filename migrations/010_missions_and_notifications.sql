BEGIN;

CREATE TABLE mission_definitions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    type text NOT NULL CHECK (type IN ('REFERRAL_MILESTONE', 'PURCHASE_MILESTONE')),
    title text NOT NULL,
    description text NOT NULL DEFAULT '',
    threshold integer NOT NULL CHECK (threshold > 0),
    reward_amount_vnd bigint NOT NULL CHECK (reward_amount_vnd > 0),
    status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
    sort_order integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX mission_definitions_active_idx
  ON mission_definitions (type, status, threshold);

CREATE TABLE user_mission_claims (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES users(id),
    mission_definition_id uuid NOT NULL REFERENCES mission_definitions(id),
    period_key text NOT NULL,
    progress_value integer NOT NULL,
    reward_amount_vnd bigint NOT NULL,
    status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
    approved_by uuid REFERENCES users(id),
    approved_at timestamptz,
    ledger_transaction_id uuid REFERENCES ledger_transactions(id),
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (user_id, mission_definition_id, period_key)
);
CREATE INDEX user_mission_claims_user_idx
  ON user_mission_claims (user_id, created_at DESC);
CREATE INDEX user_mission_claims_status_idx
  ON user_mission_claims (status, created_at DESC);

CREATE TABLE notifications (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES users(id),
    type text NOT NULL,
    title text NOT NULL,
    body text NOT NULL DEFAULT '',
    is_read boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notifications_user_idx
  ON notifications (user_id, created_at DESC);
CREATE INDEX notifications_user_unread_idx
  ON notifications (user_id) WHERE NOT is_read;

COMMIT;
