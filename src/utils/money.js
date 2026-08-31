// Un solo lugar donde el dinero se vuelve texto.
//
// Antes el formato estaba repetido en veintiún vistas con
// `maximumFractionDigits: 0`, que no acorta la cifra: la redondea. Una suculenta
// de 8,50 aparecía como $9 en el índice, en la ficha y en el carrito, y el
// pedido cobraba 8,50. Mostrar un precio distinto del que se cobra es lo único
// que una tienda no puede permitirse, así que el redondeo se fue.

const LOCALE = 'es-CO';

function money(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '$0';

  // El peso colombiano no usa centavos en la práctica, y una lista de precios
  // con ",00" repetido es ruido. Los decimales aparecen solo cuando la cifra
  // realmente los tiene.
  const hasCents = Math.round(n * 100) % 100 !== 0;

  return (
    '$' +
    n.toLocaleString(LOCALE, {
      minimumFractionDigits: hasCents ? 2 : 0,
      maximumFractionDigits: 2
    })
  );
}

module.exports = { money };
