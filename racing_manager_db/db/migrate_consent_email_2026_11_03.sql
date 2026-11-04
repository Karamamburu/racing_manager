-- Add optional email snapshot on personal consent events (registration path fills it).
-- Nullable so existing rows and non-registration events are not blocked; no backfill.

ALTER TABLE personal_consent_events ADD COLUMN email TEXT;
