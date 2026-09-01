// Los eventos que el sitio le declara a Google Ads y a TikTok Ads.
//
// Se arman en el servidor a propósito. El precio y la cantidad que se reportan
// como conversión son los mismos que la tienda guardó en la base de datos, no
// lo que quedó escrito en el HTML: si alguien manipula la página, el valor que
// llega a la plataforma no cambia, y los informes de venta siguen siendo el
// reflejo de lo que realmente ocurrió.
//
// El vocabulario es el de comercio electrónico de Google (view_item,
// add_to_cart, begin_checkout, purchase). measure.js lo traduce al de TikTok.

const site = require('./../config/site');

function item(source, quantity) {
  return {
    item_id: String(source.productId != null ? source.productId : source.id),
    item_name: source.name,
    price: Number(source.price),
    quantity: quantity || source.quantity || 1,
    item_category: source.category || undefined
  };
}

function totalOf(items) {
  return items.reduce((sum, i) => sum + i.price * i.quantity, 0);
}

function event(name, items, extra) {
  return Object.assign(
    { name, currency: site.currency, value: totalOf(items), items },
    extra || {}
  );
}

const viewItem = (product) => event('view_item', [item(product)]);
const addToCart = (product, quantity) => event('add_to_cart', [item(product, quantity)]);
const fromCart = (name, cart, extra) => event(name, cart.map((i) => item(i)), extra);

// Un POST responde con una redirección y ahí no hay HTML donde colgar el
// evento. Se deja en la sesión y app.js lo recoge en el siguiente render.
function queue(req, e) {
  if (!site.needsConsent) return; // sin píxeles configurados no hay nada que guardar
  req.session.trackQueue = (req.session.trackQueue || []).concat([e]);
}

module.exports = { item, event, viewItem, addToCart, fromCart, queue };
