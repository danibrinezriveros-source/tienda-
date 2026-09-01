const { pool } = require('../db');

// Registro de lo que hace quien entra al panel.
//
// No previene nada: previene el resto del archivo. Lo que hace es contestar las
// preguntas que solo aparecen después, cuando algo ya salió mal — quién retiró
// ese producto, cuándo cambió el precio, desde dónde entró alguien a las tres
// de la mañana, si el intruso llegó a tocar los pedidos o solo miró. Sin esto,
// la respuesta honesta a todas ellas es "no se sabe".
//
// También es lo que permite darse cuenta. Un ingreso fallido suelto es ruido;
// veinte seguidos desde una dirección desconocida es un aviso.

// Lo que puede registrarse. Es una lista cerrada para que el registro se pueda
// leer y filtrar: un texto libre distinto en cada llamada acaba siendo
// imposible de consultar.
const ACTIONS = {
  ingreso: 'Ingresó al panel',
  ingreso_fallido: 'Intento de ingreso fallido',
  ingreso_2fa_fallido: 'Código de segundo factor incorrecto',
  salida: 'Cerró sesión',
  producto_creado: 'Creó un producto',
  producto_editado: 'Editó un producto',
  producto_retirado: 'Retiró un producto del catálogo',
  catalogo_importado: 'Importó catálogo por CSV',
  pedido_estado: 'Cambió el estado de un pedido',
  ajustes: 'Guardó los ajustes',
  contrasena: 'Cambió la contraseña del panel',
  totp_activado: 'Activó el segundo factor',
  totp_desactivado: 'Desactivó el segundo factor',
  totp_recuperacion: 'Entró con un código de recuperación'
};

// La dirección desde la que llegó la petición. `req.ip` ya respeta el
// `trust proxy` de la app, así que en Vercel devuelve la del visitante y no la
// del proxy. Se recorta a 45 caracteres, que es lo que ocupa una IPv6.
function addressOf(req) {
  return String(req.ip || '').slice(0, 45) || null;
}

/**
 * Anota una acción. No se espera el resultado y nunca lanza: el registro
 * acompaña a la operación, no la condiciona. Que la anotación falle no puede
 * impedir que un pedido cambie de estado.
 *
 * @param req     petición, de donde salen el actor y la IP
 * @param action  una clave de ACTIONS
 * @param target  sobre qué recayó (id de producto, número de pedido, correo)
 * @param detail  frase corta con lo que cambió
 */
function record(req, action, target, detail) {
  const user = (req.session && req.session.user) || null;
  // En un ingreso fallido todavía no hay sesión: el actor es el correo que se
  // intentó usar, que llega en `target`.
  const actor = user ? user.email : String(target || 'desconocido').slice(0, 150);

  pool
    .query(
      `INSERT INTO admin_audit (user_id, actor, action, target, detail, ip)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [
        user ? user.id : null,
        actor,
        String(action).slice(0, 60),
        target == null ? null : String(target).slice(0, 160),
        detail == null ? null : String(detail).slice(0, 2000),
        addressOf(req)
      ]
    )
    .catch((err) => console.error('Registro de auditoría:', err.message));
}

// Cuántos días se conservan las anotaciones. Un registro que crece para siempre
// deja de ser útil y pasa a ser un archivo de datos personales —direcciones IP—
// que hay que custodiar sin motivo. Seis meses cubre de sobra el plazo en que
// aparece un reclamo.
const RETENTION_DAYS = 180;

function prune() {
  return pool
    .query(`DELETE FROM admin_audit WHERE created_at < NOW() - INTERVAL '${RETENTION_DAYS} days'`)
    .catch((err) => console.error('Limpieza de auditoría:', err.message));
}

module.exports = { record, prune, ACTIONS, RETENTION_DAYS };
