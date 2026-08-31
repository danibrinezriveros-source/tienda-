// Las rutas que nadie visita y de las que depende todo el alcance.
//
// Ningún cliente abre /robots.txt ni /feeds/google.xml. Los abren el rastreador
// de Google, el de TikTok y los sistemas de catálogo que arman los anuncios de
// producto. Si estos archivos no existen, la tienda se puede anunciar igual,
// pero solo con anuncios de texto escritos a mano: nada de Shopping, nada de
// catálogo dinámico, nada de remarketing por producto.

const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const site = require('../config/site');
const feeds = require('../config/feeds');

// Rutas de contenido que sí deben indexarse. El resto de la tienda —carrito,
// checkout, cuenta, admin— es privado o irrelevante para un buscador, y dejarlo
// abierto solo gasta presupuesto de rastreo en páginas que nunca serán un
// destino de anuncio.
const PUBLIC_PATHS = [
  { path: '/', priority: '1.0', changefreq: 'daily' },
  { path: '/guias', priority: '0.8', changefreq: 'monthly' },
  { path: '/asistente', priority: '0.8', changefreq: 'monthly' },
  { path: '/sobre-arborea', priority: '0.6', changefreq: 'yearly' },
  { path: '/contacto', priority: '0.6', changefreq: 'yearly' },
  { path: '/envios-y-devoluciones', priority: '0.4', changefreq: 'yearly' },
  { path: '/terminos', priority: '0.3', changefreq: 'yearly' },
  { path: '/privacidad', priority: '0.3', changefreq: 'yearly' }
];

const PRIVATE_PATHS = [
  '/admin',
  '/carrito',
  '/checkout',
  '/mis-pedidos',
  '/cuenta',
  '/ingresar',
  '/registrarse',
  '/salir'
];

router.get('/robots.txt', (req, res) => {
  res.type('text/plain');

  // En localhost y en cada preview de Vercel el sitio se cierra entero. Un
  // dominio de preview indexado compite con el real por las mismas palabras y
  // puede terminar siendo el que reciba el clic del anuncio.
  if (!site.isPublic) {
    return res.send('User-agent: *\nDisallow: /\n');
  }

  const lines = ['User-agent: *'];
  PRIVATE_PATHS.forEach((p) => lines.push(`Disallow: ${p}`));
  lines.push('');
  lines.push(`Sitemap: ${site.url('/sitemap.xml')}`);
  res.send(lines.join('\n') + '\n');
});

router.get('/sitemap.xml', async (req, res, next) => {
  try {
    const { rows: products } = await pool.query(
      'SELECT id, updated_at FROM products WHERE active = TRUE ORDER BY updated_at DESC'
    );

    const entry = (loc, opts = {}) =>
      `  <url>\n    <loc>${loc}</loc>` +
      (opts.lastmod ? `\n    <lastmod>${opts.lastmod}</lastmod>` : '') +
      (opts.changefreq ? `\n    <changefreq>${opts.changefreq}</changefreq>` : '') +
      (opts.priority ? `\n    <priority>${opts.priority}</priority>` : '') +
      '\n  </url>';

    const urls = [
      ...PUBLIC_PATHS.map((p) => entry(site.url(p.path), p)),
      ...products.map((p) =>
        entry(site.url(`/producto/${p.id}`), {
          lastmod: new Date(p.updated_at).toISOString().slice(0, 10),
          changefreq: 'weekly',
          priority: '0.9'
        })
      )
    ];

    res.type('application/xml');
    res.send(
      `<?xml version="1.0" encoding="UTF-8"?>\n` +
        `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`
    );
  } catch (err) {
    next(err);
  }
});

// El catálogo que leen las plataformas. Se consulta en vivo para que un producto
// agotado deje de anunciarse en la siguiente lectura del feed en vez de seguir
// llevando clics pagados a una ficha sin stock.
async function catalog() {
  const { rows } = await pool.query(
    'SELECT id, name, description, price, stock, category, image_url FROM products WHERE active = TRUE ORDER BY id'
  );
  return rows;
}

// Una hora de caché: las plataformas releen el feed una o dos veces al día, y
// este margen evita que cada reintento vuelva a golpear la base de datos.
const FEED_CACHE = 'public, max-age=3600';

router.get('/feeds/google.xml', async (req, res, next) => {
  try {
    res.type('application/xml').set('Cache-Control', FEED_CACHE);
    res.send(feeds.googleXml(await catalog()));
  } catch (err) {
    next(err);
  }
});

router.get('/feeds/tiktok.csv', async (req, res, next) => {
  try {
    res.type('text/csv; charset=utf-8').set('Cache-Control', FEED_CACHE);
    res.send(feeds.tiktokCsv(await catalog()));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
