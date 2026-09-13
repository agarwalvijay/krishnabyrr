-- 027_photo_calibration.sql
-- Per-session colour calibration derived from a grey-card reference frame.
--
-- Rows are append-only: the most recent row is the active calibration, and the
-- history is kept deliberately so a batch of oddly-coloured images can be
-- traced back to the calibration that produced them.

CREATE TABLE IF NOT EXISTS photo_calibrations (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Per-channel white-balance multipliers measured off the grey card.
  gain_r         NUMERIC(6,4) NOT NULL,
  gain_g         NUMERIC(6,4) NOT NULL,
  gain_b         NUMERIC(6,4) NOT NULL,
  -- Exposure correction in stops (positive = brighten).
  exposure_stops NUMERIC(5,3) NOT NULL DEFAULT 0,
  -- What the card actually measured, kept for diagnostics.
  measured_r     NUMERIC(6,2),
  measured_g     NUMERIC(6,2),
  measured_b     NUMERIC(6,2),
  sample_pct     NUMERIC(5,2),          -- % of pixels that qualified as neutral
  reference_path VARCHAR(500),          -- stored grey-card frame
  note           TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_photo_calibrations_created ON photo_calibrations(created_at DESC);
