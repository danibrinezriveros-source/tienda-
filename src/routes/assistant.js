const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const { recommend, BUDGET_OPTIONS, PRIORITY_OPTIONS } = require('../config/assistant');

router.get('/asistente', async (req, res, next) => {
  try {
    const { rows: categories } = await pool.query(
      'SELECT DISTINCT category FROM products WHERE active = TRUE ORDER BY category'
    );
    res.render('assistant', {
      categories,
      budgetOptions: BUDGET_OPTIONS,
      priorityOptions: PRIORITY_OPTIONS,
      results: null,
      answers: {}
    });
  } catch (err) {
    next(err);
  }
});

router.post('/asistente', async (req, res, next) => {
  try {
    const answers = {
      budget: req.body.budget || '',
      category: req.body.category || '',
      priority: req.body.priority || ''
    };
    const { rows: products } = await pool.query('SELECT * FROM products WHERE active = TRUE');
    const { rows: categories } = await pool.query(
      'SELECT DISTINCT category FROM products WHERE active = TRUE ORDER BY category'
    );
    const results = recommend(products, answers, 4);

    res.render('assistant', {
      categories,
      budgetOptions: BUDGET_OPTIONS,
      priorityOptions: PRIORITY_OPTIONS,
      results,
      answers
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
