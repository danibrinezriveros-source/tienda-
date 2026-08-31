// Lo que el sitio le cuenta de sí mismo a un robot.
//
// Dos consumidores distintos leen esto y ninguno ve la página como un humano:
// el rastreador (Google Search Console, que es lo que valida Merchant Center)
// y el previsualizador de enlaces (lo que se ve cuando el anuncio o un
// compartido muestra la tarjeta del sitio). Los dos leen el <head>.

const site = require('../config/site');

// La canónica se arma solo con la ruta, sin la query: `/?category=exterior`
// y `/?category=exterior&q=` son la misma página para un buscador, y dejar
// que se indexen por separado reparte la autoridad entre duplicados.
function canonicalFor(req) {
  return site.url(req.path === '/' ? '/' : req.path.replace(/\/+$/, ''));
}

function absolute(url) {
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url;
  return site.url(url);
}

// Precio en el formato que piden los feeds y el schema: número plano con
// punto decimal, sin separador de miles. `$1.250.000` no lo entiende nadie.
function decimal(value) {
  return Number(value || 0).toFixed(2);
}

// --- Datos estructurados ---
// Van como JSON-LD porque es el único formato que Google documenta para
// productos. Con esto la ficha puede aparecer con precio y disponibilidad en
// resultados y anuncios gratuitos de Shopping.

function organizationJsonLd() {
  const node = {
    '@context': 'https://schema.org',
    '@type': 'Store',
    name: site.name,
    description: site.description,
    url: site.baseUrl,
    image: site.url(site.ogImage),
    currenciesAccepted: site.currency
  };
  if (site.legalName) node.legalName = site.legalName;
  if (site.taxId) node.taxID = site.taxId;
  if (site.email) node.email = site.email;
  if (site.phone) node.telephone = site.phone;
  if (site.hours) node.openingHours = site.hours;
  if (site.social.length) node.sameAs = site.social;
  if (site.city || site.street) {
    node.address = {
      '@type': 'PostalAddress',
      addressCountry: site.country
    };
    if (site.street) node.address.streetAddress = site.street;
    if (site.city) node.address.addressLocality = site.city;
    if (site.region) node.address.addressRegion = site.region;
    if (site.postalCode) node.address.postalCode = site.postalCode;
  }
  return node;
}

function productJsonLd(product) {
  const link = site.url(`/producto/${product.id}`);
  const node = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    description: product.description || site.description,
    // El id interno hace de SKU: es lo que amarra la ficha con la misma fila
    // del feed de catálogo, y sin esa correspondencia Merchant Center no puede
    // confirmar que el precio anunciado es el precio de la página.
    sku: String(product.id),
    category: product.category,
    brand: { '@type': 'Brand', name: site.name },
    offers: {
      '@type': 'Offer',
      url: link,
      priceCurrency: site.currency,
      price: decimal(product.price),
      availability:
        product.stock > 0
          ? 'https://schema.org/InStock'
          : 'https://schema.org/OutOfStock',
      itemCondition: 'https://schema.org/NewCondition',
      seller: { '@type': 'Organization', name: site.name }
    }
  };
  const image = absolute(product.image_url);
  if (image) node.image = image;
  return node;
}

function breadcrumbJsonLd(trail) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((step, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: step.name,
      item: site.url(step.path)
    }))
  };
}

// JSON que va a vivir dentro de una etiqueta <script> del HTML.
//
// `JSON.stringify` escapa comillas y saltos de línea, pero no `<`. El nombre y
// la descripción de un producto los escribe el panel (o llegan por CSV), así
// que un texto que contenga `</script>` cerraría la etiqueta antes de tiempo y
// lo que viniera después sería HTML de la página, no datos. La política de
// seguridad por nonce impediría que ese HTML llegara a ejecutar nada, pero la
// defensa no puede ser una sola: aquí los caracteres que tienen significado en
// HTML se escriben como escapes unicode, que JSON entiende igual y el
// analizador de HTML ya no reconoce.
function jsonForScript(value) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');
}

module.exports = {
  canonicalFor,
  absolute,
  decimal,
  jsonForScript,
  organizationJsonLd,
  productJsonLd,
  breadcrumbJsonLd
};
