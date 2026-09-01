require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const path = require('path');
const crypto = require('crypto');
const { pool } = require('./db');
const { attachUser } = require('./middleware/auth');
const { csrf } = require('./middleware/csrf');
const { globalLimiter } = require('./middleware/rateLimit');
const site = require('./config/site');
const { canonicalFor, organizationJsonLd, jsonForScript } = require('./utils/seo');
const { money } = require('./utils/money');

const app = express();

// Vercel (y la mayoría de PaaS) ponen la app detrás de un proxy que termina TLS.
// Sin esto, express-session nunca ve la request como "segura" y las cookies
// con `secure: true` se descartan en producción.
app.set('trust proxy', 1);

// El analizador de la query se deja en modo simple a propósito. El modo
// extendido acepta objetos anidados escritos en la URL (`?a[b][c]=1`) y ninguna
// ruta de esta tienda los necesita: de la query solo se leen cadenas y la lista
// repetida de categorías. Menos gramática aceptada, menos superficie.
app.set('query parser', 'simple');

const IS_PROD = process.env.NODE_ENV === 'production';

// Un secreto de sesión conocido es una llave maestra: con él se firma la cookie
// de cualquier sesión. El valor de desarrollo está escrito aquí abajo y por lo
// tanto en el repositorio, así que en producción la app se niega a arrancar sin
// uno propio. Fallar al desplegar es infinitamente preferible a descubrirlo por
// una sesión de administrador falsificada.
const SESSION_SECRET = process.env.SESSION_SECRET || (IS_PROD ? '' : 'dev-secret-cambia-esto');

if (IS_PROD && SESSION_SECRET.length < 32) {
  throw new Error(
    'SESSION_SECRET no está definida o es demasiado corta: en producción necesita al menos 32 ' +
      'caracteres aleatorios. Genera uno con:\n' +
      '  node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"'
  );
}

// Un identificador aleatorio por respuesta. Es lo único que puede ejecutarse
// en línea: los datos estructurados (JSON-LD) tienen que ir dentro del HTML
// porque es el único formato en que Google los lee, y sin nonce la política de
// seguridad los bloquearía junto con cualquier script inyectado.
app.use((req, res, next) => {
  res.locals.nonce = crypto.randomBytes(16).toString('base64');
  next();
});

// Cabeceras de seguridad. Las vistas no traen scripts ni estilos en línea
// (todo vive en /css y /js), así que la política sigue cerrada por defecto y
// solo se abre lo estrictamente necesario:
//
//   img-src     el hero, las fotos de Vercel Blob y las URLs que pega un admin.
//   script-src  el nonce del JSON-LD, y los dominios de medición SOLO cuando
//               hay un identificador configurado. Sin píxeles configurados la
//               política queda igual de cerrada que antes de existir esto.
const measurement = { script: [], connect: [], frame: [] };

if (site.usesGoogle) {
  measurement.script.push('https://www.googletagmanager.com');
  measurement.connect.push(
    'https://www.googletagmanager.com',
    'https://www.google-analytics.com',
    'https://*.google-analytics.com',
    'https://*.analytics.google.com',
    'https://*.g.doubleclick.net',
    'https://www.google.com'
  );
  // Google Ads confirma la conversión abriendo un iframe invisible hacia
  // doubleclick; sin frame-src la compra se registra a medias.
  measurement.frame.push('https://td.doubleclick.net', 'https://www.googletagmanager.com');
}

if (site.usesTiktok) {
  measurement.script.push('https://analytics.tiktok.com');
  measurement.connect.push('https://analytics.tiktok.com', 'https://*.tiktok.com');
}

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        ...helmet.contentSecurityPolicy.getDefaultDirectives(),
        'img-src': ["'self'", 'data:', 'https:'],
        'script-src': ["'self'", (req, res) => `'nonce-${res.locals.nonce}'`, ...measurement.script],
        'connect-src': ["'self'", ...measurement.connect],
        // Ni un manejador `onclick=` ni un `javascript:` en un enlace. Si
        // alguna vez se cuela texto ajeno en una vista, estas dos líneas son
        // las que impiden que ese texto llegue a ejecutarse.
        'script-src-attr': ["'none'"],
        // Un formulario de esta tienda solo puede enviarse a esta tienda: aunque
        // se lograra inyectar un `<form action="https://otro-sitio">`, el
        // navegador no llevaría allí lo que el cliente escriba.
        'form-action': ["'self'"],
        // Nadie puede meter el sitio dentro de un iframe. Es lo que impide el
        // clickjacking: superponer una página transparente sobre el panel de
        // administrador para que un clic caiga donde el atacante quiere.
        'frame-ancestors': ["'none'"],
        'object-src': ["'none'"],
        'base-uri': ["'self'"],
        ...(measurement.frame.length ? { 'frame-src': ["'self'", ...measurement.frame] } : {})
      }
    },
    // El navegador debe recordar durante dos años que este dominio solo se
    // habla por HTTPS, subdominios incluidos. Sin esto, la primera visita
    // escrita a mano ("arborea.com") viaja en claro y puede ser interceptada.
    strictTransportSecurity: { maxAge: 63072000, includeSubDomains: true, preload: true },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    // Aísla el sitio de otras pestañas y ventanas: nada abierto desde aquí
    // conserva una referencia a esta página, y ningún recurso externo puede
    // cargarse en un contexto que comparta memoria con ella.
    crossOriginOpenerPolicy: { policy: 'same-origin' },
    crossOriginResourcePolicy: { policy: 'same-origin' }
  })
);

// Capacidades del navegador que esta tienda no usa jamás. Declararlas apagadas
// significa que ni siquiera un script inyectado podría pedirlas.
app.use((req, res, next) => {
  res.setHeader(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()'
  );
  next();
});

// Un techo de peticiones para todo el sitio. Los límites finos siguen viviendo
// en el ingreso, el registro y el checkout; este es el que impide que alguien
// recorra el catálogo entero miles de veces por minuto o pruebe rutas a ciegas.
app.use(globalLimiter);

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Los formularios de esta tienda son planos: campos de texto, nada anidado. Con
// `extended: false` el cuerpo se parsea con el módulo `querystring` de Node en
// vez de `qs`, que acepta objetos anidados y arrays escritos en el nombre del
// campo. El tope de tamaño y de número de campos evita que un POST inventado
// llegue con un cuerpo desmedido antes de que ninguna ruta lo mire.
app.use(express.urlencoded({ extended: false, limit: '64kb', parameterLimit: 200 }));
app.use(express.json({ limit: '16kb' }));

app.use(
  express.static(path.join(__dirname, 'public'), {
    // Los archivos estáticos son públicos y no cambian de dueño: no hay nada
    // que negociar por contenido ni ruta oculta que descubrir con un punto.
    dotfiles: 'ignore',
    index: false
  })
);

app.use(
  session({
    store: new pgSession({ pool, tableName: 'session', createTableIfMissing: true }),
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    // El prefijo `__Host-` es una promesa que el navegador hace cumplir: esta
    // cookie solo la pudo poner este mismo origen, por HTTPS y para todo el
    // sitio. Un subdominio comprometido (o alguien en la red que responda a un
    // http:// del dominio) no puede sobrescribirla, que es como se monta una
    // fijación de sesión. Solo es válido con `secure`, así que en desarrollo
    // —donde el sitio vive en http://localhost— se usa el nombre sin prefijo.
    name: IS_PROD ? '__Host-arborea.sid' : 'arborea.sid',
    cookie: {
      maxAge: 1000 * 60 * 60 * 24 * 7, // 7 días
      secure: IS_PROD,
      httpOnly: true,
      sameSite: 'lax',
      path: '/'
    }
  })
);

app.use(attachUser);

app.use((req, res, next) => {
  res.locals.cartCount = (req.session.cart || []).reduce((n, i) => n + i.quantity, 0);
  next();
});

// Contexto que toda vista necesita para presentarse hacia afuera: quién es la
// tienda, cuál es la dirección definitiva de esta página (la que se indexa y a
// la que apunta el anuncio) y qué datos estructurados la describen.
const NO_INDEX = /^\/(admin|carrito|checkout|mis-pedidos|cuenta|ingresar|registrarse)/;

app.use((req, res, next) => {
  res.locals.site = site;
  // Un precio se escribe igual en toda la tienda y en el panel. Cuando cada
  // vista traía su propio formato, el suyo redondeaba.
  res.locals.money = money;
  // Lo único que las vistas imprimen sin escapar son bloques de JSON, y los
  // imprimen con esto: serializa y neutraliza de paso los caracteres que el
  // analizador de HTML podría leer como etiquetas.
  res.locals.jsonForScript = jsonForScript;
  res.locals.canonical = canonicalFor(req);
  res.locals.jsonLd = [organizationJsonLd()];
  res.locals.noindex = NO_INDEX.test(req.path);
  res.locals.trackEvents = [];

  // Media tienda avanza por redirecciones (agregar al carrito responde con un
  // 302, el checkout termina en otra URL), y en una redirección no hay HTML
  // donde colgar el evento. Por eso los eventos que nacen en un POST se dejan
  // en la sesión y se recogen aquí, en el primer render que ocurra después.
  const render = res.render.bind(res);
  res.render = (view, opts, cb) => {
    const queued = (req.session && req.session.trackQueue) || [];
    if (queued.length) req.session.trackQueue = [];
    res.locals.trackEvents = queued.concat(res.locals.trackEvents || []);
    return render(view, opts, cb);
  };

  next();
});

// A partir de aquí ninguna escritura se acepta sin el token que imprimió esta
// misma tienda. Va después de la sesión —de donde sale el secreto— y de los
// locales de vista, porque su respuesta de rechazo es una página completa y
// necesita saber quién es la tienda para dibujarse. Y va antes de cualquier
// ruta, para que ninguna quede fuera por olvido.
app.use(csrf);

app.use('/', require('./routes/seo'));
app.use('/', require('./routes/index'));
app.use('/', require('./routes/auth'));
app.use('/', require('./routes/orders'));
app.use('/', require('./routes/assistant'));
app.use('/admin', require('./routes/admin'));

app.use((req, res) => {
  res.status(404).render('404');
});

app.use((err, req, res, next) => {
  console.error(err);
  // En producción no se muestra err.message: puede filtrar detalles internos
  // (por ejemplo, el texto exacto de un error de Postgres) a quien esté
  // probando entradas raras a propósito. El detalle real solo queda en logs.
  const message =
    process.env.NODE_ENV === 'production'
      ? 'Ocurrió un error inesperado. Ya quedó registrado, intenta de nuevo en un momento.'
      : err.message;
  res.status(500).render('error', { message });
});

module.exports = app;
