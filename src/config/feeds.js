// Feeds de catálogo: el mismo catálogo, en el idioma que lee cada plataforma.
//
// Un anuncio de Shopping (Google) o de catálogo (TikTok) no se escribe a mano
// producto por producto: la plataforma lee un archivo del sitio y arma sola una
// ficha por cada fila. Google Merchant Center lee RSS 2.0 con el espacio de
// nombres `g:`; TikTok lee un CSV. Los dos salen de la misma consulta.
//
// Una fila rechazada es un producto que no se puede anunciar, así que aquí se
// filtra antes de publicar en vez de dejar que la plataforma lo rebote.

const site = require('./site');
const { absolute, decimal } = require('../utils/seo');

// Requisitos duros de las dos plataformas: sin foto real no hay ficha, y sin
// precio mayor a cero el artículo se rechaza por "precio inválido". El dibujo
// generado que muestra la web para productos sin foto no sirve — es un SVG por
// producto, no una fotografía del artículo, y Merchant Center lo rechaza.
function isEligible(p) {
  return Boolean(absolute(p.image_url)) && Number(p.price) > 0 && p.name;
}

function partition(products) {
  const eligible = [];
  const excluded = [];
  for (const p of products) (isEligible(p) ? eligible : excluded).push(p);
  return { eligible, excluded };
}

const esc = (s) =>
  String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

// Los feeds no admiten HTML en la descripción y cortan a 5000 caracteres.
const plain = (s, max = 4900) =>
  String(s || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);

const availability = (p) => (p.stock > 0 ? 'in stock' : 'out of stock');
const priceOf = (p) => `${decimal(p.price)} ${site.currency}`;

function googleXml(products) {
  const { eligible } = partition(products);
  const items = eligible
    .map((p) => {
      const description = plain(p.description) || `${p.name} — ${site.tagline}.`;
      return `    <item>
      <g:id>${esc(p.id)}</g:id>
      <g:title>${esc(plain(p.name, 145))}</g:title>
      <g:description>${esc(description)}</g:description>
      <g:link>${esc(site.url(`/producto/${p.id}`))}</g:link>
      <g:image_link>${esc(absolute(p.image_url))}</g:image_link>
      <g:availability>${availability(p)}</g:availability>
      <g:price>${esc(priceOf(p))}</g:price>
      <g:condition>new</g:condition>
      <g:brand>${esc(site.name)}</g:brand>
      <g:product_type>${esc(p.category || 'Plantas')}</g:product_type>
      <g:google_product_category>2802</g:google_product_category>
      <g:identifier_exists>no</g:identifier_exists>
    </item>`;
    })
    .join('\n');

  // `identifier_exists: no` es obligatorio: un vivero no tiene código de barras
  // por planta, y sin declararlo Merchant Center rechaza la fila por falta de
  // GTIN. `2802` es la categoría "Home & Garden > Plants" del taxonomía Google.
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
  <channel>
    <title>${esc(site.name)}</title>
    <link>${esc(site.baseUrl)}</link>
    <description>${esc(site.description)}</description>
${items}
  </channel>
</rss>
`;
}

const cell = (s) => {
  const v = String(s == null ? '' : s);
  return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
};

function tiktokCsv(products) {
  const { eligible } = partition(products);
  const header = [
    'sku_id',
    'title',
    'description',
    'availability',
    'condition',
    'price',
    'link',
    'image_link',
    'brand',
    'product_type',
    'quantity'
  ];
  const rows = eligible.map((p) =>
    [
      p.id,
      plain(p.name, 145),
      plain(p.description) || `${p.name} — ${site.tagline}.`,
      availability(p),
      'new',
      priceOf(p),
      site.url(`/producto/${p.id}`),
      absolute(p.image_url),
      site.name,
      p.category || 'Plantas',
      Math.max(0, Number(p.stock) || 0)
    ]
      .map(cell)
      .join(',')
  );
  return [header.join(','), ...rows].join('\n') + '\n';
}

module.exports = { partition, googleXml, tiktokCsv };
