-- Không cho phép mốc cao hơn có phần thưởng thấp hơn mốc trước.
CREATE UNIQUE INDEX IF NOT EXISTS mission_definitions_type_threshold_unique
  ON mission_definitions (type, threshold);

CREATE OR REPLACE FUNCTION enforce_mission_reward_progression()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM mission_definitions
    WHERE type = NEW.type
      AND id <> NEW.id
      AND threshold < NEW.threshold
      AND reward_amount_vnd > NEW.reward_amount_vnd
  ) THEN
    RAISE EXCEPTION
      'Phần thưởng mốc mới không được thấp hơn phần thưởng của mốc trước.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM mission_definitions
    WHERE type = NEW.type
      AND id <> NEW.id
      AND threshold > NEW.threshold
      AND reward_amount_vnd < NEW.reward_amount_vnd
  ) THEN
    RAISE EXCEPTION
      'Phần thưởng mốc mới không được cao hơn phần thưởng của mốc sau.';
  END IF;

  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS mission_reward_progression_guard
  ON mission_definitions;

CREATE TRIGGER mission_reward_progression_guard
BEFORE INSERT OR UPDATE OF type, threshold, reward_amount_vnd
ON mission_definitions
FOR EACH ROW
EXECUTE FUNCTION enforce_mission_reward_progression();
