-- Migration: Update dates from 2025 to 2026
-- This fixes the date mismatch between the database (2025) and the application code (2026)

-- Update days table: shift all January 2025 dates to January 2026
UPDATE days
SET date = date + INTERVAL '1 year'
WHERE date >= '2025-01-01' AND date <= '2025-12-31';

-- Update trips table: shift dates from 2025 to 2026
UPDATE trips
SET
  start_date = start_date + INTERVAL '1 year',
  end_date = end_date + INTERVAL '1 year',
  name = REPLACE(name, '2025', '2026')
WHERE start_date >= '2025-01-01' AND start_date <= '2025-12-31';

-- Update accommodations table: shift check-in/check-out dates from 2025 to 2026
UPDATE accommodations
SET
  check_in = check_in + INTERVAL '1 year',
  check_out = check_out + INTERVAL '1 year'
WHERE check_in >= '2025-01-01' AND check_in <= '2025-12-31';
