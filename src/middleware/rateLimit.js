const rateLimit = require('express-rate-limit');
const { PostgresRateLimitStore } = require('./rateLimitStore');

// Los límites de esta tienda. El conteo vive en Postgres, no en la memoria del
// proceso: ver `rateLimitStore.js` para por qué eso importa en serverless.
//
// Cada limitador estrena su propio almacén con un prefijo distinto. Todos
// identifican al cliente por su IP, así que sin prefijo el ingreso y el
// checkout se sumarían sobre la misma clave y se bloquearían entre ellos.
function limiter(prefix, options) {
  const store = new PostgresRateLimitStore();
  store.prefix = prefix;
  return rateLimit({
    store,
    standardHeaders: true,
    legacyHeaders: false,
    ...options
  });
}

// Los archivos que sirve `express.static` no pasan por aquí (van antes), así
// que el techo global se gasta en páginas, no en el CSS ni en las fotos.
const globalLimiter = limiter('global', {
  windowMs: 60 * 1000,
  max: 300,
  message: 'Demasiadas peticiones. Espera un momento.'
});

const loginLimiter = limiter('login', {
  windowMs: 15 * 60 * 1000,
  max: 10,
  // Un intento acertado no gasta cupo: quien tiene la contraseña correcta no
  // debería quedar bloqueado por haberse equivocado antes, y el límite queda
  // enteramente reservado para quien está probando.
  skipSuccessfulRequests: true,
  message: 'Demasiados intentos de ingreso. Espera unos minutos e inténtalo de nuevo.'
});

// La puerta del panel se trata aparte y más estricta. Detrás de ella están el
// catálogo, los pedidos y los datos personales de los clientes, y solo hay una
// persona que necesita entrar: nadie legítimo falla cinco veces.
const adminLoginLimiter = limiter('admin-login', {
  windowMs: 30 * 60 * 1000,
  max: 5,
  skipSuccessfulRequests: true,
  message: 'Demasiados intentos. Esta cuenta queda bloqueada por 30 minutos desde esta dirección.'
});

// El segundo factor es un número de seis cifras: un millón de combinaciones,
// que sin límite se agotan en minutos. Este es el que convierte el segundo
// factor en un factor de verdad.
const totpLimiter = limiter('totp', {
  windowMs: 15 * 60 * 1000,
  max: 8,
  skipSuccessfulRequests: true,
  message: 'Demasiados códigos incorrectos. Espera unos minutos.'
});

const registerLimiter = limiter('register', {
  windowMs: 60 * 60 * 1000,
  max: 8,
  message: 'Demasiadas cuentas creadas desde aquí. Espera un rato e inténtalo de nuevo.'
});

const checkoutLimiter = limiter('checkout', {
  windowMs: 60 * 60 * 1000,
  max: 15,
  message: 'Demasiados pedidos seguidos. Espera un momento e inténtalo de nuevo.'
});

// Cambiar la contraseña exige la actual. Sin tope, esa comprobación se
// convierte en un oráculo para adivinarla desde una sesión ya abierta.
const passwordChangeLimiter = limiter('password-change', {
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: 'Demasiados intentos de cambio de contraseña. Espera un rato.'
});

// Pedir un enlace de recuperación. El tope no es por abuso del sitio sino por
// respeto a quien recibe el correo: sin él, esta ruta manda mensajes a la
// bandeja de cualquier persona cuyo correo alguien conozca.
const passwordResetLimiter = limiter('password-reset', {
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: 'Ya pediste varios enlaces de recuperación. Revisa tu correo y espera un rato.'
});

module.exports = {
  globalLimiter,
  loginLimiter,
  adminLoginLimiter,
  totpLimiter,
  registerLimiter,
  checkoutLimiter,
  passwordChangeLimiter,
  passwordResetLimiter
};
