const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const router = express.Router();
const { pool } = require('../db');
const {
  loginLimiter,
  registerLimiter,
  passwordChangeLimiter,
  passwordResetLimiter
} = require('../middleware/rateLimit');
const { regenerateSession, requireLogin } = require('../middleware/auth');
const { revokeOtherSessions } = require('../utils/sessions');
const mailer = require('../config/mailer');
const site = require('../config/site');
const audit = require('../utils/audit');

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

    // Se cierran todas las demás sesiones de esta cuenta, no solo la de aquí.
    // Si el motivo del cambio es que alguien más conocía la contraseña, su
    // cookie deja de servir en este mismo instante y no dentro de siete días.
    const user = req.session.user;
    await revokeOtherSessions(user.id, req.sessionID);
    await regenerateSession(req);
    req.session.user = user;

    res.render('account-password', { error: null, ok: true });
  } catch (err) {
    next(err);
  }
});

// --- Recuperar la contraseña olvidada ---
//
// Antes esto no existía: quien la olvidaba dependía de que alguien la
// restableciera a mano en la base de datos, lo cual significa que en la
// práctica perdía la cuenta y su historial de pedidos.
//
// El enlace lleva un token aleatorio del que solo se guarda el hash. Quien
// consiga leer la base de datos —una copia de seguridad extraviada— no puede
// reconstruir ningún enlace, igual que no puede reconstruir una contraseña.

const RESET_TTL_MINUTES = 60;

const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

router.get('/recuperar', (req, res) => {
  res.render('password-forgot', { error: null, sent: false });
});

router.post('/recuperar', passwordResetLimiter, async (req, res, next) => {
  try {
    const email = str(req.body.email).trim().toLowerCase();
    if (!EMAIL_RE.test(email)) {
      return res.status(400).render('password-forgot', {
        error: 'Escribe un correo válido.',
        sent: false
      });
    }

    const { rows } = await pool.query(
      'SELECT id, name FROM users WHERE email = $1 AND role = $2',
      [email, 'user']
    );
    const user = rows[0];

    if (user) {
      // Los enlaces anteriores de esta cuenta se anulan: pedir uno nuevo tiene
      // que invalidar el viejo, o un enlace olvidado en una bandeja sigue
      // sirviendo durante una hora más.
      await pool.query(
        'UPDATE password_resets SET used_at = NOW() WHERE user_id = $1 AND used_at IS NULL',
        [user.id]
      );

      const token = crypto.randomBytes(32).toString('base64url');
      await pool.query(
        `INSERT INTO password_resets (token_hash, user_id, expires_at)
         VALUES ($1, $2, NOW() + ($3 || ' minutes')::interval)`,
        [hashToken(token), user.id, String(RESET_TTL_MINUTES)]
      );

      const link = site.url('/restablecer/' + token);
      await mailer.send({
        to: email,
        subject: `Recuperar tu contraseña de ${site.name}`,
        text:
          `Hola${user.name ? ' ' + user.name : ''},\n\n` +
          `Alguien pidió recuperar la contraseña de tu cuenta en ${site.name}.\n` +
          `Si fuiste tú, abre este enlace y elige una nueva:\n\n${link}\n\n` +
          `El enlace vence en ${RESET_TTL_MINUTES} minutos y solo sirve una vez.\n\n` +
          'Si no fuiste tú, no tienes que hacer nada: tu contraseña sigue siendo la misma\n' +
          'y este enlace caducará solo.\n'
      });
    }

    // La respuesta es la misma exista o no la cuenta. Decir "ese correo no está
    // registrado" convierte este formulario en una forma cómoda de averiguar
    // quién compra aquí.
    res.render('password-forgot', { error: null, sent: true });
  } catch (err) {
    next(err);
  }
});

// Busca el token y devuelve la fila viva, o null. Un token vencido, ya usado o
// inventado son el mismo caso: no existe.
async function liveReset(token) {
  if (typeof token !== 'string' || token.length < 20 || token.length > 200) return null;
  const { rows } = await pool.query(
    `SELECT token_hash, user_id FROM password_resets
      WHERE token_hash = $1 AND used_at IS NULL AND expires_at > NOW()`,
    [hashToken(token)]
  );
  return rows[0] || null;
}

router.get('/restablecer/:token', async (req, res, next) => {
  try {
    const reset = await liveReset(req.params.token);
    if (!reset) return res.status(400).render('password-reset', { expired: true, error: null });
    res.render('password-reset', { expired: false, error: null });
  } catch (err) {
    next(err);
  }
});

router.post('/restablecer/:token', passwordResetLimiter, async (req, res, next) => {
  try {
    const reset = await liveReset(req.params.token);
    if (!reset) return res.status(400).render('password-reset', { expired: true, error: null });

    const proposed = str(req.body.new_password);
    const confirmation = str(req.body.confirm_password);

    const fail = (error) => res.status(400).render('password-reset', { expired: false, error });

    if (proposed.length < MIN_PASSWORD) {
      return fail('La contraseña debe tener al menos ' + MIN_PASSWORD + ' caracteres.');
    }
    if (proposed !== confirmation) return fail('Las dos contraseñas no coinciden.');

    const hash = await bcrypt.hash(proposed, BCRYPT_COST);

    // El token se marca usado dentro de la misma transacción que cambia la
    // contraseña: si algo falla, no queda ni contraseña nueva ni token gastado.
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, reset.user_id]);
      await client.query('UPDATE password_resets SET used_at = NOW() WHERE token_hash = $1', [
        reset.token_hash
      ]);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    // Quien recupera la contraseña normalmente lo hace porque sospecha que
    // alguien más entró. Se cierran todas las sesiones de la cuenta, sin
    // excepción, y hay que volver a entrar con la contraseña nueva.
    await revokeOtherSessions(reset.user_id, null);

    res.render('login', {
      error: null,
      notice: 'Tu contraseña quedó cambiada. Entra con la nueva.'
    });
  } catch (err) {
    next(err);
  }
});

router.post('/salir', (req, res) => {
  // La salida del panel se anota antes de destruir la sesión, que es de donde
  // sale el nombre de quien se va. Un registro que solo dice cuándo se entró
  // deja abierta la pregunta de hasta cuándo estuvo abierta la puerta.
  const user = req.session.user;
  if (user && user.role === 'admin') audit.record(req, 'salida', user.email, null);
  req.session.destroy(() => res.redirect('/'));
});

module.exports = router;
