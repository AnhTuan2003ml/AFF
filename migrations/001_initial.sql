BEGIN;

CREATE TABLE IF NOT EXISTS schema_migrations (
    filename text PRIMARY KEY,
    checksum text NOT NULL,
    applied_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE users (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email text NOT NULL,
    full_name text NOT NULL,
    password_hash text,
    status text NOT NULL DEFAULT 'PENDING_EMAIL'
        CHECK (status IN ('PENDING_EMAIL', 'ACTIVE', 'LOCKED', 'DISABLED')),
    role text NOT NULL DEFAULT 'USER'
        CHECK (role IN ('USER', 'SUPPORT', 'FINANCE', 'RISK', 'ADMIN', 'AUDITOR')),
    email_verified_at timestamptz,
    referral_code text NOT NULL UNIQUE,
    referred_by_user_id uuid REFERENCES users(id),
    password_changed_at timestamptz,
    last_login_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_email_unique_lower ON users (lower(email));

CREATE TABLE auth_identities (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider text NOT NULL,
    provider_subject text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (provider, provider_subject)
);

CREATE TABLE sessions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash text NOT NULL UNIQUE,
    ip_hash text,
    user_agent_hash text,
    last_seen_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL,
    revoked_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sessions_user_active_idx ON sessions (user_id, expires_at) WHERE revoked_at IS NULL;

CREATE TABLE otp_challenges (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email text NOT NULL,
    purpose text NOT NULL,
    code_hash text NOT NULL,
    attempts integer NOT NULL DEFAULT 0,
    max_attempts integer NOT NULL,
    expires_at timestamptz NOT NULL,
    consumed_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX otp_latest_idx ON otp_challenges (lower(email), purpose, created_at DESC);
CREATE INDEX otp_rate_idx ON otp_challenges (lower(email), created_at DESC);

CREATE TABLE user_consents (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    terms_version text NOT NULL,
    privacy_version text NOT NULL,
    ip_hash text,
    accepted_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE user_bank_accounts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    bank_code text NOT NULL,
    account_number_ciphertext text NOT NULL,
    account_name_ciphertext text NOT NULL,
    account_last4 text NOT NULL,
    account_name_masked text NOT NULL,
    status text NOT NULL DEFAULT 'PENDING_REVIEW'
        CHECK (status IN ('PENDING_REVIEW', 'VERIFIED', 'REJECTED', 'DISABLED')),
    verified_by uuid REFERENCES users(id),
    verified_at timestamptz,
    rejection_reason text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX bank_accounts_user_idx ON user_bank_accounts (user_id, created_at DESC);

CREATE TABLE bank_change_requests (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    bank_code text NOT NULL,
    account_number_ciphertext text NOT NULL,
    account_name_ciphertext text NOT NULL,
    account_last4 text NOT NULL,
    account_name_masked text NOT NULL,
    status text NOT NULL DEFAULT 'OTP_PENDING'
        CHECK (status IN ('OTP_PENDING', 'CONFIRMED', 'EXPIRED', 'CANCELLED')),
    expires_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE affiliate_programs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    platform text NOT NULL,
    affiliate_id text NOT NULL,
    status text NOT NULL DEFAULT 'ACTIVE'
        CHECK (status IN ('DRAFT', 'ACTIVE', 'PAUSED', 'DISABLED')),
    cashback_rate_bps integer NOT NULL DEFAULT 7000
        CHECK (cashback_rate_bps BETWEEN 0 AND 10000),
    config jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (platform, affiliate_id)
);

CREATE TABLE affiliate_links (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    program_id uuid REFERENCES affiliate_programs(id),
    platform text NOT NULL,
    click_id text NOT NULL UNIQUE,
    original_url text NOT NULL,
    normalized_url text NOT NULL,
    affiliate_url text NOT NULL,
    sub_id text NOT NULL,
    source text NOT NULL DEFAULT 'web',
    campaign text NOT NULL DEFAULT 'direct',
    status text NOT NULL DEFAULT 'ACTIVE'
        CHECK (status IN ('ACTIVE', 'EXPIRED', 'BLOCKED')),
    click_count bigint NOT NULL DEFAULT 0,
    expires_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX affiliate_links_user_idx ON affiliate_links (user_id, created_at DESC);

CREATE TABLE click_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    affiliate_link_id uuid NOT NULL REFERENCES affiliate_links(id) ON DELETE CASCADE,
    ip_hash text,
    user_agent_hash text,
    referrer_host text,
    bot_flag boolean NOT NULL DEFAULT false,
    occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX click_events_link_time_idx ON click_events (affiliate_link_id, occurred_at DESC);

CREATE TABLE conversion_raw (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    source text NOT NULL,
    event_id text,
    checksum text NOT NULL,
    payload jsonb NOT NULL,
    received_at timestamptz NOT NULL DEFAULT now(),
    processed_at timestamptz,
    processing_error text,
    UNIQUE (source, checksum)
);

CREATE TABLE orders (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES users(id),
    affiliate_link_id uuid REFERENCES affiliate_links(id),
    platform text NOT NULL,
    platform_order_id text NOT NULL,
    status text NOT NULL
        CHECK (status IN ('PENDING', 'APPROVED', 'INVALID', 'CANCELLED', 'REVERSED')),
    order_amount_vnd bigint NOT NULL DEFAULT 0 CHECK (order_amount_vnd >= 0),
    commission_vnd bigint NOT NULL DEFAULT 0 CHECK (commission_vnd >= 0),
    cashback_vnd bigint NOT NULL DEFAULT 0 CHECK (cashback_vnd >= 0),
    purchased_at timestamptz,
    approved_at timestamptz,
    raw_conversion_id uuid REFERENCES conversion_raw(id),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (platform, platform_order_id)
);
CREATE INDEX orders_user_time_idx ON orders (user_id, created_at DESC);
CREATE INDEX orders_status_idx ON orders (status, updated_at DESC);

CREATE TABLE order_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    external_item_key text NOT NULL,
    item_name text NOT NULL,
    quantity integer NOT NULL DEFAULT 1 CHECK (quantity > 0),
    amount_vnd bigint NOT NULL DEFAULT 0 CHECK (amount_vnd >= 0),
    UNIQUE (order_id, external_item_key)
);

CREATE TABLE commission_rules (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    platform text NOT NULL,
    version integer NOT NULL,
    cashback_rate_bps integer NOT NULL CHECK (cashback_rate_bps BETWEEN 0 AND 10000),
    referral_rate_bps integer NOT NULL DEFAULT 0 CHECK (referral_rate_bps BETWEEN 0 AND 10000),
    effective_from timestamptz NOT NULL,
    effective_to timestamptz,
    status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'ACTIVE', 'RETIRED')),
    created_by uuid REFERENCES users(id),
    approved_by uuid REFERENCES users(id),
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (platform, version)
);

CREATE TABLE commission_entries (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id uuid NOT NULL REFERENCES orders(id),
    user_id uuid NOT NULL REFERENCES users(id),
    rule_id uuid REFERENCES commission_rules(id),
    user_amount_vnd bigint NOT NULL CHECK (user_amount_vnd >= 0),
    referral_amount_vnd bigint NOT NULL DEFAULT 0 CHECK (referral_amount_vnd >= 0),
    platform_amount_vnd bigint NOT NULL DEFAULT 0 CHECK (platform_amount_vnd >= 0),
    status text NOT NULL CHECK (status IN ('PENDING', 'AVAILABLE', 'REVERSED')),
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (order_id, user_id)
);

CREATE TABLE ledger_accounts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_type text NOT NULL CHECK (owner_type IN ('USER', 'SYSTEM')),
    owner_id uuid,
    code text NOT NULL,
    currency text NOT NULL DEFAULT 'VND',
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (owner_type, owner_id, code, currency),
    CHECK ((owner_type = 'USER' AND owner_id IS NOT NULL) OR (owner_type = 'SYSTEM' AND owner_id IS NULL))
);
CREATE UNIQUE INDEX ledger_system_accounts_unique
ON ledger_accounts (code, currency)
WHERE owner_type = 'SYSTEM';

CREATE TABLE ledger_transactions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    type text NOT NULL,
    reference_type text NOT NULL,
    reference_id text NOT NULL,
    idempotency_key text NOT NULL UNIQUE,
    description text NOT NULL,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_by uuid REFERENCES users(id),
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE ledger_entries (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_id uuid NOT NULL REFERENCES ledger_transactions(id),
    account_id uuid NOT NULL REFERENCES ledger_accounts(id),
    direction text NOT NULL CHECK (direction IN ('DEBIT', 'CREDIT')),
    amount_vnd bigint NOT NULL CHECK (amount_vnd > 0),
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ledger_entries_account_idx ON ledger_entries (account_id, created_at DESC);

CREATE TABLE withdrawal_intents (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES users(id),
    bank_account_id uuid NOT NULL REFERENCES user_bank_accounts(id),
    amount_vnd bigint NOT NULL CHECK (amount_vnd > 0),
    status text NOT NULL DEFAULT 'OTP_PENDING'
        CHECK (status IN ('OTP_PENDING', 'CONFIRMED', 'EXPIRED', 'CANCELLED')),
    expires_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE withdrawals (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES users(id),
    amount_vnd bigint NOT NULL CHECK (amount_vnd > 0),
    bank_code text NOT NULL,
    bank_account_ciphertext text NOT NULL,
    bank_name_ciphertext text NOT NULL,
    bank_last4 text NOT NULL,
    status text NOT NULL DEFAULT 'REQUESTED'
        CHECK (status IN ('REQUESTED', 'FUNDS_HELD', 'APPROVED', 'PROCESSING', 'PAID', 'FAILED', 'UNKNOWN', 'REJECTED', 'CANCELLED')),
    risk_score integer NOT NULL DEFAULT 0,
    rejection_reason text,
    requested_at timestamptz NOT NULL DEFAULT now(),
    decided_by uuid REFERENCES users(id),
    decided_at timestamptz,
    paid_at timestamptz,
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX withdrawals_user_idx ON withdrawals (user_id, requested_at DESC);
CREATE INDEX withdrawals_queue_idx ON withdrawals (status, requested_at);

CREATE TABLE payout_attempts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    withdrawal_id uuid NOT NULL REFERENCES withdrawals(id),
    provider text NOT NULL,
    request_id text NOT NULL,
    provider_reference text,
    status text NOT NULL,
    response_redacted jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (provider, request_id)
);

CREATE TABLE referrals (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    referrer_user_id uuid NOT NULL REFERENCES users(id),
    referred_user_id uuid NOT NULL UNIQUE REFERENCES users(id),
    status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'ELIGIBLE', 'REWARDED', 'REJECTED')),
    created_at timestamptz NOT NULL DEFAULT now(),
    CHECK (referrer_user_id <> referred_user_id)
);

CREATE TABLE support_tickets (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES users(id),
    type text NOT NULL CHECK (type IN ('MISSING_ORDER', 'WRONG_CASHBACK', 'WITHDRAWAL_DELAY', 'ACCOUNT', 'OTHER')),
    subject text NOT NULL,
    description text NOT NULL,
    related_order_id text,
    status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'WAITING_PARTNER', 'IN_PROGRESS', 'RESOLVED', 'CLOSED')),
    sla_at timestamptz NOT NULL DEFAULT (now() + interval '3 days'),
    assigned_to uuid REFERENCES users(id),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX support_tickets_user_idx ON support_tickets (user_id, created_at DESC);

CREATE TABLE content_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    type text NOT NULL CHECK (type IN ('VOUCHER', 'TRENDING', 'GUIDE', 'ANNOUNCEMENT')),
    title text NOT NULL,
    description text NOT NULL,
    target_url text,
    badge text,
    status text NOT NULL DEFAULT 'PUBLISHED' CHECK (status IN ('DRAFT', 'PUBLISHED', 'ARCHIVED')),
    sort_order integer NOT NULL DEFAULT 0,
    published_at timestamptz NOT NULL DEFAULT now(),
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE audit_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_user_id uuid REFERENCES users(id),
    action text NOT NULL,
    target_type text NOT NULL,
    target_id text,
    reason text,
    before_redacted jsonb,
    after_redacted jsonb,
    request_id text,
    ip_hash text,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_logs_target_idx ON audit_logs (target_type, target_id, created_at DESC);

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER users_set_updated_at BEFORE UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER banks_set_updated_at BEFORE UPDATE ON user_bank_accounts
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER programs_set_updated_at BEFORE UPDATE ON affiliate_programs
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER orders_set_updated_at BEFORE UPDATE ON orders
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER withdrawals_set_updated_at BEFORE UPDATE ON withdrawals
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER tickets_set_updated_at BEFORE UPDATE ON support_tickets
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE FUNCTION create_user_wallet_accounts() RETURNS trigger AS $$
BEGIN
    INSERT INTO ledger_accounts (owner_type, owner_id, code) VALUES
        ('USER', NEW.id, 'PENDING'),
        ('USER', NEW.id, 'AVAILABLE'),
        ('USER', NEW.id, 'HELD'),
        ('USER', NEW.id, 'PAID');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER users_create_wallet AFTER INSERT ON users
FOR EACH ROW EXECUTE FUNCTION create_user_wallet_accounts();

INSERT INTO ledger_accounts (owner_type, owner_id, code) VALUES
    ('SYSTEM', NULL, 'CASHBACK_CLEARING'),
    ('SYSTEM', NULL, 'PAYOUT_SETTLEMENT'),
    ('SYSTEM', NULL, 'ADJUSTMENT')
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION prevent_ledger_mutation() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'Ledger rows are immutable; create a reversal transaction instead';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ledger_entries_immutable
BEFORE UPDATE OR DELETE ON ledger_entries
FOR EACH ROW EXECUTE FUNCTION prevent_ledger_mutation();

CREATE TRIGGER ledger_transactions_immutable
BEFORE UPDATE OR DELETE ON ledger_transactions
FOR EACH ROW EXECUTE FUNCTION prevent_ledger_mutation();

CREATE OR REPLACE FUNCTION ensure_balanced_ledger_transaction() RETURNS trigger AS $$
DECLARE
    target_transaction uuid;
    debit_total bigint;
    credit_total bigint;
BEGIN
    target_transaction := COALESCE(NEW.transaction_id, OLD.transaction_id);
    SELECT
        COALESCE(sum(CASE WHEN direction = 'DEBIT' THEN amount_vnd ELSE 0 END), 0),
        COALESCE(sum(CASE WHEN direction = 'CREDIT' THEN amount_vnd ELSE 0 END), 0)
    INTO debit_total, credit_total
    FROM ledger_entries
    WHERE transaction_id = target_transaction;

    IF debit_total = 0 OR debit_total <> credit_total THEN
        RAISE EXCEPTION 'Unbalanced ledger transaction %: debit %, credit %',
            target_transaction, debit_total, credit_total;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER ledger_transaction_must_balance
AFTER INSERT OR UPDATE OR DELETE ON ledger_entries
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION ensure_balanced_ledger_transaction();

COMMIT;
