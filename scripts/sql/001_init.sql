-- Kerem cooperative — full schema (Firestore → Neon)
-- IDs stay as text so existing Firebase UIDs and document ids keep working.

CREATE TABLE IF NOT EXISTS gemachim (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT,
  pricing_mode TEXT NOT NULL DEFAULT 'loan_fee',
  maintenance_fee NUMERIC(12, 2),
  paybox_group_url TEXT,
  is_platform BOOLEAN NOT NULL DEFAULT FALSE,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  reservation_mode TEXT,
  default_loan_hours INTEGER,
  max_loan_hours INTEGER,
  closed_at TIMESTAMPTZ,
  cooperative_fee NUMERIC(12, 2),
  location TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS members (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  first_name TEXT,
  family_name TEXT,
  name_completed BOOLEAN NOT NULL DEFAULT FALSE,
  email TEXT NOT NULL DEFAULT '',
  phone TEXT,
  is_a_member BOOLEAN NOT NULL DEFAULT FALSE,
  first_payout BOOLEAN NOT NULL DEFAULT TRUE,
  terms_accepted_at TIMESTAMPTZ,
  membership_offer_dismissed_at TIMESTAMPTZ,
  has_payment_method BOOLEAN NOT NULL DEFAULT FALSE,
  role TEXT NOT NULL DEFAULT 'MEMBER',
  gemach_admin_ids TEXT[] NOT NULL DEFAULT '{}',
  credit_balance NUMERIC(12, 2) NOT NULL DEFAULT 0,
  photo_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS members_email_idx ON members (lower(email));
CREATE INDEX IF NOT EXISTS members_phone_idx ON members (phone);

CREATE TABLE IF NOT EXISTS tools (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT '',
  qr_code TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'available',
  loan_fee_min NUMERIC(12, 2) NOT NULL DEFAULT 0,
  loan_fee_max NUMERIC(12, 2) NOT NULL DEFAULT 0,
  safety_rules JSONB NOT NULL DEFAULT '[]',
  included_items JSONB,
  image_url TEXT,
  admin_notes TEXT,
  gemach_id TEXT NOT NULL REFERENCES gemachim (id),
  kind_id TEXT NOT NULL,
  unit_label TEXT,
  default_loan_hours INTEGER,
  max_loan_hours INTEGER,
  location TEXT,
  brand TEXT,
  supplier TEXT,
  purpose TEXT,
  product_age NUMERIC(8, 2),
  youtube_url TEXT,
  image_urls TEXT[],
  return_instructions JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS tools_kind_id_idx ON tools (kind_id);
CREATE INDEX IF NOT EXISTS tools_gemach_id_idx ON tools (gemach_id);
CREATE INDEX IF NOT EXISTS tools_status_idx ON tools (status);
CREATE UNIQUE INDEX IF NOT EXISTS tools_qr_code_idx ON tools (qr_code);

CREATE TABLE IF NOT EXISTS device_pots (
  id TEXT PRIMARY KEY,
  tool_id TEXT NOT NULL,
  balance NUMERIC(12, 2) NOT NULL DEFAULT 0,
  total_earned NUMERIC(12, 2) NOT NULL DEFAULT 0,
  total_spent NUMERIC(12, 2) NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS operations_pot (
  id TEXT PRIMARY KEY DEFAULT 'main',
  balance NUMERIC(12, 2) NOT NULL DEFAULT 0,
  total_earned NUMERIC(12, 2) NOT NULL DEFAULT 0,
  total_spent NUMERIC(12, 2) NOT NULL DEFAULT 0
);

INSERT INTO operations_pot (id) VALUES ('main') ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS reservations (
  id TEXT PRIMARY KEY,
  member_id TEXT NOT NULL,
  tool_id TEXT NOT NULL,
  pickup_date TEXT NOT NULL,
  pickup_time_start TEXT,
  pickup_time_end TEXT,
  return_date TEXT NOT NULL,
  return_time_start TEXT,
  return_time_end TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  fee_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  loan_duration_hours INTEGER,
  kind_id TEXT,
  quantity INTEGER,
  tool_ids TEXT[],
  group_id TEXT,
  cooperative_fee_amount NUMERIC(12, 2),
  cancel_reason TEXT,
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS reservations_member_id_idx ON reservations (member_id);
CREATE INDEX IF NOT EXISTS reservations_status_idx ON reservations (status);
CREATE INDEX IF NOT EXISTS reservations_tool_id_idx ON reservations (tool_id);
CREATE INDEX IF NOT EXISTS reservations_kind_id_idx ON reservations (kind_id);

CREATE TABLE IF NOT EXISTS loans (
  id TEXT PRIMARY KEY,
  reservation_id TEXT NOT NULL,
  member_id TEXT NOT NULL,
  tool_id TEXT NOT NULL,
  tool_ids TEXT[],
  quantity INTEGER,
  status TEXT NOT NULL,
  safety_acknowledged BOOLEAN NOT NULL DEFAULT FALSE,
  checkout_photo_url TEXT,
  return_photo_url TEXT,
  checkout_condition_notes TEXT,
  return_condition_notes TEXT,
  checkout_items_checked TEXT[],
  return_items_checked TEXT[],
  additional_photo_urls TEXT[],
  checked_out_at TIMESTAMPTZ,
  due_return_date TEXT,
  due_return_time_end TEXT,
  returned_at TIMESTAMPTZ,
  group_id TEXT,
  checkout_defect JSONB,
  return_defect JSONB,
  return_ok BOOLEAN,
  dispute_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS loans_member_id_idx ON loans (member_id);
CREATE INDEX IF NOT EXISTS loans_status_idx ON loans (status);
CREATE INDEX IF NOT EXISTS loans_tool_id_idx ON loans (tool_id);
CREATE INDEX IF NOT EXISTS loans_reservation_id_idx ON loans (reservation_id);

CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  reservation_id TEXT NOT NULL,
  member_id TEXT NOT NULL,
  tool_id TEXT NOT NULL,
  amount NUMERIC(12, 2) NOT NULL,
  status TEXT NOT NULL,
  provider TEXT NOT NULL,
  paybox_group_url TEXT NOT NULL DEFAULT '',
  grow_payment_url TEXT,
  credit_applied NUMERIC(12, 2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  paid_at TIMESTAMPTZ,
  refunded_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS payments_reservation_id_idx ON payments (reservation_id);
CREATE INDEX IF NOT EXISTS payments_member_id_idx ON payments (member_id);
CREATE INDEX IF NOT EXISTS payments_status_idx ON payments (status);

CREATE TABLE IF NOT EXISTS credit_ledger (
  id TEXT PRIMARY KEY,
  member_id TEXT NOT NULL,
  delta NUMERIC(12, 2) NOT NULL,
  balance_after NUMERIC(12, 2) NOT NULL,
  reason TEXT NOT NULL,
  note TEXT,
  reservation_id TEXT,
  peer_loan_id TEXT,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS credit_ledger_member_id_idx ON credit_ledger (member_id);

CREATE TABLE IF NOT EXISTS credit_loans (
  id TEXT PRIMARY KEY,
  lender_id TEXT NOT NULL,
  lender_name TEXT NOT NULL DEFAULT '',
  borrower_id TEXT NOT NULL,
  borrower_name TEXT NOT NULL DEFAULT '',
  principal NUMERIC(12, 2) NOT NULL,
  outstanding NUMERIC(12, 2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  settled_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS credit_loans_borrower_idx ON credit_loans (borrower_id, status);
CREATE INDEX IF NOT EXISTS credit_loans_lender_idx ON credit_loans (lender_id, status);

CREATE TABLE IF NOT EXISTS paybox_payment_imports (
  id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS late_return_fees (
  id TEXT PRIMARY KEY,
  loan_id TEXT NOT NULL,
  reservation_id TEXT NOT NULL,
  member_id TEXT NOT NULL,
  tool_id TEXT NOT NULL,
  gemach_id TEXT NOT NULL,
  due_at TIMESTAMPTZ NOT NULL,
  returned_at TIMESTAMPTZ NOT NULL,
  late_minutes INTEGER NOT NULL DEFAULT 0,
  amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  paid BOOLEAN NOT NULL DEFAULT FALSE,
  paid_at TIMESTAMPTZ,
  marked_paid_by TEXT,
  cancelled BOOLEAN NOT NULL DEFAULT FALSE,
  cancelled_at TIMESTAMPTZ,
  cancelled_by TEXT,
  cancel_reason TEXT,
  amount_updated_at TIMESTAMPTZ,
  amount_updated_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS late_return_fees_paid_idx ON late_return_fees (paid, cancelled);
CREATE INDEX IF NOT EXISTS late_return_fees_gemach_idx ON late_return_fees (gemach_id);

CREATE TABLE IF NOT EXISTS maintenance_tickets (
  id TEXT PRIMARY KEY,
  tool_id TEXT NOT NULL,
  loan_id TEXT,
  member_id TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open',
  admin_reply TEXT,
  resolved_at TIMESTAMPTZ,
  resolved_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS maintenance_tickets_status_idx ON maintenance_tickets (status);

CREATE TABLE IF NOT EXISTS disputes (
  id TEXT PRIMARY KEY,
  loan_id TEXT NOT NULL,
  tool_id TEXT NOT NULL,
  member_id TEXT NOT NULL,
  gemach_id TEXT NOT NULL,
  status TEXT NOT NULL,
  defect JSONB NOT NULL,
  damage_amount NUMERIC(12, 2),
  mediator_ids TEXT[] NOT NULL DEFAULT '{}',
  mediator_decisions JSONB,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,
  member_id TEXT NOT NULL,
  tool_id TEXT NOT NULL,
  loan_id TEXT NOT NULL,
  amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  operations_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  device_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS paybox_payouts (
  id TEXT PRIMARY KEY,
  pot_target TEXT NOT NULL,
  tool_id TEXT,
  amount NUMERIC(12, 2) NOT NULL,
  group_url TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL,
  note TEXT,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS settings (
  id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'
);
