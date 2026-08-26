// Entrypoint solo para desarrollo local / hosting tradicional (no Vercel).
// En Vercel, api/index.js exporta directamente src/app.js como función serverless.
// dotenv debe cargarse ANTES de requerir ./db: ese módulo crea el Pool leyendo
// process.env en el momento del require, y ./db se cachea con esos valores.
require('dotenv').config();
const { pool } = require('./db');
const app = require('./app');

const PORT = process.env.PORT || 3000;

pool
  .query('SELECT 1')
  .then(() => {
    app.listen(PORT, () => console.log(`✔ Servidor corriendo en http://localhost:${PORT}`));
  })
  .catch((err) => {
    console.error('✘ No se pudo conectar a PostgreSQL. Revisa tu .env y que la base exista.');
    console.error(err.message);
    process.exit(1);
  });
