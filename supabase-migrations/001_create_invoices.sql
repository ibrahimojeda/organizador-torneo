-- Migration: create invoices, invoice_items, payments

CREATE TABLE IF NOT EXISTS invoices (
  id SERIAL PRIMARY KEY,
  code VARCHAR(32) UNIQUE NOT NULL,
  dojo_id UUID REFERENCES dojos(id),
  issued_by VARCHAR(128),
  issued_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  due_at TIMESTAMP WITH TIME ZONE,
  total NUMERIC(10,2) DEFAULT 0,
  status VARCHAR(32) DEFAULT 'pending',
  notes JSONB
);

CREATE TABLE IF NOT EXISTS invoice_items (
  id SERIAL PRIMARY KEY,
  invoice_id INTEGER REFERENCES invoices(id) ON DELETE CASCADE,
  registration_id UUID REFERENCES registrations(id),
  competitor_name VARCHAR(255),
  category_name VARCHAR(255),
  unit_price NUMERIC(10,2) DEFAULT 0,
  qty INTEGER DEFAULT 1,
  total NUMERIC(10,2) DEFAULT 0
);

CREATE TABLE IF NOT EXISTS invoice_payments (
  id SERIAL PRIMARY KEY,
  invoice_id INTEGER REFERENCES invoices(id) ON DELETE CASCADE,
  paid_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  amount NUMERIC(10,2) NOT NULL,
  method VARCHAR(64),
  reference TEXT
);

CREATE INDEX IF NOT EXISTS idx_invoices_code ON invoices(code);
CREATE INDEX IF NOT EXISTS idx_invoices_dojo_id ON invoices(dojo_id);
