const rateLimit = require('express-rate-limit');

// Nota: el conteo vive en memoria del proceso. En Vercel cada instancia
// serverless tiene su propio contador, así que esto no es un límite global
// perfecto — pero sí frena eficazmente los intentos automatizados normales,
// que es lo que importa para un sitio de este tamaño.

// Los archivos que sirve `express.static` no pasan por aquí (van antes), así
// que el techo global se gasta en páginas, no en el CSS ni en las fotos.
const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Demasiadas peticiones. Espera un momento.'
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  // Un intento acertado no gasta cupo: quien tiene la contraseña correcta no
  // debería quedar bloqueado por haberse equivocado antes, y el límite queda
  // enteramente reservado para quien está probando.
  skipSuccessfulRequests: true,
  message: 'Demasiados intentos de ingreso. Espera unos minutos e inténtalo de nuevo.'
});

// La puerta del panel se trata aparte y más estricta. Detrás de ella está el
// catálogo entero, los pedidos y los datos personales de los clientes, y solo
// hay una persona que necesita entrar: nadie legítimo falla cinco veces.
const adminLoginLimiter = rateLimit({
  windowMs: 30 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: 'Demasiados intentos. Esta cuenta queda bloqueada por 30 minutos desde esta dirección.'
});

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Demasiadas cuentas creadas desde aquí. Espera un rato e inténtalo de nuevo.'
});

const checkoutLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Demasiados pedidos seguidos. Espera un momento e inténtalo de nuevo.'
});

// Cambiar la contraseña exige la actual. Sin tope, esa comprobación se
// convierte en un oráculo para adivinarla desde una sesión ya abierta.
const passwordChangeLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Demasiados intentos de cambio de contraseña. Espera un rato.'
});

module.exports = {
  globalLimiter,
  loginLimiter,
  adminLoginLimiter,
  registerLimiter,
  checkoutLimiter,
  passwordChangeLimiter
};
