const express = require('express');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const { parse } = require('csv-parse/sync');
const router = express.Router();
const { pool } = require('../db');
const { requireAdmin, regenerateSession } = require('../middleware/auth');
const { isTwilioConfigured } = require('../config/whatsapp');
const { uploadProductImage } = require('../config/storage');
const { loginLimiter } = require('../middleware/rateLimit');
const { toId } = require('../utils/ids');

// Estados válidos de un pedido. El panel no puede escribir cualquier string:
// un estado desconocido queda fuera de los conteos del dashboard y de las
// vistas de entrantes/salientes, es decir, un pedido invisible.
const ORDER_STATUSES = ['pendiente', 'confirmado', 'en_preparacion', 'enviado', 'entregado', 'cancelado'];

// Tope de filas por importación de CSV. Sin límite, un archivo enorme dispara
// miles de INSERT uno por uno y agota el timeout de la función serverless,
// dejando una importación a medias.
const CSV_MAX_ROWS = 2000;

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

router.post('/ingresar', loginLimiter, async (req, res, next) => {
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
    await regenerateSession(req);
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
    const priceNum = parseFloat(price);
    const stockNum = parseInt(stock, 10);
    if (!name || Number.isNaN(priceNum) || priceNum < 0 || Number.isNaN(stockNum) || stockNum < 0) {
      return res.render('admin/product-form', {
        product: null,
        error: 'Revisa el nombre, el precio y el stock: el precio y el stock deben ser números válidos y no negativos.'
      });
    }
    const finalImageUrl = req.file
      ? await uploadProductImage(req.file.buffer, req.file.originalname, req.file.mimetype)
      : image_url || null;
    await pool.query(
      `INSERT INTO products (name, description, price, stock, category, tags, image_url)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [name, description, priceNum, stockNum, category || 'general', tags || '', finalImageUrl]
    );
    res.redirect('/admin/productos?ok=creado');
  } catch (err) {
    next(err);
  }
});

router.get('/productos/:id/editar', async (req, res, next) => {
  try {
    const id = toId(req.params.id);
    if (id === null) return res.status(404).render('404');
    const { rows } = await pool.query('SELECT * FROM products WHERE id = $1', [id]);
    if (!rows[0]) return res.status(404).render('404');
    res.render('admin/product-form', { product: rows[0], error: null });
  } catch (err) {
    next(err);
  }
});

router.post('/productos/:id/editar', uploadImage.single('image'), async (req, res, next) => {
  try {
    const id = toId(req.params.id);
    if (id === null) return res.status(404).render('404');
    const { name, description, price, stock, category, tags, image_url, active } = req.body;
    const priceNum = parseFloat(price);
    const stockNum = parseInt(stock, 10);
    if (!name || Number.isNaN(priceNum) || priceNum < 0 || Number.isNaN(stockNum) || stockNum < 0) {
      return res.render('admin/product-form', {
        product: { ...req.body, id, active: active === 'on' },
        error: 'Revisa el nombre, el precio y el stock: el precio y el stock deben ser números válidos y no negativos.'
      });
    }
    const finalImageUrl = req.file
      ? await uploadProductImage(req.file.buffer, req.file.originalname, req.file.mimetype)
      : image_url || null;
    await pool.query(
      `UPDATE products SET name=$1, description=$2, price=$3, stock=$4, category=$5,
       tags=$6, image_url=$7, active=$8, updated_at=NOW() WHERE id=$9`,
      [name, description, priceNum, stockNum, category, tags || '', finalImageUrl, active === 'on', id]
    );
    res.redirect('/admin/productos?ok=actualizado');
  } catch (err) {
    next(err);
  }
});

router.post('/productos/:id/eliminar', async (req, res, next) => {
  try {
    const id = toId(req.params.id);
    if (id === null) return res.status(404).render('404');
    await pool.query('DELETE FROM products WHERE id = $1', [id]);
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
    if (records.length > CSV_MAX_ROWS) {
      return res.redirect(`/admin/productos?ok=csv_demasiadas_filas_${CSV_MAX_ROWS}`);
    }

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
    const id = toId(req.params.id);
    if (id === null) return res.status(404).render('404');
    const { rows } = await pool.query('SELECT * FROM orders WHERE id = $1', [id]);
    if (!rows[0]) return res.status(404).render('404');
    const { rows: items } = await pool.query('SELECT * FROM order_items WHERE order_id = $1', [id]);
    res.render('admin/order-detail', { order: rows[0], items });
  } catch (err) {
    next(err);
  }
});

router.post('/pedidos/:id/estado', async (req, res, next) => {
  try {
    const id = toId(req.params.id);
    if (id === null) return res.status(404).render('404');
    const { status } = req.body;
    // Solo se acepta un estado de la lista conocida; cualquier otro se ignora
    // para no dejar el pedido en un estado que ninguna vista sabe mostrar.
    if (!ORDER_STATUSES.includes(status)) return res.redirect(`/admin/pedidos/${id}`);
    await pool.query('UPDATE orders SET status = $1, updated_at = NOW() WHERE id = $2', [status, id]);
    res.redirect(`/admin/pedidos/${id}`);
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
