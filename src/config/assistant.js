/**
 * Asistente de compra por reglas (sin costo, sin dependencias externas).
 * Recibe las respuestas del cliente (presupuesto, categoría/uso, prioridad)
 * y devuelve productos ordenados por afinidad + una frase explicando el porqué.
 */

function scoreProduct(product, answers) {
  let score = 0;
  const reasons = [];
  const tags = (product.tags || '').toLowerCase();
  const price = Number(product.price);

  // Presupuesto
  if (answers.budget) {
    const [min, max] = answers.budget.split('-').map(Number);
    if (price >= min && (Number.isNaN(max) || price <= max)) {
      score += 3;
      reasons.push('encaja en tu presupuesto');
    } else if (price < min) {
      score += 1; // más barato de lo esperado, sigue siendo válido
    } else {
      score -= 2; // se pasa del presupuesto
    }
  }

  // Categoría / uso
  if (answers.category && product.category === answers.category) {
    score += 3;
    reasons.push('coincide con lo que buscas');
  }

  // Prioridad declarada por el cliente (rapidez, economico, cobertura, exterior, etc.)
  if (answers.priority && tags.includes(answers.priority.toLowerCase())) {
    score += 2;
    reasons.push(`ideal si tu prioridad es "${answers.priority}"`);
  }

  // Disponibilidad
  if (product.stock > 0) {
    score += 1;
  } else {
    score -= 5;
    reasons.push('sin stock por ahora');
  }

  return { score, reasons };
}

function recommend(products, answers, limit = 3) {
  const ranked = products
    .map((p) => {
      const { score, reasons } = scoreProduct(p, answers);
      return { product: p, score, reasons };
    })
    .filter((r) => r.product.stock > 0)
    .sort((a, b) => b.score - a.score);

  return ranked.slice(0, limit).map((r) => ({
    ...r.product,
    why: r.reasons.length
      ? `Te lo recomendamos porque ${r.reasons.join(' y ')}.`
      : 'Podría interesarte según tu búsqueda.'
  }));
}

const BUDGET_OPTIONS = [
  { value: '0-20', label: 'Hasta $20' },
  { value: '20-50', label: '$20 – $50' },
  { value: '50-120', label: '$50 – $120' },
  { value: '120-999999', label: 'Más de $120' }
];

const PRIORITY_OPTIONS = [
  { value: 'principiante', label: 'Fácil de cuidar' },
  { value: 'poca-luz', label: 'Se adapta a poca luz' },
  { value: 'exterior', label: 'Para exteriores' },
  { value: 'pet-friendly', label: 'Segura para mascotas' }
];

module.exports = { recommend, BUDGET_OPTIONS, PRIORITY_OPTIONS };
