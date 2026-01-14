-- EXPENSES table for tracking shared trip costs
CREATE TABLE expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  payer TEXT NOT NULL,  -- 'george' or 'val'
  category TEXT DEFAULT 'other',  -- food, transport, activity, accommodation, other
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for efficient user-based queries
CREATE INDEX idx_expenses_user_date ON expenses(user_id, date DESC);
