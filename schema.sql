CREATE TABLE IF NOT EXISTS categories (
  id          UUID         DEFAULT gen_random_uuid() PRIMARY KEY,
  name        VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,
  created_at  TIMESTAMPTZ  DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS products (
  id            UUID           DEFAULT gen_random_uuid() PRIMARY KEY,
  name          VARCHAR(200)   NOT NULL,
  category_id   UUID           REFERENCES categories(id) ON DELETE SET NULL,
  quantity      INTEGER        NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  unit          VARCHAR(50)    DEFAULT 'pcs',
  unit_price    DECIMAL(10, 2) DEFAULT 0.00 CHECK (unit_price >= 0),
  reorder_level INTEGER        DEFAULT 10 CHECK (reorder_level >= 0),
  supplier      VARCHAR(200),
  created_at    TIMESTAMPTZ    DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS transactions (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id  UUID        NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  type        VARCHAR(10) NOT NULL CHECK (type IN ('RECEIVE', 'ISSUE')),
  quantity    INTEGER     NOT NULL CHECK (quantity > 0),
  remarks     TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE categories   DISABLE ROW LEVEL SECURITY;
ALTER TABLE products     DISABLE ROW LEVEL SECURITY;
ALTER TABLE transactions DISABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_products_category    ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_quantity    ON products(quantity);
CREATE INDEX IF NOT EXISTS idx_transactions_product ON transactions(product_id);
CREATE INDEX IF NOT EXISTS idx_transactions_type    ON transactions(type);
CREATE INDEX IF NOT EXISTS idx_transactions_date    ON transactions(created_at DESC);

INSERT INTO categories (name, description) VALUES
  ('Electronics',     'Electronic devices, components, and accessories'),
  ('Office Supplies', 'Stationery, paper, and office materials'),
  ('Raw Materials',   'Manufacturing inputs and bulk raw materials'),
  ('Finished Goods',  'Ready-to-sell packaged products'),
  ('Spare Parts',     'Mechanical and replacement parts')
ON CONFLICT (name) DO NOTHING;
