const express = require('express');
const bcrypt = require('bcryptjs');
const router = express.Router();
const { pool } = require('../db');
const { loginLimiter, registerLimiter } = require('../middleware/rateLimit');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

router.get('/registrarse', (req, res) => {
  res.render('register', { error: null, form: {} });
});

router.post('/registrarse', registerLimiter, async (req, res, next) => {
  try {
    const { name, email, password, phone } = req.body;
    if (!name || !email || !password) {
      return res.render('register', { error: 'Completa todos los campos obligatorios.', form: req.body });
    }
    if (!EMAIL_RE.test(email)) {
      return res.render('register', { error: 'Ese correo no parece válido.', form: req.body });
    }
    if (password.length < 8) {
      return res.render('register', { error: 'La contraseña debe tener al menos 8 caracteres.', form: req.body });
    }
    const { rows: existing } = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing[0]) {
      return res.render('register', { error: 'Ya existe una cuenta con ese correo.', form: req.body });
    }
    const hash = await bcrypt.hash(password, 10);
    const { rows } = await pool.query(
      `INSERT INTO users (name, email, password_hash, phone, role)
       VALUES ($1,$2,$3,$4,'user') RETURNING id, name, email, role`,
      [name, email, hash, phone || null]
    );
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
    const { email, password } = req.body;
    const { rows } = await pool.query('SELECT * FROM users WHERE email = $1 AND role = $2', [
      email,
      'user'
    ]);
    const user = rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.render('login', { error: 'Correo o contraseña incorrectos.' });
    }
    req.session.user = { id: user.id, name: user.name, email: user.email, role: user.role };
    const dest = req.session.returnTo || '/';
    delete req.session.returnTo;
    res.redirect(dest);
  } catch (err) {
    next(err);
  }
});

router.post('/salir', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

module.exports = router;
