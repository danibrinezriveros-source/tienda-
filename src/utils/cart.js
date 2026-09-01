const { pool } = require('../db');
const { money } = require('./money');

// El carrito vive en la sesión, y la sesión no se entera de lo que pasa en la
// tienda: entre recoger una planta y pagarla puede agotarse, cambiar de precio
// o retirarse del catálogo. Eso antes se descubría dentro del checkout, que
// omitía en silencio lo que ya no había y creaba el pedido igual — el cliente
// recibía una confirmación sin la planta por la que había entrado, y nadie se
// lo decía.
//
// Aquí el carrito se contrasta contra la base de datos cada vez que se mira, y
// cada diferencia se cuenta en voz alta. Cuando el cliente llega al checkout ya
// no queda nada por descubrir.
async function reconcile(req) {
  const cart = req.session.cart || [];
  if (!cart.length) return { lines: [], total: 0, changes: [] };

  const { rows } = await pool.query(
    'SELECT id, name, price, stock, active FROM products WHERE id = ANY($1)',
    [cart.map((i) => i.productId)]
  );
  const live = new Map(rows.map((p) => [p.id, p]));

  const lines = [];
  const changes = [];

  for (const item of cart) {
    const product = live.get(item.productId);

    if (!product || !product.active || product.stock <= 0) {
      changes.push(`${item.name} se agotó y salió del carrito.`);
      continue;
    }

    const price = Number(product.price);
    if (price !== item.price) {
      changes.push(`${product.name} cambió de precio: ahora cuesta ${money(price)}.`);
    }

    const quantity = Math.min(item.quantity, product.stock);
    if (quantity < item.quantity) {
      changes.push(
        product.stock === 1
          ? `De ${product.name} queda una sola: dejamos esa.`
          : `De ${product.name} quedan ${product.stock}: ajustamos la cantidad.`
      );
    }

    lines.push({ productId: product.id, name: product.name, price, quantity, stock: product.stock });
  }

  // La sesión se queda con lo reconciliado: lo que el cliente ve en pantalla es
  // lo que se va a cobrar, y el siguiente render parte de la misma verdad.
  req.session.cart = lines.map(({ productId, name, price, quantity }) => ({
    productId,
    name,
    price,
    quantity
  }));

  const total = lines.reduce((sum, l) => sum + l.price * l.quantity, 0);
  return { lines, total, changes };
}

// Los avisos nacen en una petición (el checkout que devuelve al carrito) y se
// leen en otra, después de una redirección: viajan por la sesión.
function carry(req, changes) {
  if (changes && changes.length) req.session.cartChanges = changes;
}

function collect(req) {
  const carried = req.session.cartChanges || [];
  delete req.session.cartChanges;
  return carried;
}

module.exports = { reconcile, carry, collect };
