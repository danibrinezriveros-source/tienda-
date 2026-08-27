// Los ids de la base de datos son SERIAL (int4 de Postgres): enteros positivos
// hasta 2.147.483.647. Cualquier otra cosa que llegue en la URL — texto,
// decimales, números enormes, inyecciones — no es un id válido y debe tratarse
// como "no encontrado" (404), nunca como un error de servidor. Sin esta
// validación, pasar `/producto/abc` a la query hace que Postgres falle al
// castear y la app responda 500 en vez de 404.
const PG_INT4_MAX = 2147483647;

function toId(value) {
  if (!/^[0-9]+$/.test(String(value))) return null;
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= PG_INT4_MAX ? n : null;
}

module.exports = { toId };
