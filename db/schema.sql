-- Esquema de base de datos para la tienda
-- Ejecutar con: psql -d tienda_web -f db/schema.sql  (o via db:init)

CREATE TABLE IF NOT EXISTS users (
  id                 SERIAL PRIMARY KEY,
  name               VARCHAR(150) NOT NULL,
  email              VARCHAR(150) UNIQUE NOT NULL,
  password_hash      TEXT NOT NULL,
  phone              VARCHAR(30),
  role               VARCHAR(10) NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  terms_accepted_at  TIMESTAMP,  -- evidencia de que aceptó la política de tratamiento de datos al registrarse
  created_at         TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS products (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(200) NOT NULL,
  description TEXT,
  price       NUMERIC(12,2) NOT NULL CHECK (price >= 0),
  stock       INTEGER NOT NULL DEFAULT 0,
  category    VARCHAR(100) NOT NULL DEFAULT 'general',
  tags        VARCHAR(255) DEFAULT '',       -- palabras clave separadas por coma, usadas por el asistente
  image_url   TEXT,
  active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS orders (
  id             SERIAL PRIMARY KEY,
  user_id        INTEGER REFERENCES users(id),
  customer_name  VARCHAR(150) NOT NULL,
  customer_phone VARCHAR(30),
  customer_email VARCHAR(150),
  address        TEXT,
  city           VARCHAR(120),
  region         VARCHAR(120),   -- departamento; el envío se cotiza por WhatsApp y esto es lo que decide la tarifa
  status         VARCHAR(20) NOT NULL DEFAULT 'pendiente'
                 CHECK (status IN ('pendiente','confirmado','en_preparacion','enviado','entregado','cancelado')),
  total          NUMERIC(12,2) NOT NULL DEFAULT 0,
  notes          TEXT,
  whatsapp_sent  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at     TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS order_items (
  id           SERIAL PRIMARY KEY,
  order_id     INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id   INTEGER REFERENCES products(id),
  product_name VARCHAR(200) NOT NULL,
  unit_price   NUMERIC(12,2) NOT NULL,
  quantity     INTEGER NOT NULL CHECK (quantity > 0)
);

-- Configuración simple tipo clave/valor (p.ej. estado de integración WhatsApp)
CREATE TABLE IF NOT EXISTS settings (
  key   VARCHAR(80) PRIMARY KEY,
  value TEXT
);

INSERT INTO settings (key, value) VALUES
  ('whatsapp_enabled', 'false'),
  ('whatsapp_notify_number', ''),
  ('store_name', 'Arborea')
ON CONFLICT (key) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_products_active ON products(active);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
