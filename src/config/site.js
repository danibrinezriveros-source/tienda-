// Identidad pública del negocio y credenciales de medición.
//
// Todo sale de variables de entorno por dos razones: estos datos cambian sin
// tocar código (un teléfono nuevo, un pixel nuevo) y los identificadores de
// medición no deberían quedar escritos en el repositorio.
//
// Lo que hay aquí no es decorativo: Google Ads y TikTok Ads revisan el sitio
// antes de aprobar la cuenta y rechazan tiendas sin datos de contacto, sin
// políticas visibles o con precios que no se entienden.

const trim = (v) => (typeof v === 'string' ? v.trim() : '');

// La URL canónica manda en todo lo que apunta hacia afuera: los enlaces del
// sitemap, la vista previa al compartir, el `link` de cada producto en los
// feeds de catálogo. Si está mal, las plataformas rastrean un dominio que no
// es el tuyo y el anuncio lleva a ninguna parte.
function resolveBaseUrl() {
  const explicit = trim(process.env.SITE_URL);
  if (explicit) return explicit.replace(/\/+$/, '');

  // Vercel expone el dominio de producción y el de cada preview. Se prefiere
  // el de producción: el de preview cambia en cada despliegue.
  const vercelProd = trim(process.env.VERCEL_PROJECT_PRODUCTION_URL);
  if (vercelProd) return `https://${vercelProd}`;
  const vercel = trim(process.env.VERCEL_URL);
  if (vercel) return `https://${vercel}`;

  return `http://localhost:${process.env.PORT || 3000}`;
}

const baseUrl = resolveBaseUrl();

const site = {
  baseUrl,
  // `true` solo cuando el sitio ya vive en un dominio público. Mientras sea
  // localhost no tiene sentido publicar sitemap ni feeds: nadie externo puede
  // leerlos, y el robots.txt debe cerrar la puerta a los rastreadores.
  isPublic: /^https:\/\//.test(baseUrl),

  name: 'Arbórea',
  tagline: 'Plantas que encuentran su lugar',

  // La cara del sitio cuando lo ve algo que no es un navegador: la vista previa
  // del enlace compartido, la tarjeta del anuncio, los datos estructurados.
  ogImage: '/img/entrada/selva/01.jpg',
  description:
    'Arbórea es un vivero para recorrer: plantas de interior, exterior y jardín que ' +
    'habitan la escena, con su ficha de cuidado y un asistente que te ayuda a elegir.',

  // --- Datos del negocio (obligatorios para pasar la revisión de anuncios) ---
  legalName: trim(process.env.BUSINESS_LEGAL_NAME),
  taxId: trim(process.env.BUSINESS_TAX_ID), // NIT / RUT
  email: trim(process.env.BUSINESS_EMAIL) || trim(process.env.ADMIN_EMAIL),
  phone: trim(process.env.BUSINESS_PHONE), // formato internacional: +57...
  whatsapp: trim(process.env.BUSINESS_WHATSAPP),
  street: trim(process.env.BUSINESS_STREET),
  city: trim(process.env.BUSINESS_CITY),
  region: trim(process.env.BUSINESS_REGION),
  postalCode: trim(process.env.BUSINESS_POSTAL_CODE),
  country: trim(process.env.BUSINESS_COUNTRY) || 'CO',
  hours: trim(process.env.BUSINESS_HOURS),

  // --- Condiciones comerciales que las plataformas exigen por escrito ---
  currency: trim(process.env.STORE_CURRENCY) || 'COP',
  locale: 'es_CO',
  shippingDays: trim(process.env.SHIPPING_DAYS) || '2 a 5 días hábiles',
  shippingCost: trim(process.env.SHIPPING_COST_TEXT) || 'Se calcula al confirmar el pedido por WhatsApp',
  shippingArea: trim(process.env.SHIPPING_AREA) || 'Colombia',
  returnDays: Number(process.env.RETURN_DAYS) > 0 ? Number(process.env.RETURN_DAYS) : 5,

  // Redes: TikTok las usa para verificar que la marca existe fuera del sitio.
  social: [
    trim(process.env.SOCIAL_INSTAGRAM),
    trim(process.env.SOCIAL_TIKTOK),
    trim(process.env.SOCIAL_FACEBOOK)
  ].filter(Boolean),

  // --- Medición ---
  // Cada uno se activa solo: si el identificador está vacío, ese script nunca
  // se carga y su dominio nunca se abre en la política de seguridad.
  analytics: {
    ga4Id: trim(process.env.GA4_MEASUREMENT_ID), // G-XXXXXXXXXX
    googleAdsId: trim(process.env.GOOGLE_ADS_ID), // AW-XXXXXXXXX
    // Etiqueta de la conversión "compra" en Google Ads: AW-123/AbC-D_efG
    googleAdsPurchaseLabel: trim(process.env.GOOGLE_ADS_PURCHASE_LABEL),
    tiktokPixelId: trim(process.env.TIKTOK_PIXEL_ID)
  },

  // --- Verificación de propiedad del dominio ---
  verification: {
    google: trim(process.env.GOOGLE_SITE_VERIFICATION),
    tiktok: trim(process.env.TIKTOK_DOMAIN_VERIFICATION)
  }
};

site.usesGoogle = Boolean(site.analytics.ga4Id || site.analytics.googleAdsId);
site.usesTiktok = Boolean(site.analytics.tiktokPixelId);
// Mientras no haya ningún pixel configurado el sitio no instala nada de
// terceros, y entonces tampoco tiene por qué molestar con un aviso de cookies.
site.needsConsent = site.usesGoogle || site.usesTiktok;

site.url = (path = '/') => site.baseUrl + (path.startsWith('/') ? path : `/${path}`);

module.exports = site;
