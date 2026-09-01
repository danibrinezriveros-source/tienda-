const { pool } = require('../db');

// Contador de peticiones compartido, guardado en Postgres.
//
// El contador en memoria que traía `express-rate-limit` funciona en un servidor
// que es un solo proceso. En Vercel no lo es: cada invocación puede caer en una
// instancia distinta, y cada instancia arranca su propio contador desde cero.
// Un límite de cinco intentos de ingreso pasaba a ser cinco *por instancia*,
// que en la práctica es ninguno — quien prueba contraseñas en serie provoca
// justamente que la plataforma abra instancias nuevas.
//
// La base de datos ya es el único punto que todas las instancias comparten, así
// que el conteo vive ahí. Cada ventana es una fila que se reinicia sola cuando
// caduca, dentro del mismo `INSERT ... ON CONFLICT` — sin lecturas previas ni
// transacciones, para que dos peticiones simultáneas no puedan contar una sola.
class PostgresRateLimitStore {
  constructor() {
    this.windowMs = 60 * 1000;
    // Nombre distinto por limitador, para que el del ingreso y el del checkout
    // no se sumen sobre la misma clave (los dos usan la IP como identificador).
    this.prefix = 'rl';
  }

  init(options) {
    this.windowMs = options.windowMs;
  }

  key(raw) {
    return `${this.prefix}:${raw}`;
  }

  async increment(raw) {
    const { rows } = await pool.query(
      `INSERT INTO rate_limits (key, hits, expires_at)
            VALUES ($1, 1, NOW() + ($2 || ' milliseconds')::interval)
       ON CONFLICT (key) DO UPDATE SET
            hits = CASE WHEN rate_limits.expires_at <= NOW() THEN 1
                        ELSE rate_limits.hits + 1 END,
            expires_at = CASE WHEN rate_limits.expires_at <= NOW()
                              THEN NOW() + ($2 || ' milliseconds')::interval
                              ELSE rate_limits.expires_at END
       RETURNING hits, expires_at`,
      [this.key(raw), String(this.windowMs)]
    );

    this.sweep();

    return { totalHits: rows[0].hits, resetTime: new Date(rows[0].expires_at) };
  }

  // Devolver un intento: lo usa `skipSuccessfulRequests` para no gastarle cupo
  // a quien acertó la contraseña.
  async decrement(raw) {
    await pool.query(
      'UPDATE rate_limits SET hits = GREATEST(hits - 1, 0) WHERE key = $1 AND expires_at > NOW()',
      [this.key(raw)]
    );
  }

  async get(raw) {
    const { rows } = await pool.query(
      'SELECT hits, expires_at FROM rate_limits WHERE key = $1 AND expires_at > NOW()',
      [this.key(raw)]
    );
    if (!rows[0]) return undefined;
    return { totalHits: rows[0].hits, resetTime: new Date(rows[0].expires_at) };
  }

  async resetKey(raw) {
    await pool.query('DELETE FROM rate_limits WHERE key = $1', [this.key(raw)]);
  }

  async resetAll() {
    await pool.query('DELETE FROM rate_limits');
  }

  // Las filas caducadas no estorban —toda consulta compara contra NOW()— pero
  // se acumularían para siempre. Se barren de vez en cuando, no en cada
  // petición: una de cada cien basta para que la tabla no crezca, y no le cobra
  // un DELETE a cada visitante. Va sin `await` a propósito: la limpieza no debe
  // retrasar la respuesta, y si falla no cambia nada del resultado.
  sweep() {
    if (Math.random() > 0.01) return;
    pool
      .query('DELETE FROM rate_limits WHERE expires_at < NOW() - INTERVAL \'1 hour\'')
      .catch((err) => console.error('Limpieza de rate_limits:', err.message));
  }
}

// `localKeys: false` le dice a express-rate-limit que este almacén es
// compartido, y así deja de advertir sobre doble conteo entre instancias.
PostgresRateLimitStore.prototype.localKeys = false;

module.exports = { PostgresRateLimitStore };
