const express = require('express');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const { parse } = require('csv-parse/sync');
const router = express.Router();
const { pool } = require('../db');
const { requireAdmin, regenerateSession } = require('../middleware/auth');
const { isTwilioConfigured } = require('../config/whatsapp');
const { uploadProductImage } = require('../config/storage');
const { adminLoginLimiter, passwordChangeLimiter } = require('../middleware/rateLimit');
const { verify: verifyCsrf } = require('../middleware/csrf');
const { toId } = require('../utils/ids');

// Estados válidos de un pedido. El panel no puede escribir cualquier string:
// un estado desconocido queda fuera de los conteos del dashboard y de las
// vistas de entrantes/salientes, es decir, un pedido invisible.
const ORDER_STATUSES = ['pendiente', 'confirmado', 'en_preparacion', 'enviado', 'entregado', 'cancelado'];

// Tope de filas por importación de CSV. Sin límite, un archivo enorme dispara
// miles de INSERT uno por uno y agota el timeout de la función serverless,
// dejando una importación a medias.
const CSV_MAX_ROWS = 2000;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024, files: 1, fields: 20 }
});

// Formatos de imagen aceptados, con la firma real de cada uno. El `mimetype`
// que llega en el formulario lo escribe quien sube el archivo, así que decir
// "image/png" no prueba nada: lo que se comprueba abajo son los primeros bytes
// del contenido. Se deja fuera el SVG a propósito — un SVG es un documento XML
// que puede llevar <script> dentro, y guardarlo en un almacenamiento público
// sería publicar código ejecutable bajo el nombre de una foto de planta.
const IMAGE_SIGNATURES = [
  { mime: 'image/jpeg', ext: '.jpg', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  {
    mime: 'image/png',
    ext: '.png',
    test: (b) => b.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  },
  {
    mime: 'image/webp',
    ext: '.webp',
    test: (b) => b.slice(0, 4).toString('ascii') === 'RIFF' && b.slice(8, 12).toString('ascii') === 'WEBP'
  },
  { mime: 'image/gif', ext: '.gif', test: (b) => b.slice(0, 3).toString('ascii') === 'GIF' }
];

function identifyImage(buffer) {
  if (!buffer || buffer.length < 12) return null;
  return IMAGE_SIGNATURES.find((s) => s.test(buffer)) || null;
}

const uploadImage = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 30 },
  fileFilter: (req, file, cb) => {
    // Primer filtro, barato: descarta lo evidente antes de leer el archivo.
    // El que decide de verdad es `identifyImage`, ya con el contenido en mano.
    if (!/^image\/(jpeg|png|webp|gif)$/.test(file.mimetype)) {
      return cb(new Error('La foto debe ser JPG, PNG, WEBP o GIF.'));
    }
    cb(null, true);
  }
});

// Sube la foto solo si el contenido es realmente una imagen, y le pone la
// extensión y el tipo que corresponden a lo que resultó ser, no a lo que dijo
// el formulario.
async function storeImage(file) {
  const kind = identifyImage(file.buffer);
  if (!kind) throw new Error('El archivo no es una imagen válida.');
  return uploadProductImage(file.buffer, 'foto' + kind.ext, kind.mime);
}

// La foto también puede pegarse como enlace. Ese texto termina en el `src` de
// una etiqueta y en los feeds que leen Google y TikTok, así que solo se aceptan
// direcciones http/https: `javascript:` y `data:` no son fotos, son formas de
// meter contenido ejecutable en la página por la puerta del catálogo.
function safeImageUrl(value) {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw) return null;
  if (raw.startsWith('/')) return raw; // ruta interna: /uploads/...
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
  } catch (e) {
    return null;
  }
}

// Hash de una contraseña que no es de nadie. Sirve para gastar el mismo tiempo
// de cómputo cuando el correo no existe: ver más abajo.
const DUMMY_HASH = bcrypt.hashSync('contraseña-que-no-pertenece-a-nadie', 10);

// --- Ingreso de administrador ---
router.get('/ingresar', (req, res) => {
  res.render('admin/login', { error: null });
});

router.post('/ingresar', adminLoginLimiter, async (req, res, next) => {
  try {
    const email = typeof req.body.email === 'string' ? req.body.email : '';
    const password = typeof req.body.password === 'string' ? req.body.password : '';

    const { rows } = await pool.query('SELECT * FROM users WHERE email = $1 AND role = $2', [
      email,
      'admin'
    ]);
    const admin = rows[0];

    // Cuando el correo no existe se compara igual contra un hash de descarte.
    // Sin esto la respuesta vuelve mucho antes —bcrypt no llegó a ejecutarse— y
    // ese tiempo revela cuál es el correo del administrador, que es la mitad
    // del trabajo de quien intenta entrar.
    const hash = admin ? admin.password_hash : DUMMY_HASH;
    const okPassword = await bcrypt.compare(password, hash);

    if (!admin || !okPassword) {
      return res.status(401).render('admin/login', { error: 'Credenciales incorrectas.' });
    }

    await regenerateSession(req);
    req.session.user = { id: admin.id, name: admin.name, email: admin.email, role: admin.role };
    // Marca de nacimiento de la sesión de administrador. La usa `requireAdmin`
    // para caducarla por antigüedad, independientemente de la cookie.
    req.session.adminSince = Date.now();
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

// `verifyCsrf` va después de multer a propósito: el cuerpo de un formulario con
// archivo llega como multipart y el token no existe hasta que multer lo parsea.
// El middleware global ya se aseguró de que solo estas rutas puedan llegar
// hasta aquí con un cuerpo multipart.
router.post('/productos/nuevo', uploadImage.single('image'), verifyCsrf, async (req, res, next) => {
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
      ? await storeImage(req.file)
      : safeImageUrl(image_url);
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

router.post('/productos/:id/editar', uploadImage.single('image'), verifyCsrf, async (req, res, next) => {
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
      ? await storeImage(req.file)
      : safeImageUrl(image_url);
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

// Retirar un producto lo saca del catálogo, no de la historia.
//
// Antes esto borraba la fila. Dos problemas: `order_items` apunta a `products`,
// así que borrar una planta ya vendida chocaba con la clave foránea y el panel
// respondía con un error de servidor; y aunque hubiera funcionado, se habría
// perdido el rastro de qué se vendió, que es justamente lo que hay que poder
// mostrar si un cliente reclama o si lo pide la DIAN. Se marca inactiva: la
// tienda deja de mostrarla, los feeds dejan de anunciarla y el pedido viejo
// sigue contando la verdad.
router.post('/productos/:id/eliminar', async (req, res, next) => {
  try {
    const id = toId(req.params.id);
    if (id === null) return res.status(404).render('404');
    await pool.query('UPDATE products SET active = FALSE, updated_at = NOW() WHERE id = $1', [id]);
    res.redirect('/admin/productos?ok=retirado');
  } catch (err) {
    next(err);
  }
});

// --- Carga masiva de catálogo por CSV ---
// Columnas esperadas: name,description,price,stock,category,tags,image_url
router.post('/productos/importar', upload.single('csv'), verifyCsrf, async (req, res, next) => {
  try {
    if (!req.file) return res.redirect('/admin/productos?ok=sin_archivo');
    const records = parse(req.file.buffer, { columns: true, skip_empty_lines: true, trim: true });
    if (records.length > CSV_MAX_ROWS) {
      return res.redirect(`/admin/productos?ok=csv_demasiadas_filas_${CSV_MAX_ROWS}`);
    }

    // Se revisa el archivo entero antes de escribir una sola fila. Antes se
    // insertaba fila por fila y la primera inválida —un nombre vacío, un precio
    // que no es un número— reventaba a mitad del recorrido, dejando el catálogo
    // con media importación y sin forma de saber dónde se había cortado.
    const clean = [];
    for (let i = 0; i < records.length; i++) {
      const r = records[i];
      const name = typeof r.name === 'string' ? r.name.trim() : '';
      const price = Number.parseFloat(r.price);
      const stock = Number.parseInt(r.stock, 10);

      if (!name) return res.redirect(`/admin/productos?ok=csv_fila_${i + 2}_sin_nombre`);
      if (!Number.isFinite(price) || price < 0) {
        return res.redirect(`/admin/productos?ok=csv_fila_${i + 2}_precio_invalido`);
      }
      if (!Number.isInteger(stock) || stock < 0) {
        return res.redirect(`/admin/productos?ok=csv_fila_${i + 2}_stock_invalido`);
      }

      clean.push([
        name.slice(0, 200),
        typeof r.description === 'string' ? r.description : '',
        price,
        stock,
        (typeof r.category === 'string' && r.category.trim()) || 'general',
        typeof r.tags === 'string' ? r.tags.slice(0, 255) : '',
        safeImageUrl(r.image_url)
      ]);
    }

    // Y se escribe todo dentro de una transacción: o entra el catálogo
    // completo, o no entra nada y el que había sigue intacto.
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const row of clean) {
        await client.query(
          `INSERT INTO products (name, description, price, stock, category, tags, image_url)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          row
        );
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    res.redirect(`/admin/productos?ok=importados_${clean.length}`);
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

// --- Ajustes: conexión de WhatsApp y contraseña ---
router.get('/ajustes', async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT key, value FROM settings');
    const settings = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    res.render('admin/settings', {
      settings,
      twilioConfigured: isTwilioConfigured(),
      ok: req.query.ok || null,
      passwordError: null
    });
  } catch (err) {
    next(err);
  }
});

// Cambiar la contraseña del panel.
//
// Hasta ahora la única contraseña de administrador era la que se escribió en
// `.env` el día del despliegue: quedaba fija para siempre, escrita en un
// archivo y probablemente repetida en algún otro sitio. Poder rotarla es la
// diferencia entre una filtración molesta y una tienda entregada.
const MIN_PASSWORD = 12;

async function renderSettings(res, passwordError) {
  const { rows } = await pool.query('SELECT key, value FROM settings');
  return res.status(400).render('admin/settings', {
    settings: Object.fromEntries(rows.map((r) => [r.key, r.value])),
    twilioConfigured: isTwilioConfigured(),
    ok: null,
    passwordError
  });
}

router.post('/contrasena', passwordChangeLimiter, async (req, res, next) => {
  try {
    const current = typeof req.body.current_password === 'string' ? req.body.current_password : '';
    const next1 = typeof req.body.new_password === 'string' ? req.body.new_password : '';
    const next2 = typeof req.body.confirm_password === 'string' ? req.body.confirm_password : '';

    if (next1.length < MIN_PASSWORD) {
      return renderSettings(res, `La nueva contraseña debe tener al menos ${MIN_PASSWORD} caracteres.`);
    }
    if (next1 !== next2) {
      return renderSettings(res, 'La nueva contraseña y su confirmación no coinciden.');
    }

    // Se pide la actual aunque la sesión ya esté abierta: si alguien se sienta
    // frente a un panel que quedó sin cerrar, no debería poder quedarse con la
    // cuenta cambiando la clave sin conocer la anterior.
    const { rows } = await pool.query('SELECT password_hash FROM users WHERE id = $1 AND role = $2', [
      req.session.user.id,
      'admin'
    ]);
    if (!rows[0] || !(await bcrypt.compare(current, rows[0].password_hash))) {
      return renderSettings(res, 'La contraseña actual no es correcta.');
    }
    if (await bcrypt.compare(next1, rows[0].password_hash)) {
      return renderSettings(res, 'La nueva contraseña tiene que ser distinta de la actual.');
    }

    const hash = await bcrypt.hash(next1, 12);
    await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, req.session.user.id]);

    // Cambiar la contraseña invalida la sesión y obliga a volver a entrar. Si
    // el motivo del cambio es que alguien más tenía la anterior, esa persona
    // conservaría el acceso hasta que su cookie caducara.
    const user = req.session.user;
    await regenerateSession(req);
    req.session.user = user;
    req.session.adminSince = Date.now();
    res.redirect('/admin/ajustes?ok=contrasena');
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

// Un archivo demasiado grande o de un tipo que no aceptamos es un error del
// visitante, no del servidor. Antes subía hasta el manejador general y el panel
// respondía con la página de "ocurrió un error inesperado", que no dice qué
// arreglar. Aquí se traduce a un mensaje concreto sin salir del formulario.
router.use((err, req, res, next) => {
  const isUpload =
    err instanceof multer.MulterError ||
    /imagen|JPG|PNG/i.test(err.message || '');
  if (!isUpload) return next(err);

  const message =
    err.code === 'LIMIT_FILE_SIZE'
      ? 'La foto pesa demasiado. El máximo son 5 MB (2 MB para el CSV).'
      : err.message || 'No pudimos leer ese archivo.';

  if (req.path.startsWith('/productos/importar')) {
    return res.redirect('/admin/productos?ok=csv_archivo_invalido');
  }
  res.status(400).render('admin/product-form', { product: null, error: message });
});

module.exports = router;
