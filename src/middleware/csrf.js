const crypto = require('crypto');

// Protección contra falsificación de petición entre sitios (CSRF).
//
// La cookie de sesión ya viaja con `sameSite: 'lax'`, y eso impide que un
// formulario alojado en otro dominio dispare un POST con la sesión del
// visitante. Pero es una sola línea de defensa, la aplica el navegador y no
// cubre lo que venga desde un subdominio del propio sitio. Este token es la
// segunda, y esta sí la aplica el servidor: una escritura solo se acepta si el
// formulario que la originó lo imprimió él.
//
// Es un token de sincronización. El secreto vive en la sesión —que el atacante
// no puede leer ni adivinar— y se copia en un campo oculto de cada formulario.

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const FIELD = '_csrf';

// Las rutas que reciben archivos llegan como `multipart/form-data`, y ese
// cuerpo no lo entiende `express.urlencoded`: lo parsea multer, ya dentro de la
// ruta y por lo tanto después de este middleware. Para esas tres la
// verificación se aplaza hasta que el cuerpo exista, y la ruta llama a `verify`
// justo después de multer.
//
// Cualquier otro multipart se rechaza aquí mismo. Sin esa lista cerrada,
// declarar `enctype="multipart/form-data"` sería la forma de saltarse el
// control: bastaría con enviar cualquier POST como archivo.
const MULTIPART_ROUTES = [
  '/admin/productos/nuevo',
  '/admin/productos/importar',
  /^\/admin\/productos\/[0-9]+\/editar$/
];

function isMultipartRoute(path) {
  return MULTIPART_ROUTES.some((r) => (typeof r === 'string' ? r === path : r.test(path)));
}

// El secreto se crea la primera vez que alguien lo pide, no en cada visita.
// Generarlo siempre obligaría a guardar una sesión por cada visitante anónimo
// —incluidos los rastreadores— y anularía el `saveUninitialized: false` que
// mantiene limpia la tabla de sesiones.
function issue(req) {
  if (!req.session.csrfSecret) {
    req.session.csrfSecret = crypto.randomBytes(32).toString('hex');
  }
  return req.session.csrfSecret;
}

// Comparación en tiempo constante: comparar con `===` filtra, por el tiempo que
// tarda en fallar, cuántos caracteres iniciales acertó quien está probando.
function matches(sent, expected) {
  const a = Buffer.from(String(sent == null ? '' : sent), 'utf8');
  const b = Buffer.from(String(expected == null ? '' : expected), 'utf8');
  if (a.length === 0 || a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function reject(res) {
  return res.status(403).render('error', {
    message:
      'El formulario expiró o no venía de esta página. Vuelve atrás, recarga y envíalo otra vez.'
  });
}

// Verifica el token contra el secreto que ya existía en la sesión. Nunca lo
// crea: si no hay secreto, es que este navegador jamás recibió un formulario
// nuestro, y entonces no hay nada legítimo que verificar.
function verify(req, res, next) {
  const sent = (req.body && req.body[FIELD]) || req.get('x-csrf-token');
  if (!req.session.csrfSecret || !matches(sent, req.session.csrfSecret)) return reject(res);
  next();
}

function csrf(req, res, next) {
  // Se expone como propiedad calculada para que el secreto solo nazca cuando
  // una vista realmente imprime un formulario.
  Object.defineProperty(res.locals, 'csrfToken', {
    configurable: true,
    enumerable: true,
    get: () => issue(req)
  });

  if (SAFE_METHODS.has(req.method)) return next();

  const type = req.get('content-type') || '';
  if (type.startsWith('multipart/form-data')) {
    if (!isMultipartRoute(req.path)) return reject(res);
    return next();
  }

  return verify(req, res, next);
}

module.exports = { csrf, verify, FIELD };
