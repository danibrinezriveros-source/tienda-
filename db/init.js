require('dotenv').config();
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { pool } = require('../src/db');

// `--solo-esquema` deja el script en lo único que es seguro correr contra una
// base que ya tiene clientes: crear las tablas y columnas que falten. Ni siembra
// el catálogo de ejemplo ni crea la cuenta de administrador.
//
// Existe por lo que pasa si no está. Este archivo empezó siendo el arranque de
// una tienda vacía, donde ocho plantas de muestra y un admin recién creado son
// exactamente lo que se quiere. Pero es también el que aplica las migraciones,
// y ahí el mismo comportamiento es un accidente esperando: apuntarlo a
// producción para añadir una columna e insertarle de paso un catálogo inventado
// que un cliente puede ver y hasta pedir.
//
// Todo lo que hace en este modo es idempotente —`IF NOT EXISTS` de principio a
// fin—, así que correrlo dos veces no cambia nada.
const SOLO_ESQUEMA = process.argv.slice(2).includes('--solo-esquema');

async function run() {
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  console.log('→ Creando tablas...');
  await pool.query(schema);

  // Migración liviana para bases que ya existían antes de esta columna.
  await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMP');
  await pool.query('ALTER TABLE orders ADD COLUMN IF NOT EXISTS city VARCHAR(120)');
  await pool.query('ALTER TABLE orders ADD COLUMN IF NOT EXISTS region VARCHAR(120)');

  // Segundo factor del panel. El secreto TOTP se guarda cifrado con
  // TOTP_ENCRYPTION_KEY (ver src/utils/totp.js): a diferencia de una
  // contraseña, aquí el servidor necesita el valor original para calcular el
  // código, así que no puede ser un hash.
  await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_secret TEXT');
  await pool.query(
    'ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_enabled BOOLEAN NOT NULL DEFAULT FALSE'
  );
  // Códigos de recuperación, como hashes separados por coma. Son aleatorios y
  // largos, así que sha256 basta: no hay diccionario que probar contra ellos.
  await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_recovery TEXT');

  if (SOLO_ESQUEMA) {
    const { rows } = await pool.query(
      `SELECT
         (SELECT COUNT(*) FROM information_schema.tables
           WHERE table_schema = 'public')::int AS tablas,
         (SELECT COUNT(*) FROM products)::int   AS productos,
         (SELECT COUNT(*) FROM users)::int      AS usuarios`
    );
    console.log('✔ Esquema al día. No se tocó ningún dato.');
    console.log(
      `  ${rows[0].tablas} tablas · ${rows[0].productos} productos · ${rows[0].usuarios} usuarios`
    );
    console.log('  (sin --solo-esquema se crearía la cuenta admin y, si el catálogo');
    console.log('   estuviera vacío, el catálogo de ejemplo)');
    await pool.end();
    return;
  }

  const adminEmail = process.env.ADMIN_EMAIL || 'admin@arborea.com';
  const adminPassword = process.env.ADMIN_PASSWORD || '';

  const MIN_ADMIN_PASSWORD = 12;
  const existing = await pool.query('SELECT id FROM users WHERE email = $1', [adminEmail]);

  // La contraseña de ejemplo que había aquí ('CambiaEstaClave123!') estaba en
  // el repositorio, es decir, era pública. Bastaba con conocer el proyecto para
  // entrar al panel de cualquier despliegue donde nadie la hubiera cambiado —y
  // nadie cambia lo que ya funciona. Ahora no hay valor por defecto.
  //
  // La exigencia solo aplica al crear la cuenta: si ya existe, este script se
  // usa para migrar el esquema y no tiene por qué pedir credenciales.
  if (existing.rows.length === 0 && adminPassword.length < MIN_ADMIN_PASSWORD) {
    console.error(
      `\n✖ ADMIN_PASSWORD no está definida o tiene menos de ${MIN_ADMIN_PASSWORD} caracteres.\n` +
        '  Ponla en el archivo .env antes de crear la cuenta de administrador.\n' +
        '  Sugerencia: node -e "console.log(require(\'crypto\').randomBytes(18).toString(\'base64url\'))"\n'
    );
    await pool.end();
    process.exit(1);
  }

  if (existing.rows.length === 0) {
    const hash = await bcrypt.hash(adminPassword, 12);
    await pool.query(
      `INSERT INTO users (name, email, password_hash, role) VALUES ($1,$2,$3,'admin')`,
      ['Administrador', adminEmail, hash]
    );
    console.log(`→ Cuenta admin creada: ${adminEmail} / (la contraseña que pusiste en .env)`);
  } else {
    console.log('→ La cuenta admin ya existía, no se modificó.');
  }

  const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM products');
  if (rows[0].n === 0) {
    console.log('→ Insertando catálogo de ejemplo...');
    // image_url queda vacío a propósito: agrega las fotos reales de cada planta desde
    // Admin → Catálogo → Editar producto.
    const sample = [
      ['Zamioculca', 'Hojas gruesas y brillantes, tolera semanas sin riego y casi cualquier rincón de la casa.', 22.00, 18, 'interior', 'principiante,poca-luz,pet-friendly', ''],
      ['Potos dorado', 'De crecimiento rápido y muy flexible con la luz; perfecta para colgar o trepar.', 14.00, 30, 'interior', 'principiante,poca-luz', ''],
      ['Sansevieria (lengua de suegra)', 'Casi indestructible: poca agua, poca luz y aun así luce impecable.', 18.00, 24, 'interior', 'principiante,poca-luz,exterior', ''],
      ['Suculenta Echeveria', 'Rosetas compactas que necesitan mucho sol directo y riego mínimo.', 8.50, 45, 'suculentas', 'principiante,exterior', ''],
      ['Areca', 'Palmera de interior que aporta volumen verde y es segura si hay mascotas en casa.', 35.00, 10, 'interior', 'pet-friendly,poca-luz', ''],
      ['Lavanda en maceta', 'Aromática de exterior, necesita sol pleno y riego moderado; atrae polinizadores.', 12.00, 20, 'exterior', 'exterior,principiante', ''],
      ['Maceta de barro 20cm', 'Maceta de barro cocido con drenaje, ideal para plantas de exterior.', 9.00, 50, 'macetas y accesorios', 'accesorio,economico', ''],
      ['Sustrato universal 5L', 'Mezcla balanceada para trasplantar la mayoría de plantas de interior.', 6.50, 60, 'macetas y accesorios', 'accesorio,economico', '']
    ];
    for (const p of sample) {
      await pool.query(
        `INSERT INTO products (name, description, price, stock, category, tags, image_url)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        p
      );
    }
  }

  console.log('✔ Base de datos lista.');
  await pool.end();
}

run().catch((err) => {
  console.error('Error inicializando la base de datos:', err);
  process.exit(1);
});
