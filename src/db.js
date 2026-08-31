require('dotenv').config();
const { Pool } = require('pg');

// En serverless (Vercel) cada instancia de la función abre su propio pool, así
// que lo mantenemos pequeño para no agotar las conexiones de Postgres cuando
// hay varias invocaciones concurrentes. Para escalar de verdad en producción,
// usa la connection string "pooled" (pgbouncer) que ofrecen Neon/Supabase/Railway.
// TLS hacia la base de datos, con el certificado verificado de verdad.
//
// Antes esto iba con `rejectUnauthorized: false`, que cifra pero acepta
// cualquier certificado: es decir, no distingue el servidor real de quien se
// interponga en la ruta. Por ahí pasan las contraseñas de los clientes, sus
// direcciones y todos los pedidos, así que el certificado se valida.
//
// Neon, Supabase, Railway y Vercel Postgres entregan certificados de una
// autoridad pública y funcionan tal cual. Si algún proveedor usara una
// autoridad propia, se le pasa el certificado por `DATABASE_CA_CERT` en vez de
// desactivar la verificación.
function sslOptions() {
  if (process.env.NODE_ENV !== 'production') return false;
  const ca = (process.env.DATABASE_CA_CERT || '').trim();
  return ca ? { rejectUnauthorized: true, ca } : { rejectUnauthorized: true };
}

const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: sslOptions(),
      max: process.env.NODE_ENV === 'production' ? 5 : 10
    })
  : new Pool({
      host: process.env.PGHOST,
      port: process.env.PGPORT,
      user: process.env.PGUSER,
      password: process.env.PGPASSWORD,
      database: process.env.PGDATABASE
    });

module.exports = { pool };
