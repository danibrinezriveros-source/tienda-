const express = require('express');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const { parse } = require('csv-parse/sync');
const router = express.Router();
const { pool } = require('../db');
const { requireAdmin } = require('../middleware/auth');
const { isTwilioConfigured } = require('../config/whatsapp');
const { uploadProductImage } = require('../config/storage');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } });
const uploadImage = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) return cb(new Error('El archivo debe ser una imagen.'));
    cb(null, true);
  }
});

// --- Ingreso de administrador ---
router.get('/ingresar', (req, res) => {
  res.render('admin/login', { error: null });
});

router.post('/ingresar', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const { rows } = await pool.query('SELECT * FROM users WHERE email = $1 AND role = $2', [
      email,
      'admin'
    ]);
    const admin = rows[0];
    if (!admin || !(await bcrypt.compare(password, admin.password_hash))) {
      return res.render('admin/login', { error: 'Credenciales incorrectas.' });
    }
    req.session.user = { id: admin.id, name: admin.name, email: admin.email, role: admin.role };
    res.redirect('/admin');
  } catch (err) {
    next(err);
  }
});

router.use(requireAdmin);

// --- Dashboard ---
router.get('/', async (req, res, next) => {
  try {
    const { rows: stats } = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM products WHERE active = TRUE)::int AS total_products,
        (SELECT COUNT(*) FROM orders WHERE status = 'pendiente')::int AS incoming,
        (SELECT COUNT(*) FROM orders WHERE status IN ('confirmado','en_preparacion','enviado'))::int AS outgoing,
        (SELECT COALESCE(SUM(total),0) FROM orders WHERE status <> 'cancelado')::numeric AS revenue
    `);
    const { rows: recentOrders } = await pool.query(
      'SELECT * FROM orders ORDER BY created_at DESC LIMIT 6'
    );
    res.render('admin/dashboard', { stats: stats[0], recentOrders });
  } catch (err) {
    next(err);
  }
});

// --- Catálogo ---
router.get('/productos', async (req, res, next) => {
  try {
    const { rows: products } = await pool.query('SELECT * FROM products ORDER BY created_at DESC');
    res.render('admin/products', { products, error: null, ok: req.query.ok || null });
  } catch (err) {
    next(err);
  }
});

router.get('/productos/nuevo', (req, res) => {
  res.render('admin/product-form', { product: null, error: null });
});

router.post('/productos/nuevo', uploadImage.single('image'), async (req, res, next) => {
  try {
    const { name, description, price, stock, category, tags, image_url } = req.body;
    const finalImageUrl = req.file
      ? await uploadProductImage(req.file.buffer, req.file.originalname, req.file.mimetype)
      : image_url || null;
    await pool.query(
      `INSERT INTO products (name, description, price, stock, category, tags, image_url)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [name, description, price, stock || 0, category || 'general', tags || '', finalImageUrl]
    );
    res.redirect('/admin/productos?ok=creado');
  } catch (err) {
    next(err);
  }
});

router.get('/productos/:id/editar', async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT * FROM products WHERE id = $1', [req.params.id]);
    if (!rows[0]) return res.status(404).render('404');
    res.render('admin/product-form', { product: rows[0], error: null });
  } catch (err) {
    next(err);
  }
});

router.post('/productos/:id/editar', uploadImage.single('image'), async (req, res, next) => {
  try {
    const { name, description, price, stock, category, tags, image_url, active } = req.body;
    const finalImageUrl = req.file
      ? await uploadProductImage(req.file.buffer, req.file.originalname, req.file.mimetype)
      : image_url || null;
    await pool.query(
      `UPDATE products SET name=$1, description=$2, price=$3, stock=$4, category=$5,
       tags=$6, image_url=$7, active=$8, updated_at=NOW() WHERE id=$9`,
      [name, description, price, stock || 0, category, tags || '', finalImageUrl, active === 'on', req.params.id]
    );
    res.redirect('/admin/productos?ok=actualizado');
  } catch (err) {
    next(err);
  }
});

router.post('/productos/:id/eliminar', async (req, res, next) => {
  try {
    await pool.query('DELETE FROM products WHERE id = $1', [req.params.id]);
    res.redirect('/admin/productos?ok=eliminado');
  } catch (err) {
    next(err);
  }
});

// --- Carga masiva de catálogo por CSV ---
// Columnas esperadas: name,description,price,stock,category,tags,image_url
router.post('/productos/importar', upload.single('csv'), async (req, res, next) => {
  try {
    if (!req.file) return res.redirect('/admin/productos?ok=sin_archivo');
    const records = parse(req.file.buffer, { columns: true, skip_empty_lines: true, trim: true });

    for (const r of records) {
      await pool.query(
        `INSERT INTO products (name, description, price, stock, category, tags, image_url)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [
          r.name,
          r.description || '',
          parseFloat(r.price) || 0,
          parseInt(r.stock, 10) || 0,
          r.category || 'general',
          r.tags || '',
          r.image_url || null
        ]
      );
    }
    res.redirect(`/admin/productos?ok=importados_${records.length}`);
  } catch (err) {
    next(err);
  }
});

// --- Pedidos: entrantes (pendientes) y salientes (confirmados en adelante) ---
router.get('/pedidos', async (req, res, next) => {
  try {
    const view = req.query.vista === 'salientes' ? 'salientes' : 'entrantes';
    const statuses =
      view === 'entrantes' ? ['pendiente'] : ['confirmado', 'en_preparacion', 'enviado', 'entregado', 'cancelado'];

    const { rows: orders } = await pool.query(
      `SELECT * FROM orders WHERE status = ANY($1::text[]) ORDER BY created_at DESC`,
      [statuses]
    );
    res.render('admin/orders', { orders, view });
  } catch (err) {
    next(err);
  }
});

router.get('/pedidos/:id', async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT * FROM orders WHERE id = $1', [req.params.id]);
    if (!rows[0]) return res.status(404).render('404');
    const { rows: items } = await pool.query('SELECT * FROM order_items WHERE order_id = $1', [
      req.params.id
    ]);
    res.render('admin/order-detail', { order: rows[0], items });
  } catch (err) {
    next(err);
  }
});

router.post('/pedidos/:id/estado', async (req, res, next) => {
  try {
    const { status } = req.body;
    await pool.query('UPDATE orders SET status = $1, updated_at = NOW() WHERE id = $2', [
      status,
      req.params.id
    ]);
    res.redirect(`/admin/pedidos/${req.params.id}`);
  } catch (err) {
    next(err);
  }
});

// --- Ajustes: conexión de WhatsApp ---
router.get('/ajustes', async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT key, value FROM settings');
    const settings = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    res.render('admin/settings', {
      settings,
      twilioConfigured: isTwilioConfigured(),
      ok: req.query.ok || null
    });
  } catch (err) {
    next(err);
  }
});

router.post('/ajustes', async (req, res, next) => {
  try {
    const enabled = req.body.whatsapp_enabled === 'on' ? 'true' : 'false';
    const number = (req.body.whatsapp_notify_number || '').replace(/\D/g, '');
    await pool.query(
      `INSERT INTO settings (key, value) VALUES ('whatsapp_enabled', $1)
       ON CONFLICT (key) DO UPDATE SET value = $1`,
      [enabled]
    );
    await pool.query(
      `INSERT INTO settings (key, value) VALUES ('whatsapp_notify_number', $1)
       ON CONFLICT (key) DO UPDATE SET value = $1`,
      [number]
    );
    res.redirect('/admin/ajustes?ok=guardado');
  } catch (err) {
    next(err);
  }
});

module.exports = router;
