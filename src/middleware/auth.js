function attachUser(req, res, next) {
  res.locals.currentUser = req.session.user || null;
  next();
}

// Cambia el ID de sesión al iniciar sesión o registrarse, conservando el
// carrito si ya existía. Sin esto, una sesión anónima previa (con su cookie
// ya emitida, por ejemplo por haber agregado algo al carrito) seguiría
// siendo válida después de autenticar con el mismo ID — eso es fijación de
// sesión: quien conociera ese ID de antemano heredaría la sesión ya logueada.
function regenerateSession(req) {
  const cart = req.session.cart;
  return new Promise((resolve, reject) => {
    req.session.regenerate((err) => {
      if (err) return reject(err);
      if (cart) req.session.cart = cart;
      resolve();
    });
  });
}

function requireLogin(req, res, next) {
  if (!req.session.user) {
    req.session.returnTo = req.originalUrl;
    return res.redirect('/ingresar');
  }
  next();
}

// Vida máxima de una sesión de administrador, contada desde que se autenticó y
// no desde la última visita. La cookie del cliente dura una semana porque un
// carrito abandonado no le hace daño a nadie; el panel, en cambio, ve todos los
// pedidos y los datos personales de todos los clientes, y una sesión olvidada
// en un portátil ajeno no debería seguir abierta al día siguiente.
const ADMIN_SESSION_MAX_AGE = 1000 * 60 * 60 * 12; // 12 horas

function requireAdmin(req, res, next) {
  const user = req.session.user;
  if (!user || user.role !== 'admin') {
    return res.redirect('/admin/ingresar');
  }

  // Una sesión de admin sin marca de nacimiento es anterior a esta regla, o
  // llegó por un camino que no pasó por el formulario de ingreso. En los dos
  // casos se vuelve a pedir la contraseña.
  const born = req.session.adminSince;
  if (!born || Date.now() - born > ADMIN_SESSION_MAX_AGE) {
    return req.session.regenerate(() => res.redirect('/admin/ingresar'));
  }

  next();
}

module.exports = {
  attachUser,
  requireLogin,
  requireAdmin,
  regenerateSession,
  ADMIN_SESSION_MAX_AGE
};
