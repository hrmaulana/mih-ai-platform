-- News-only OpenRouter ledger. Apply through the normal migration process.
-- No production migration is run by the adapter. Budget month: Asia/Jakarta.
-- No automatic expiration/refund: an interrupted request may have been billed.
-- Unresolved/overrun rows require operator cost reconciliation before new calls.
BEGIN;

CREATE TABLE news_budget_months (
  month date PRIMARY KEY CHECK (EXTRACT(DAY FROM month) = 1),
  charged_idr numeric NOT NULL DEFAULT 0 CHECK (charged_idr >= 0),
  reserved_idr numeric NOT NULL DEFAULT 0 CHECK (reserved_idr >= 0)
);
CREATE TABLE news_budget_calls (
  id uuid PRIMARY KEY,
  month date NOT NULL REFERENCES news_budget_months(month),
  requested_model text NOT NULL,
  actual_model text,
  usd_idr_rate numeric NOT NULL CHECK (usd_idr_rate > 0),
  reservation_usd numeric NOT NULL CHECK (reservation_usd > 0),
  held_idr numeric NOT NULL CHECK (held_idr >= 0),
  actual_usd numeric CHECK (actual_usd >= 0),
  actual_idr numeric CHECK (actual_idr >= 0),
  unresolved_usd numeric NOT NULL DEFAULT 0 CHECK (unresolved_usd >= 0),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 3),
  state text NOT NULL DEFAULT 'reserved' CHECK (state IN ('reserved', 'settled', 'unresolved', 'overrun')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  settled_at timestamptz
);
CREATE INDEX news_budget_calls_state_month ON news_budget_calls(state, month);

-- One SQL statement / transaction from any pg Pool connection. The global
-- transaction lock also prevents settlement/reservation and month rollover races.
CREATE FUNCTION news_budget_reserve(p_id uuid, p_usd numeric, p_fx numeric, p_model text)
RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE
  m date := date_trunc('month', clock_timestamp() AT TIME ZONE 'Asia/Jakarta')::date;
  hold numeric;
  used numeric;
BEGIN
  IF p_id IS NULL OR p_usd IS NULL OR p_fx IS NULL OR p_usd <= 0 OR p_fx <= 0
     OR p_usd::text IN ('NaN', 'Infinity', '-Infinity')
     OR p_fx::text IN ('NaN', 'Infinity', '-Infinity')
     OR p_fx > 1000000 OR p_model IS NULL OR length(trim(p_model)) = 0 THEN
    RETURN false;
  END IF;
  PERFORM pg_advisory_xact_lock(250000, 5);
  IF EXISTS (SELECT 1 FROM news_budget_calls WHERE state IN ('unresolved', 'overrun')
      OR (state = 'reserved' AND month < m))
      OR EXISTS (SELECT 1 FROM news_budget_calls WHERE id = p_id) THEN
    RETURN false;
  END IF;
  INSERT INTO news_budget_months(month) VALUES (m) ON CONFLICT (month) DO NOTHING;
  SELECT charged_idr + reserved_idr INTO used FROM news_budget_months WHERE month = m FOR UPDATE;
  -- Always round UP to sen rupiah. No PostgreSQL numeric->JS conversion needed.
  hold := ceil(p_usd * p_fx * 100) / 100;
  IF used + hold > 250000 THEN RETURN false; END IF;
  INSERT INTO news_budget_calls(id, month, requested_model, usd_idr_rate, reservation_usd, held_idr)
    VALUES (p_id, m, p_model, p_fx, p_usd, hold);
  UPDATE news_budget_months SET reserved_idr = reserved_idr + hold WHERE month = m;
  RETURN true;
END;
$$;

-- Known USD is the sum of response usage.cost for ALL attempts (including errors).
-- Unknown attempted calls retain their reserve. Only unattempted retries are freed.
-- Failed settlement rolls back atomically, leaving the original full hold in place.
CREATE FUNCTION news_budget_finish(p_id uuid, p_actual numeric, p_unknown numeric,
  p_attempts integer, p_model text, p_overrun boolean)
RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE
  r news_budget_calls%ROWTYPE;
  charged numeric;
  held numeric;
  next_state text;
BEGIN
  IF p_actual IS NULL OR p_unknown IS NULL OR p_actual < 0 OR p_unknown < 0
     OR p_actual::text IN ('NaN', 'Infinity', '-Infinity')
     OR p_unknown::text IN ('NaN', 'Infinity', '-Infinity')
     OR p_attempts IS NULL OR p_attempts NOT BETWEEN 1 AND 3 OR p_overrun IS NULL THEN
    RETURN false;
  END IF;
  PERFORM pg_advisory_xact_lock(250000, 5);
  SELECT * INTO r FROM news_budget_calls WHERE id = p_id FOR UPDATE;
  IF NOT FOUND OR r.state <> 'reserved' THEN RETURN false; END IF;
  charged := ceil(p_actual * r.usd_idr_rate * 100) / 100;
  held := ceil(p_unknown * r.usd_idr_rate * 100) / 100;
  next_state := CASE WHEN p_overrun OR p_actual + p_unknown > r.reservation_usd THEN 'overrun'
    WHEN p_unknown > 0 THEN 'unresolved' ELSE 'settled' END;
  UPDATE news_budget_months SET charged_idr = charged_idr + charged,
    reserved_idr = reserved_idr - r.held_idr + held WHERE month = r.month;
  UPDATE news_budget_calls SET actual_usd = p_actual, actual_idr = charged,
    unresolved_usd = p_unknown, held_idr = held, attempts = p_attempts,
    actual_model = p_model, state = next_state, settled_at = clock_timestamp() WHERE id = p_id;
  RETURN true;
END;
$$;
COMMIT;
