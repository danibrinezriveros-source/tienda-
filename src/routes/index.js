const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const { CARE_GUIDES } = require('../config/careGuides');
const { buildBiomes } = require('../config/biomes');
const { toId } = require('../utils/ids');

router.get('/', async (req, res, next) => {
  try {
    const { category, q } = req.query;
    const params = [];
    let sql = 'SELECT * FROM products WHERE active = TRUE';

    if (category) {
      params.push(category);
      sql += ` AND category = $${params.length}`;
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

    const isBrowsing = Boolean(category || q);

    res.render('home', {
      products,
      categories,
      activeCategory: category || '',
      q: q || '',
      featuredGuides: CARE_GUIDES.slice(0, 3),
      // El mundo solo se arma cuando el visitante llega a explorar. Si viene
      // filtrando o buscando, ya sabe qué quiere y la home cae al listado.
      biomes: isBrowsing ? null : buildBiomes(products),
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
