-- Reverse migrate_consent_email_2026_11_03.sql

ALTER TABLE personal_consent_events DROP COLUMN email;
