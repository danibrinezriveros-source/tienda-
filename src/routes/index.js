const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const { CARE_GUIDES } = require('../config/careGuides');
const { buildBiomes } = require('../config/biomes');

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
    const { rows } = await pool.query('SELECT * FROM products WHERE id = $1 AND active = TRUE', [
      req.params.id
    ]);
    if (!rows[0]) return res.status(404).render('404');
    res.render('product', { product: rows[0] });
  } catch (err) {
    next(err);
  }
});

// --- Carrito (guardado en sesión, sin necesidad de BD hasta el checkout) ---
router.post('/carrito/agregar', async (req, res, next) => {
  try {
    const { productId, quantity } = req.body;
    const { rows } = await pool.query('SELECT * FROM products WHERE id = $1 AND active = TRUE', [
      productId
    ]);
    const product = rows[0];
    if (!product) return res.redirect('back');

    req.session.cart = req.session.cart || [];
    const existing = req.session.cart.find((i) => i.productId == productId);
    const qty = Math.max(1, parseInt(quantity, 10) || 1);

    if (existing) {
      existing.quantity += qty;
    } else {
      req.session.cart.push({
        productId: product.id,
        name: product.name,
        price: Number(product.price),
        quantity: qty
      });
    }
    res.redirect('/carrito');
  } catch (err) {
    next(err);
  }
});

router.post('/carrito/quitar/:productId', (req, res) => {
  req.session.cart = (req.session.cart || []).filter(
    (i) => i.productId != req.params.productId
  );
  res.redirect('/carrito');
});

router.get('/carrito', (req, res) => {
  const cart = req.session.cart || [];
  const total = cart.reduce((sum, i) => sum + i.price * i.quantity, 0);
  res.render('cart', { cart, total });
});

module.exports = router;
