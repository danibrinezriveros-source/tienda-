const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const { requireLogin } = require('../middleware/auth');
const { sendOrderConfirmation } = require('../config/whatsapp');
const { checkoutLimiter } = require('../middleware/rateLimit');
const { toId } = require('../utils/ids');
const { REGIONS, isRegion } = require('../config/colombia');
const { reconcile, carry } = require('../utils/cart');
const track = require('../utils/track');

// Cada campo se recorta a lo que su columna aguanta. Las columnas de `orders`
// son VARCHAR con tope, así que un texto más largo no era un dato raro: era un
// error de Postgres subiendo hasta el manejador general y respondiendo 500 a un
// cliente que solo quería su planta.
const LIMITS = { name: 150, email: 150, phone: 30, address: 500, city: 120, notes: 1000 };

const trim = (v, max) => {
  const s = typeof v === 'string' ? v.trim() : '';
  return max ? s.slice(0, max) : s;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// El checkout ya no exige cuenta. La confirmación de este vivero ocurre por
// WhatsApp de todos modos, así que el registro no aportaba nada al pedido: solo
// ponía un formulario de contraseña entre el cliente y su planta. Quien ya tiene
// cuenta entra con ella y se ahorra escribir sus datos; quien no, pide igual.
function buyerFrom(req) {
  const user = req.session.user || null;
  return {
    userId: user ? user.id : null,
    name: user ? user.name : trim(req.body.name, LIMITS.name),
    email: user ? user.email : trim(req.body.email, LIMITS.email),
    phone: trim(req.body.phone, LIMITS.phone),
    address: trim(req.body.address, LIMITS.address),
    city: trim(req.body.city, LIMITS.city),
    region: trim(req.body.region),
    notes: trim(req.body.notes, LIMITS.notes)
  };
}

function validate(buyer) {
  if (!buyer.name) return 'Necesitamos un nombre para el pedido.';
  if (!buyer.phone) return 'Sin teléfono no podemos confirmarte el pedido por WhatsApp.';
  // El teléfono se marca a mano para confirmar: tiene que poder marcarse.
  if (!/^[0-9+()\s-]{7,30}$/.test(buyer.phone)) {
    return 'Ese teléfono no parece válido. Escríbelo con el indicativo, solo números.';
  }
  if (buyer.email && !EMAIL_RE.test(buyer.email)) {
    return 'Ese correo no parece válido. Puedes dejarlo vacío si prefieres.';
  }
  if (!buyer.address) return 'Falta la dirección de entrega.';
  if (!buyer.city) return 'Falta la ciudad.';
  if (!isRegion(buyer.region)) return 'Elige el departamento de la lista.';
  return null;
}

// El formulario se vuelve a dibujar tal como lo dejó el cliente cuando algo
// falla: reescribir la dirección entera por un teléfono mal puesto es la forma
// más rápida de perder un pedido.
function renderCheckout(res, { cart, total, error, form }) {
  res.render('checkout', { cart, total, error: error || null, regions: REGIONS, form: form || {} });
}

router.get('/checkout', async (req, res, next) => {
  try {
    const { lines, total, changes } = await reconcile(req);
    if (!lines.length) return res.redirect('/carrito');
    // Si la tienda cambió mientras el carrito esperaba, se resuelve en el
    // carrito —donde el cliente puede reaccionar— y no aquí.
    if (changes.length) {
      carry(req, changes);
      return res.redirect('/carrito');
    }

    res.locals.trackEvents = [track.fromCart('begin_checkout', lines)];
    renderCheckout(res, { cart: lines, total, error: null, form: {} });
  } catch (err) {
    next(err);
  }
});

router.post('/checkout', checkoutLimiter, async (req, res, next) => {
  const buyer = buyerFrom(req);

  try {
    // Primero la tienda, después el formulario: si algo se agotó no tiene
    // sentido señalarle al cliente que le falta la ciudad.
    const { lines, total, changes } = await reconcile(req);
    if (!lines.length) return res.redirect('/carrito');
    if (changes.length) {
      carry(req, changes);
      return res.redirect('/carrito');
    }

    const error = validate(buyer);
    if (error) return renderCheckout(res, { cart: lines, total, error, form: buyer });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // La cantidad del carrito es una intención, no una garantía: entre mirarlo
      // y pagar, el stock pudo cambiar. Se re-valida contra la base de datos y se
      // bloquea cada fila con FOR UPDATE, de modo que dos pedidos simultáneos no
      // puedan vender el mismo stock dos veces. El precio también se toma de la
      // BD, no del carrito, por si cambió.
      const confirmed = [];
      const lost = [];
      for (const line of lines) {
        const { rows } = await client.query(
          'SELECT id, name, price, stock FROM products WHERE id = $1 AND active = TRUE FOR UPDATE',
          [line.productId]
        );
        const product = rows[0];
        if (!product || product.stock <= 0) {
          lost.push(line.name + ' se agotó y salió del carrito.');
          continue;
        }
        const quantity = Math.min(line.quantity, product.stock);
        if (quantity < line.quantity) {
          lost.push(
            product.stock === 1
              ? 'De ' + product.name + ' queda una sola: dejamos esa.'
              : 'De ' + product.name + ' quedan ' + product.stock + ': ajustamos la cantidad.'
          );
        }
        confirmed.push({
          productId: product.id,
          name: product.name,
          price: Number(product.price),
          quantity
        });
      }

      // Alguien se llevó lo último entre la revisión anterior y esta línea. Es
      // raro, pero el pedido no se crea a medias: el cliente vuelve al carrito y
      // decide él si sigue con lo que queda.
      if (lost.length) {
        await client.query('ROLLBACK');
        req.session.cart = confirmed.map(({ productId, name, price, quantity }) => ({
          productId,
          name,
          price,
          quantity
        }));
        carry(req, lost);
        return res.redirect('/carrito');
      }

      const amount = confirmed.reduce((sum, i) => sum + i.price * i.quantity, 0);

      const { rows: orderRows } = await client.query(
        `INSERT INTO orders (user_id, customer_name, customer_phone, customer_email, address, city, region, notes, total, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'pendiente') RETURNING *`,
        [
          buyer.userId,
          buyer.name,
          buyer.phone,
          buyer.email || null,
          buyer.address,
          buyer.city,
          buyer.region,
          buyer.notes || null,
          amount
        ]
      );
      const order = orderRows[0];

      for (const item of confirmed) {
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

      // Un pedido sin cuenta no tiene dueño en la base de datos, así que el
      // permiso para verlo vive en la sesión que lo creó. Es el mismo alcance
      // que ya tenía el carrito: se acaba cuando se acaba la visita.
      if (!buyer.userId) {
        req.session.guestOrders = (req.session.guestOrders || []).concat([order.id]);
      }

      // La conversión se declara con lo que quedó guardado tras revalidar stock y
      // precio contra la base de datos: es la única cifra que corresponde a una
      // venta real. Va a la cola de sesión porque esta respuesta es una
      // redirección, y se dispara una sola vez al abrir el pedido — refrescar esa
      // página no vuelve a contarla.
      track.queue(
        req,
        track.fromCart('purchase', confirmed, { transaction_id: String(order.id) })
      );

      // Confirmación por WhatsApp (si está activada en el panel de admin)
      sendOrderConfirmation(
        order,
        confirmed.map((i) => ({ product_name: i.name, quantity: i.quantity }))
      ).catch((e) => console.error('WhatsApp:', e.message));

      res.redirect('/mis-pedidos/' + order.id);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    next(err);
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

router.get('/mis-pedidos/:id', async (req, res, next) => {
  try {
    const id = toId(req.params.id);
    if (id === null) return res.status(404).render('404');

    const { rows } = await pool.query('SELECT * FROM orders WHERE id = $1', [id]);
    const order = rows[0];

    // Un pedido es de quien lo hizo: del usuario que lo firmó, o de la sesión
    // que lo creó sin cuenta. Cualquier otro caso responde 404 y no 403 — un
    // "no puedes ver este" confirmaría que el pedido existe.
    const user = req.session.user;
    const mine =
      order &&
      ((user && order.user_id === user.id) ||
        (req.session.guestOrders || []).includes(order.id));
    if (!mine) return res.status(404).render('404');

    const { rows: items } = await pool.query('SELECT * FROM order_items WHERE order_id = $1', [id]);
    res.render('order-detail', { order, items });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
