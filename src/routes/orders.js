const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const { requireLogin } = require('../middleware/auth');
const { sendOrderConfirmation } = require('../config/whatsapp');
const { checkoutLimiter } = require('../middleware/rateLimit');

router.get('/checkout', requireLogin, (req, res) => {
  const cart = req.session.cart || [];
  if (cart.length === 0) return res.redirect('/carrito');
  const total = cart.reduce((sum, i) => sum + i.price * i.quantity, 0);
  res.render('checkout', { cart, total, error: null });
});

router.post('/checkout', requireLogin, checkoutLimiter, async (req, res, next) => {
  const client = await pool.connect();
  try {
    const cart = req.session.cart || [];
    if (cart.length === 0) return res.redirect('/carrito');

    const { phone, address, notes } = req.body;
    const total = cart.reduce((sum, i) => sum + i.price * i.quantity, 0);

    await client.query('BEGIN');
    const { rows: orderRows } = await client.query(
      `INSERT INTO orders (user_id, customer_name, customer_phone, customer_email, address, notes, total, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'pendiente') RETURNING *`,
      [req.session.user.id, req.session.user.name, phone, req.session.user.email, address, notes, total]
    );
    const order = orderRows[0];

    for (const item of cart) {
      await client.query(
        `INSERT INTO order_items (order_id, product_id, product_name, unit_price, quantity)
         VALUES ($1,$2,$3,$4,$5)`,
        [order.id, item.productId, item.name, item.price, item.quantity]
      );
      await client.query('UPDATE products SET stock = GREATEST(stock - $1, 0) WHERE id = $2', [
        item.quantity,
        item.productId
      ]);
    }
    await client.query('COMMIT');

    req.session.cart = [];

    // Confirmación por WhatsApp (si está activada en el panel de admin)
    sendOrderConfirmation(order, cart.map((i) => ({ product_name: i.name, quantity: i.quantity }))).catch(
      (e) => console.error('WhatsApp:', e.message)
    );

    res.redirect(`/mis-pedidos/${order.id}`);
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
});

router.get('/mis-pedidos', requireLogin, async (req, res, next) => {
  try {
    const { rows: orders } = await pool.query(
      'SELECT * FROM orders WHERE user_id = $1 ORDER BY created_at DESC',
      [req.session.user.id]
    );
    res.render('my-orders', { orders });
  } catch (err) {
    next(err);
  }
});

router.get('/mis-pedidos/:id', requireLogin, async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT * FROM orders WHERE id = $1 AND user_id = $2', [
      req.params.id,
      req.session.user.id
    ]);
    if (!rows[0]) return res.status(404).render('404');
    const { rows: items } = await pool.query('SELECT * FROM order_items WHERE order_id = $1', [
      req.params.id
    ]);
    res.render('order-detail', { order: rows[0], items });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
