-- Migration 129: Protect manually-set matchday_id on fixtures
-- Prevents sync-fixtures (which maps Forza's null round to null) from wiping
-- manually-assigned matchday_id values (e.g. for international friendlies that
-- lack a round number in the Forza API).
--
-- Rule: once a fixture has a non-null matchday_id, a sync can only overwrite it
-- with another non-null value; an incoming NULL is silently ignored.

CREATE OR REPLACE FUNCTION preserve_manual_matchday_id()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  -- If the existing matchday_id is set and the incoming value is NULL, keep the old one.
  IF OLD.matchday_id IS NOT NULL AND NEW.matchday_id IS NULL THEN
    NEW.matchday_id  := OLD.matchday_id;
    NEW.round_number := OLD.round_number;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_preserve_manual_matchday_id ON fixtures;
CREATE TRIGGER trg_preserve_manual_matchday_id
  BEFORE UPDATE ON fixtures
  FOR EACH ROW EXECUTE FUNCTION preserve_manual_matchday_id();

-- Re-apply matchday assignments for the two-matchday international friendly test
-- (these were previously wiped by the sync-test-623-fixtures cron that ran every 5 min)
UPDATE fixtures SET matchday_id = '623-r7', round_number = 7
WHERE id IN ('f-1220119072', 'f-1220153026', 'f-1219945669');

UPDATE fixtures SET matchday_id = '623-r8', round_number = 8
WHERE id IN ('f-1219956561', 'f-1219539493', 'f-1220119122', 'f-1219956489');
