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

function requireAdmin(req, res, next) {
  if (!req.session.user || req.session.user.role !== 'admin') {
    return res.redirect('/admin/ingresar');
  }
  next();
}

module.exports = { attachUser, requireLogin, requireAdmin, regenerateSession };
