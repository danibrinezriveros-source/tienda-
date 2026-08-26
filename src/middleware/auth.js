function attachUser(req, res, next) {
  res.locals.currentUser = req.session.user || null;
  next();
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

module.exports = { attachUser, requireLogin, requireAdmin };
