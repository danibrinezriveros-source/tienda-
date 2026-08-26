require('dotenv').config();
const express = require('express');
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
      secure: process.env.NODE_ENV === 'production'
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
  res.status(500).render('error', { message: err.message });
});

module.exports = app;
