require('dotenv').config();
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { pool } = require('../src/db');

async function run() {
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  console.log('→ Creando tablas...');
  await pool.query(schema);

  const adminEmail = process.env.ADMIN_EMAIL || 'admin@arborea.com';
  const adminPassword = process.env.ADMIN_PASSWORD || 'CambiaEstaClave123!';

  const existing = await pool.query('SELECT id FROM users WHERE email = $1', [adminEmail]);
  if (existing.rows.length === 0) {
    const hash = await bcrypt.hash(adminPassword, 10);
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
