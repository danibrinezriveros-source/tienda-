const rateLimit = require('express-rate-limit');

// Nota: el conteo vive en memoria del proceso. En Vercel cada instancia
// serverless tiene su propio contador, así que esto no es un límite global
// perfecto — pero sí frena eficazmente los intentos automatizados normales,
// que es lo que importa para un sitio de este tamaño.

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Demasiados intentos de ingreso. Espera unos minutos e inténtalo de nuevo.'
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

module.exports = { loginLimiter, registerLimiter, checkoutLimiter };
