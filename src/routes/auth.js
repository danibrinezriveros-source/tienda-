const express = require('express');
const bcrypt = require('bcryptjs');
const router = express.Router();
const { pool } = require('../db');
const { loginLimiter, registerLimiter, passwordChangeLimiter } = require('../middleware/rateLimit');
const { regenerateSession, requireLogin } = require('../middleware/auth');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Coste de bcrypt. Cada punto duplica el trabajo de calcular un hash: para
// quien entra una vez son milisegundos, para quien prueba millones de
// contraseñas robadas es la diferencia entre horas y años.
const BCRYPT_COST = 12;

// Longitud mínima. Ocho caracteres era lo que recomendaban los manuales cuando
// las tarjetas gráficas no probaban miles de millones de combinaciones por
// segundo; hoy la única defensa real de una contraseña es que sea larga.
const MIN_PASSWORD = 10;

// Hash de una contraseña que no es de nadie. Se compara contra él cuando el
// correo no existe, para que responder cueste exactamente lo mismo en los dos
// casos. Sin esto, el tiempo de respuesta delata cuáles de una lista de correos
// tienen cuenta aquí.
const DUMMY_HASH = bcrypt.hashSync('contrasena-que-no-pertenece-a-nadie', BCRYPT_COST);

const str = (v) => (typeof v === 'string' ? v : '');

router.get('/registrarse', (req, res) => {
  res.render('register', { error: null, form: {} });
});

router.post('/registrarse', registerLimiter, async (req, res, next) => {
  try {
    const name = str(req.body.name).trim();
    const email = str(req.body.email).trim().toLowerCase();
    const password = str(req.body.password);
    const phone = str(req.body.phone).trim();
    const { accept_terms } = req.body;

    // El formulario vuelve a la vista sin la contraseña. Reimprimirla la deja
    // en el HTML, y ese HTML acaba en el historial del navegador.
    const form = { name, email, phone };

    if (!name || !email || !password) {
      return res.render('register', { error: 'Completa todos los campos obligatorios.', form });
    }
    if (!EMAIL_RE.test(email) || email.length > 150) {
      return res.render('register', { error: 'Ese correo no parece válido.', form });
    }
    if (password.length < MIN_PASSWORD) {
      return res.render('register', {
        error: 'La contraseña debe tener al menos ' + MIN_PASSWORD + ' caracteres.',
        form
      });
    }
    if (password.length > 200) {
      return res.render('register', { error: 'Esa contraseña es demasiado larga.', form });
    }
    if (accept_terms !== 'on') {
      return res.render('register', {
        error: 'Debes aceptar la política de tratamiento de datos personales para crear tu cuenta.',
        form
      });
    }

    const hash = await bcrypt.hash(password, BCRYPT_COST);

    // La unicidad del correo la decide la base de datos, no una consulta
    // previa: entre un SELECT y un INSERT caben dos registros simultáneos con
    // el mismo correo. El índice único de `users.email` es el que no se puede
    // esquivar por sincronización.
    let rows;
    try {
      ({ rows } = await pool.query(
        `INSERT INTO users (name, email, password_hash, phone, role, terms_accepted_at)
         VALUES ($1,$2,$3,$4,'user',NOW()) RETURNING id, name, email, role`,
        [name.slice(0, 150), email, hash, phone.slice(0, 30) || null]
      ));
    } catch (err) {
      if (err.code === '23505') {
        return res.render('register', { error: 'Ya existe una cuenta con ese correo.', form });
      }
      throw err;
    }

    await regenerateSession(req);
    req.session.user = rows[0];
    res.redirect('/');
  } catch (err) {
    next(err);
  }
});

router.get('/ingresar', (req, res) => {
  res.render('login', { error: null });
});

router.post('/ingresar', loginLimiter, async (req, res, next) => {
  try {
    const email = str(req.body.email).trim().toLowerCase();
    const password = str(req.body.password);

    const { rows } = await pool.query('SELECT * FROM users WHERE email = $1 AND role = $2', [
      email,
      'user'
    ]);
    const user = rows[0];

    // bcrypt se ejecuta siempre, exista o no la cuenta. Ver `DUMMY_HASH`.
    const okPassword = await bcrypt.compare(password, user ? user.password_hash : DUMMY_HASH);

    if (!user || !okPassword) {
      return res.status(401).render('login', { error: 'Correo o contraseña incorrectos.' });
    }

    // El destino se acepta solo si es una ruta interna. Hoy `returnTo` lo
    // escribe esta misma app, pero basta con que alguna ruta futura lo tome de
    // la query para convertirlo en una redirección abierta: el enlace parecería
    // de la tienda y llevaría a una copia del formulario de ingreso en otro
    // dominio. `/\/(?!\/)/` descarta `//otro-sitio.com`, que el navegador lee
    // como una dirección absoluta.
    const wanted = req.session.returnTo;
    const dest = typeof wanted === 'string' && /^\/(?!\/)/.test(wanted) ? wanted : '/';

    await regenerateSession(req);
    req.session.user = { id: user.id, name: user.name, email: user.email, role: user.role };
    res.redirect(dest);
  } catch (err) {
    next(err);
  }
});

// --- Cambiar la contraseña ---
//
// Antes no existía. Quien sospechara que su clave se había filtrado —o la
// hubiera reutilizado en un servicio con una fuga conocida— no tenía nada que
// hacer al respecto, y la política de privacidad promete justamente poder
// rectificar y proteger los datos de la cuenta.

router.get('/cuenta/contrasena', requireLogin, (req, res) => {
  res.render('account-password', { error: null, ok: false });
});

router.post('/cuenta/contrasena', requireLogin, passwordChangeLimiter, async (req, res, next) => {
  try {
    const current = str(req.body.current_password);
    const proposed = str(req.body.new_password);
    const confirmation = str(req.body.confirm_password);

    const fail = (error) => res.status(400).render('account-password', { error, ok: false });

    if (proposed.length < MIN_PASSWORD) {
      return fail('La nueva contraseña debe tener al menos ' + MIN_PASSWORD + ' caracteres.');
    }
    if (proposed !== confirmation) {
      return fail('La nueva contraseña y su confirmación no coinciden.');
    }

    const { rows } = await pool.query('SELECT password_hash FROM users WHERE id = $1', [
      req.session.user.id
    ]);
    if (!rows[0] || !(await bcrypt.compare(current, rows[0].password_hash))) {
      return fail('La contraseña actual no es correcta.');
    }
    if (await bcrypt.compare(proposed, rows[0].password_hash)) {
      return fail('La nueva contraseña tiene que ser distinta de la actual.');
    }

    const hash = await bcrypt.hash(proposed, BCRYPT_COST);
    await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [
      hash,
      req.session.user.id
    ]);

    // Sesión nueva: si el motivo del cambio es que alguien más conocía la
    // anterior, su cookie deja de servir en este mismo instante.
    const user = req.session.user;
    await regenerateSession(req);
    req.session.user = user;

    res.render('account-password', { error: null, ok: true });
  } catch (err) {
    next(err);
  }
});

router.post('/salir', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

module.exports = router;
