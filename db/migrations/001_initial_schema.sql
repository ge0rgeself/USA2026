-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- USER table
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  preferences JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- DAY table (core entity - one per date per user)
CREATE TABLE days (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  title TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, date)
);

-- ITEM table (events within a day)
CREATE TABLE items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  day_id UUID NOT NULL REFERENCES days(id) ON DELETE CASCADE,
  prompt TEXT NOT NULL,
  description TEXT NOT NULL,
  time_start TIME,
  time_end TIME,
  type TEXT DEFAULT 'activity',
  status TEXT DEFAULT 'primary',
  sort_order INTEGER DEFAULT 0,
  enrichment JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ACCOMMODATION table
CREATE TABLE accommodations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  address TEXT,
  neighborhood TEXT,
  check_in DATE NOT NULL,
  check_out DATE NOT NULL,
  enrichment JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- TRIP table (lightweight date-range grouping)
CREATE TABLE trips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX idx_days_user_date ON days(user_id, date);
CREATE INDEX idx_items_day ON items(day_id);
CREATE INDEX idx_accommodations_user_dates ON accommodations(user_id, check_in, check_out);
CREATE INDEX idx_trips_user_dates ON trips(user_id, start_date, end_date);
