require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const path = require('path');
const { pool } = require('./db');
const { attachUser } = require('./middleware/auth');

const app = express();

// Vercel (y la mayoría de PaaS) ponen la app detrás de un proxy que termina TLS.
// Sin esto, express-session nunca ve la request como "segura" y las cookies
// con `secure: true` se descartan en producción.
app.set('trust proxy', 1);

// Cabeceras de seguridad. No hay scripts ni estilos inline en ninguna vista
// (todo vive en /css y /js), así que se puede dejar la política por defecto
// de helmet (script-src 'self', sin unsafe-inline) — solo se amplía img-src
// porque el hero, las fotos subidas a Vercel Blob y las URLs de imagen que
// un admin pueda pegar a mano vienen de hosts externos.
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        ...helmet.contentSecurityPolicy.getDefaultDirectives(),
        'img-src': ["'self'", 'data:', 'https:']
      }
    }
  })
);

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use(
  session({
    store: new pgSession({ pool, tableName: 'session', createTableIfMissing: true }),
    secret: process.env.SESSION_SECRET || 'dev-secret-cambia-esto',
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 1000 * 60 * 60 * 24 * 7, // 7 días
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      sameSite: 'lax'
    }
  })
);

app.use(attachUser);

app.use((req, res, next) => {
  res.locals.cartCount = (req.session.cart || []).reduce((n, i) => n + i.quantity, 0);
  next();
});

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
