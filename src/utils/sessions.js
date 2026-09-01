const { pool } = require('../db');

// Cerrar las demás sesiones de una persona.
//
// Regenerar la sesión actual solo invalida la cookie de quien está delante de
// la pantalla. Si alguien más entró con la contraseña robada desde otro
// dispositivo, su cookie sigue siendo válida durante días — y cambiar la
// contraseña, que es lo único que la víctima puede hacer, no le quitaba el
// acceso. Esto sí.
//
// Las sesiones viven en la tabla `session` que crea connect-pg-simple: una fila
// por sesión, con el contenido en la columna JSON `sess`. De ahí se saca el id
// del usuario.
async function revokeOtherSessions(userId, keepSid) {
  const { rowCount } = await pool.query(
    `DELETE FROM session
      WHERE sid <> $1
        AND (sess -> 'user' ->> 'id') = $2`,
    [keepSid || '', String(userId)]
  );
  return rowCount;
}

module.exports = { revokeOtherSessions };
