// Script puntual para cargar el lote de plantas que llegó por WhatsApp/Instagram.
// No se ejecuta con db:init; se corre una sola vez manualmente:
//   node db/seed-nuevas-plantas.js
require('dotenv').config();
const { pool } = require('../src/db');

// Notas sobre lo que NO se incluyó del mensaje original, para que quede registrado:
// - "Echeveria", "Lavanda" y "Areca" ya existían en el catálogo, no se duplican.
// - "Sábila (Aloe)" es el mismo Aloe vera que ya aparece en la lista de suculentas,
//   se dejó una sola entrada.
// - "Bugambilia", "Veranera" y "Trinitaria" son en muchas regiones nombres distintos
//   para la misma planta (Bougainvillea); se dejaron como 3 productos separados por
//   si corresponden a variedades/colores distintos — revísalo y fusiónalos si no.
const products = [
  // --- Árboles y especies para bosque ---
  ['Guayacán amarillo', 'Árbol nativo de gran porte, célebre por su floración amarilla intensa en época seca.', 22.0, 10, 'árboles', 'exterior', ''],
  ['Guayacán rosado', 'Pariente del guayacán amarillo, con una floración rosada muy vistosa.', 24.0, 10, 'árboles', 'exterior', ''],
  ['Ocobo', 'Árbol ornamental de gran tamaño, típico de avenidas y parques por su floración rosada o morada.', 20.0, 10, 'árboles', 'exterior', ''],
  ['Roble colombiano', 'Árbol nativo de crecimiento lento y madera valiosa, ideal para reforestación y sombra.', 26.0, 10, 'árboles', 'exterior', ''],
  ['Carbonero', 'Árbol de sombra de rápido crecimiento, común en cercas vivas y potreros.', 18.0, 10, 'árboles', 'exterior', ''],
  ['Chicalá amarillo', 'Árbol de floración amarilla llamativa, resistente y de buen porte para espacios abiertos.', 20.0, 10, 'árboles', 'exterior', ''],
  ['Nogal cafetero', 'Árbol nativo de sombra, tradicionalmente usado en cafetales por su copa amplia.', 25.0, 10, 'árboles', 'exterior', ''],
  ['Guamo', 'Árbol de sombra de crecimiento rápido, frecuente en sistemas agroforestales.', 19.0, 10, 'árboles', 'exterior', ''],
  ['Cedro rosado', 'Árbol maderable nativo, apreciado por su copa frondosa y crecimiento vigoroso.', 28.0, 10, 'árboles', 'exterior', ''],
  ['Ceiba', 'Árbol emblemático de gran tamaño y longevidad, requiere espacio amplio para crecer.', 30.0, 10, 'árboles', 'exterior', ''],

  // --- Ornamentales de exterior ---
  ['Bugambilia', 'Trepadora de floración abundante y colorida, resistente al sol directo.', 14.0, 12, 'ornamentales', 'exterior', ''],
  ['Cayena', 'Arbusto de floración vistosa y continua, clásico en jardines y cercas vivas.', 12.0, 12, 'ornamentales', 'exterior', ''],
  ['Duranta', 'Arbusto de follaje denso, usado tanto en setos como en floración ornamental.', 13.0, 12, 'ornamentales', 'exterior', ''],
  ['Jazmín', 'Trepadora o arbusto de flores blancas muy aromáticas.', 15.0, 12, 'ornamentales', 'exterior', ''],
  ['Veranera', 'Trepadora de floración intensa y colorida, muy resistente al sol.', 14.0, 12, 'ornamentales', 'exterior', ''],
  ['Ave del paraíso', 'Planta ornamental de flores llamativas en forma de ave, ideal como punto focal en jardín.', 18.0, 10, 'ornamentales', 'exterior', ''],
  ['Ixora', 'Arbusto compacto de floración constante en racimos de colores intensos.', 12.0, 12, 'ornamentales', 'exterior', ''],
  ['Corona de Cristo', 'Arbusto espinoso de floración pequeña y constante, muy resistente y de bajo mantenimiento.', 11.0, 12, 'ornamentales', 'exterior,principiante', ''],
  ['Trinitaria', 'Trepadora de floración abundante, muy usada para cubrir muros y cercas.', 14.0, 12, 'ornamentales', 'exterior', ''],
  ['Heliconia', 'Planta tropical de flores exóticas y follaje exuberante, ideal para jardines húmedos.', 17.0, 10, 'ornamentales', 'exterior', ''],

  // --- Suculentas y cactus ---
  ['Jade', 'Suculenta de hojas gruesas y brillantes, muy fácil de cuidar.', 9.0, 15, 'suculentas', 'principiante,exterior', ''],
  ['Aloe vera (Sábila)', 'Suculenta de propiedades medicinales conocidas, resistente y de bajo riego.', 8.0, 15, 'suculentas', 'principiante,exterior', ''],
  ['Cola de burro', 'Suculenta colgante de tallos densos, perfecta para macetas altas o colgantes.', 9.0, 12, 'suculentas', 'principiante,exterior', ''],
  ['Haworthia', 'Suculenta compacta de hojas rayadas, ideal para espacios pequeños con buena luz.', 7.5, 15, 'suculentas', 'principiante,exterior', ''],
  ['Kalanchoe', 'Suculenta de floración abundante y colorida, de fácil cuidado.', 7.0, 15, 'suculentas', 'principiante,exterior', ''],
  ['Graptopetalum', 'Suculenta en roseta de tonos plateados, muy resistente al sol directo.', 8.5, 12, 'suculentas', 'principiante,exterior', ''],
  ['Cactus orejas de conejo', 'Cactus de segmentos aplanados y forma característica, de crecimiento lento.', 9.5, 12, 'suculentas', 'principiante,exterior', ''],
  ['Cactus barril', 'Cactus globular de crecimiento lento, resistente y de mínimo mantenimiento.', 10.0, 12, 'suculentas', 'principiante,exterior', ''],
  ['Mammillaria', 'Cactus pequeño y espinoso, de floración ocasional en forma de corona.', 8.0, 12, 'suculentas', 'principiante,exterior', ''],

  // --- Aromáticas y medicinales ---
  ['Romero', 'Aromática de uso culinario y medicinal, necesita buena luz y riego moderado.', 6.0, 15, 'aromáticas', 'exterior,principiante', ''],
  ['Hierbabuena', 'Aromática de crecimiento rápido, ideal para infusiones y cocina.', 5.0, 15, 'aromáticas', 'exterior,principiante', ''],
  ['Menta', 'Aromática vigorosa, se expande con facilidad; ideal en maceta aparte.', 5.0, 15, 'aromáticas', 'exterior,principiante', ''],
  ['Albahaca', 'Aromática de uso culinario, requiere buena luz y riego constante.', 5.5, 15, 'aromáticas', 'exterior,principiante', ''],
  ['Tomillo', 'Aromática de bajo mantenimiento, tolera bien el sol directo y el riego espaciado.', 6.0, 15, 'aromáticas', 'exterior,principiante', ''],
  ['Orégano', 'Aromática de uso culinario, resistente y de fácil propagación.', 5.5, 15, 'aromáticas', 'exterior,principiante', ''],
  ['Manzanilla', 'Planta medicinal de flores pequeñas, usada tradicionalmente en infusiones.', 6.5, 12, 'aromáticas', 'exterior,principiante', ''],
  ['Ruda', 'Planta aromática y medicinal tradicional, de fácil cultivo en maceta.', 6.0, 12, 'aromáticas', 'exterior,principiante', ''],

  // --- Palmeras tropicales ---
  ['Cera del Quindío', 'Palma nativa emblemática de gran altura, símbolo del paisaje cafetero colombiano.', 45.0, 6, 'palmeras', 'exterior', ''],
  ['Palma Botella', 'Palma ornamental de tronco ensanchado en la base, muy usada en jardines y avenidas.', 28.0, 8, 'palmeras', 'exterior', ''],
  ['Palma Abanico', 'Palma de hojas amplias en forma de abanico, resistente y de bajo mantenimiento.', 24.0, 8, 'palmeras', 'exterior', ''],
  ['Palma Real', 'Palma de gran porte y tronco recto, clásica en avenidas y jardines amplios.', 30.0, 6, 'palmeras', 'exterior', ''],
  ['Palma Fénix', 'Palma ornamental de follaje denso y arqueado, muy resistente.', 26.0, 8, 'palmeras', 'exterior', ''],
  ['Palma de Coco', 'Palma tropical clásica, necesita espacio amplio y buena exposición solar.', 32.0, 6, 'palmeras', 'exterior', ''],
  ['Palma Cola de pescado', 'Palma de hojas irregulares muy características, ideal como punto focal.', 25.0, 8, 'palmeras', 'exterior', ''],
  ['Palma Viajera', 'Palma ornamental de hojas dispuestas en abanico vertical, muy decorativa.', 27.0, 8, 'palmeras', 'exterior', '']
];

async function run() {
  let inserted = 0;
  let skipped = 0;
  for (const p of products) {
    const { rows: existing } = await pool.query('SELECT id FROM products WHERE name = $1', [p[0]]);
    if (existing.length > 0) {
      skipped++;
      continue;
    }
    await pool.query(
      `INSERT INTO products (name, description, price, stock, category, tags, image_url)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      p
    );
    inserted++;
  }
  console.log(`✔ ${inserted} plantas nuevas insertadas, ${skipped} ya existían y se dejaron igual.`);
  await pool.end();
}

run().catch((err) => {
  console.error('Error cargando el lote de plantas:', err);
  process.exit(1);
});
