BEGIN;

ALTER TABLE business_config
  ADD COLUMN enable_auto_cashback_approval boolean NOT NULL DEFAULT false;

COMMIT;
