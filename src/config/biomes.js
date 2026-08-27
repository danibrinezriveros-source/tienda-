// Los ecosistemas del mundo de Arbórea. Cada bioma se arma con las categorías
// que ya existen en la base de datos — ninguna se inventa y ningún producto
// activo queda fuera del mundo.
const BIOMES = [
  {
    key: 'selva',
    name: 'La selva',
    line: 'Húmeda y en sombra. Aquí crece lo que vive bajo el dosel.',
    categories: ['interior', 'palmeras'],
    ground: { top: '#2c5138', topLit: '#3a6a46', edge: '#1d3826', rock: '#3c3226', rockLit: '#4d4130' },
    sky: '#0e1a13',
    feature: 'water',
    warm: 0.14
  },
  {
    key: 'jardin',
    name: 'El jardín',
    line: 'A pleno sol, ordenado por la mano de alguien.',
    categories: ['exterior', 'ornamentales'],
    ground: { top: '#4a6b35', topLit: '#5f8543', edge: '#33482a', rock: '#463a2a', rockLit: '#5b4c36' },
    sky: '#16261c',
    feature: 'beds',
    warm: 0.3
  },
  {
    key: 'desierto',
    name: 'El desierto',
    line: 'Seco y abierto. Se sobrevive guardando agua.',
    categories: ['suculentas'],
    ground: { top: '#8a6f4a', topLit: '#a4885d', edge: '#5f4c33', rock: '#6b5740', rockLit: '#87704f' },
    sky: '#241a12',
    feature: 'dunes',
    warm: 0.42
  },
  {
    key: 'huerto',
    name: 'El huerto',
    line: 'Lo que se corta, se huele y se cocina.',
    categories: ['aromáticas'],
    ground: { top: '#5a6b32', topLit: '#71853f', edge: '#3d4a24', rock: '#4a3d2b', rockLit: '#61513a' },
    sky: '#1a2113',
    feature: 'rows',
    warm: 0.34
  },
  {
    key: 'bosque',
    name: 'El bosque',
    line: 'Árboles que necesitan tiempo y espacio.',
    categories: ['árboles'],
    ground: { top: '#2f4a30', topLit: '#3e6140', edge: '#22351f', rock: '#3a3227', rockLit: '#4c4133' },
    sky: '#101c13',
    feature: 'mist',
    warm: 0.18
  },
  {
    key: 'taller',
    name: 'El taller',
    line: 'Macetas, sustrato y lo que hace falta para empezar.',
    categories: ['macetas y accesorios'],
    ground: { top: '#5c5344', topLit: '#736855', edge: '#3f382d', rock: '#4a4034', rockLit: '#5f5344' },
    sky: '#1d1811',
    feature: 'deck',
    warm: 0.26
  }
];

// Huecos plantables que tiene cada isla. Debe coincidir con el largo del
// array `slots` de views/partials/biome.ejs.
const SLOTS_PER_ISLAND = 9;

function normalize(v) {
  return (v || '').trim().toLowerCase();
}

// El catálogo llega ordenado por fecha, así que una categoría entera cae junta
// y la isla termina poblada por ocho palmeras iguales. Esto las intercala para
// que el bioma se vea variado sin alterar qué productos contiene.
function interleaveByCategory(list) {
  const buckets = [];
  const index = {};
  list.forEach((p) => {
    const key = normalize(p.category);
    if (index[key] === undefined) {
      index[key] = buckets.length;
      buckets.push([]);
    }
    buckets[index[key]].push(p);
  });

  const out = [];
  let round = 0;
  while (out.length < list.length) {
    let moved = false;
    for (let i = 0; i < buckets.length; i++) {
      if (buckets[i][round]) {
        out.push(buckets[i][round]);
        moved = true;
      }
    }
    if (!moved) break;
    round++;
  }
  return out;
}

// Reparte los productos por bioma. Lo que no cae en ninguna categoría
// declarada se envía a la selva, que es la entrada del mundo.
function buildBiomes(products) {
  const claimed = new Set();
  const map = {};

  BIOMES.forEach((b) => {
    map[b.key] = products.filter((p) => {
      if (claimed.has(p.id)) return false;
      if (b.categories.indexOf(normalize(p.category)) === -1) return false;
      claimed.add(p.id);
      return true;
    });
  });

  products.forEach((p) => {
    if (!claimed.has(p.id)) map.selva.push(p);
  });

  return BIOMES.map((b) => ({
    ...b,
    products: interleaveByCategory(map[b.key]),
    total: map[b.key].length,
    shown: Math.min(map[b.key].length, SLOTS_PER_ISLAND)
  }));
}

function findBiome(products, key) {
  return buildBiomes(products).find((b) => b.key === key) || null;
}

module.exports = { BIOMES, SLOTS_PER_ISLAND, buildBiomes, findBiome };
