const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const { CARE_GUIDES } = require('../config/careGuides');
const { buildBiomes } = require('../config/biomes');
const approach = require('../config/approach');
const { toId } = require('../utils/ids');

router.get('/', async (req, res, next) => {
  try {
    const { q } = req.query;
    // El filtro acepta varias categorías (?category=a&category=b) porque un
    // ecosistema puede estar hecho de más de una: la selva son interior y
    // palmeras, y al entrar a la isla tienen que venir las dos.
    const cats = []
      .concat(req.query.category || [])
      .filter((c) => typeof c === 'string' && c.trim() !== '');

    const params = [];
    let sql = 'SELECT * FROM products WHERE active = TRUE';

    if (cats.length) {
      params.push(cats);
      sql += ` AND category = ANY($${params.length})`;
    }
    if (q) {
      params.push(`%${q.toLowerCase()}%`);
      sql += ` AND LOWER(name) LIKE $${params.length}`;
    }
    sql += ' ORDER BY created_at DESC';

    const { rows: products } = await pool.query(sql, params);
    const { rows: categories } = await pool.query(
      'SELECT DISTINCT category FROM products WHERE active = TRUE ORDER BY category'
    );

    const isBrowsing = Boolean(cats.length || q);
    const biomes = isBrowsing ? null : buildBiomes(products);

    // Por dónde se entra hoy al mundo. Se sortea en cada visita entre los
    // ecosistemas que tienen plantas: la home recibe a cada visitante dentro de
    // uno, no en un catálogo.
    const inhabited = biomes ? biomes.filter((b) => b.total > 0) : [];
    const entrance = inhabited.length
      ? inhabited[Math.floor(Math.random() * inhabited.length)]
      : null;

    res.render('home', {
      products,
      categories,
      activeCategories: cats,
      q: q || '',
      featuredGuides: CARE_GUIDES.slice(0, 3),
      // El mundo solo se arma cuando el visitante llega a explorar. Si viene
      // filtrando o buscando, ya sabe qué quiere y la home cae al listado.
      biomes,
      entrance,
      entranceShots: entrance ? approach.source(entrance.key) : null,
      isBrowsing
    });
  } catch (err) {
    next(err);
  }
});

router.get('/guias', (req, res) => {
  res.render('guias', { guides: CARE_GUIDES });
});

router.get('/sobre-arborea', (req, res) => {
  res.render('sobre-arborea');
});

// Los cuadros de la entrada son imágenes, no vistas: no dependen de la sesión
// ni del catálogo, así que se calculan una vez al arrancar y se sirven con
// caché inmutable — el navegador los precarga y ya no vuelve a pedirlos.
router.get('/bioma/:key/:frame.svg', (req, res) => {
  const list = approach.frames(String(req.params.key));
  const i = Number(req.params.frame);
  if (!list || !Number.isInteger(i) || i < 0 || i >= list.length) {
    return res.status(404).render('404');
  }
  res.set('Content-Type', 'image/svg+xml; charset=utf-8');
  res.set('Cache-Control', 'public, max-age=31536000, immutable');
  res.send(list[i]);
});

router.get('/privacidad', (req, res) => {
  res.render('privacidad', { contactEmail: process.env.ADMIN_EMAIL || 'contacto@arborea.com' });
});

router.get('/producto/:id', async (req, res, next) => {
  try {
    const id = toId(req.params.id);
    if (id === null) return res.status(404).render('404');
    const { rows } = await pool.query('SELECT * FROM products WHERE id = $1 AND active = TRUE', [id]);
    if (!rows[0]) return res.status(404).render('404');
    res.render('product', { product: rows[0] });
  } catch (err) {
    next(err);
  }
});

// --- Carrito (guardado en sesión, sin necesidad de BD hasta el checkout) ---
router.post('/carrito/agregar', async (req, res, next) => {
  try {
    const productId = toId(req.body.productId);
    if (productId === null) return res.redirect('/carrito');

    const { rows } = await pool.query('SELECT * FROM products WHERE id = $1 AND active = TRUE', [
      productId
    ]);
    const product = rows[0];
    // No se puede agregar algo inexistente o agotado.
    if (!product || product.stock <= 0) return res.redirect('/carrito');

    req.session.cart = req.session.cart || [];
    const existing = req.session.cart.find((i) => i.productId === productId);

    // La cantidad pedida se limita a lo que hay en stock: sin tope, un cliente
    // podía pedir millones de unidades y el pedido las registraba con un total
    // absurdo. El stock manda, tanto en un ítem nuevo como al sumar a uno ya
    // presente en el carrito.
    const requested = Math.max(1, parseInt(req.body.quantity, 10) || 1);
    if (existing) {
      existing.quantity = Math.min(existing.quantity + requested, product.stock);
    } else {
      req.session.cart.push({
        productId: product.id,
        name: product.name,
        price: Number(product.price),
        quantity: Math.min(requested, product.stock)
      });
    }
    res.redirect('/carrito');
  } catch (err) {
    next(err);
  }
});

router.post('/carrito/quitar/:productId', (req, res) => {
  const productId = toId(req.params.productId);
  req.session.cart = (req.session.cart || []).filter((i) => i.productId !== productId);
  res.redirect('/carrito');
});

router.get('/carrito', (req, res) => {
  const cart = req.session.cart || [];
  const total = cart.reduce((sum, i) => sum + i.price * i.quantity, 0);
  res.render('cart', { cart, total });
});

module.exports = router;
