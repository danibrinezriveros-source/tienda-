require('dotenv').config();
const { Pool } = require('pg');

// En serverless (Vercel) cada instancia de la función abre su propio pool, así
// que lo mantenemos pequeño para no agotar las conexiones de Postgres cuando
// hay varias invocaciones concurrentes. Para escalar de verdad en producción,
// usa la connection string "pooled" (pgbouncer) que ofrecen Neon/Supabase/Railway.
const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
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
