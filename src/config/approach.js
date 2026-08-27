// ——— La entrada al bioma ———
// El visitante cae dentro de un ecosistema y lo ve desde el sendero. Al hacer
// scroll la cámara avanza: las plantas nacen en el horizonte, crecen, le pasan
// por los lados y salen de cuadro, hasta que el bioma se abre en las variedades
// que crecen ahí. Es una secuencia de imágenes — cada cuadro es un SVG que el
// navegador precarga y el canvas dibuja según la posición del scroll.
//
// El mundo no son capas que se agrandan: cada planta tiene su distancia y se
// proyecta en perspectiva desde la cámara. Por eso hay orden de profundidad,
// bruma según lo lejos que esté y cosas que de verdad pasan de largo.
//
// Los cuadros salen de los mismos biomas del catálogo, se calculan una vez al
// arrancar y se sirven con caché inmutable: no dependen de la sesión ni de la
// base de datos.
const fs = require('fs');
const path = require('path');
const { BIOMES } = require('./biomes');

const FRAME_COUNT = 56;
const FRAME_W = 2000;
const FRAME_H = 1125;

// La cámara: mira al frente, a la altura de una persona, y avanza por el
// sendero. VX/VY es el punto de fuga; K es la distancia focal.
const VX = 1000, VY = 545;
const K = 660;
const NEAR = 0.9;                 // más cerca que esto, ya pasó de largo
const FAR = 27;                   // más lejos que esto, todavía es bruma
const TRAVEL = 23;                // cuánto avanza en toda la secuencia
const SPROUT = 3.2;               // margen para que nada aparezca de golpe

// ——— Color ———
function hex(c) {
  const s = String(c).replace('#', '');
  return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
}
function rgb(a) {
  return '#' + a.map(function (v) {
    return Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  }).join('');
}
function mix(a, b, k) {
  const x = hex(a), y = hex(b);
  return rgb([0, 1, 2].map(function (i) { return x[i] + (y[i] - x[i]) * k; }));
}
// Enteros para las coordenadas, dos decimales para lo demás: cada cuadro se
// descarga como imagen y los decimales de más son peso de red.
function n(v) { return Math.round(v); }
function o(v) { return Math.round(v * 100) / 100; }
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

// El sendero es infinito y recto, así que se ve igual avance lo que avance la
// cámara: se dibuja una vez. Su borde a la distancia d.
const PATH_W = 0.62;
function pathEdge(d) {
  return { x: PATH_W * K / d, y: VY + K / d };
}

// ——— Las siluetas ———
// Se dibujan una sola vez, a 100 de alto y en currentColor: así cada instancia
// puede teñirse según lo lejos que esté sin duplicar el dibujo. Los toques de
// negro y blanco son sombra y luz, y se mezclan con el tinte que reciban.
const SHADE = ' fill="#000" fill-opacity="0.34"';
const LIGHT = ' fill="#fff" fill-opacity="0.16"';

function palm(v) {
  const lean = [0, 7, -8][v];
  const s = ['<path d="M-4 0 q' + n(2 + lean * 0.4) + ' -38 ' + lean + ' -60 l8 0 q3 22 ' +
    n(7 - lean * 0.4) + ' 60 Z" fill="currentColor"/>'];
  s.push('<path d="M-4 0 q' + n(2 + lean * 0.4) + ' -38 ' + lean + ' -60 l3 0 q-2 22 -4 60 Z"' + SHADE + '/>');
  const arms = [6, 7, 6][v];
  for (let k = 0; k < arms; k++) {
    const a = -170 + k * (340 / (arms - 1));
    s.push('<ellipse rx="34" ry="7" fill="currentColor" transform="translate(' + lean +
      ',-62) rotate(' + n(a) + ') translate(30,0)"/>');
    if (k % 2) {
      s.push('<ellipse rx="26" ry="4"' + LIGHT + ' transform="translate(' + lean +
        ',-62) rotate(' + n(a) + ') translate(26,0)"/>');
    }
  }
  return s.join('');
}

function conifer(v) {
  const w = [30, 25, 34][v], tiers = [4, 5, 3][v];
  const s = ['<rect x="-3" y="-26" width="6" height="26" fill="currentColor"/>',
    '<rect x="-3" y="-26" width="3" height="26"' + SHADE + '/>'];
  for (let k = 0; k < tiers; k++) {
    const y = -18 - k * (74 / tiers), ww = w * (1 - k * 0.17);
    s.push('<path d="M0 ' + n(y - 44) + ' L' + n(ww) + ' ' + n(y) + ' L' + n(-ww) + ' ' + n(y) +
      ' Z" fill="currentColor"/>');
    s.push('<path d="M0 ' + n(y - 44) + ' L' + n(ww) + ' ' + n(y) + ' L0 ' + n(y) + ' Z"' + SHADE + '/>');
  }
  return s.join('');
}

function bush(v) {
  const r = [26, 21, 30][v];
  return '<rect x="-3" y="-22" width="6" height="22" fill="currentColor"/>' +
    '<circle cx="' + n(-r * 0.6) + '" cy="' + n(-r * 1.5) + '" r="' + r + '" fill="currentColor"/>' +
    '<circle cx="' + n(r * 0.6) + '" cy="' + n(-r * 1.3) + '" r="' + n(r * 0.88) + '" fill="currentColor"/>' +
    '<circle cx="0" cy="' + n(-r * 2.1) + '" r="' + n(r * 0.95) + '" fill="currentColor"/>' +
    '<circle cx="' + n(-r * 0.5) + '" cy="' + n(-r * 2.3) + '" r="' + n(r * 0.5) + '"' + LIGHT + '/>' +
    '<circle cx="' + n(r * 0.7) + '" cy="' + n(-r * 1.2) + '" r="' + n(r * 0.45) + '"' + SHADE + '/>';
}

function cactus(v) {
  const h = [86, 70, 96][v], w = [11, 14, 9][v];
  const s = ['<rect x="' + -w + '" y="' + -h + '" width="' + w * 2 + '" height="' + h +
    '" rx="' + w + '" fill="currentColor"/>',
    '<rect x="' + n(-w * 0.9) + '" y="' + n(-h * 0.94) + '" width="' + n(w * 0.7) + '" height="' +
    n(h * 0.86) + '" rx="' + n(w * 0.35) + '"' + SHADE + '/>',
    '<rect x="' + n(w * 0.1) + '" y="' + n(-h * 0.9) + '" width="' + n(w * 0.4) + '" height="' +
    n(h * 0.8) + '" rx="' + n(w * 0.2) + '"' + LIGHT + '/>'];
  if (v !== 1) {
    s.push('<path d="M' + -w + ' ' + n(-h * 0.55) + ' h-16 v-22" stroke="currentColor" stroke-width="' +
      n(w * 1.3) + '" stroke-linecap="round" fill="none"/>');
    s.push('<path d="M' + w + ' ' + n(-h * 0.68) + ' h13 v-17" stroke="currentColor" stroke-width="' +
      n(w * 1.1) + '" stroke-linecap="round" fill="none"/>');
  }
  return s.join('');
}

function tuft(v) {
  const blades = [8, 6, 9][v], h = [56, 44, 66][v];
  const s = [];
  for (let k = 0; k < blades; k++) {
    const dx = (k - (blades - 1) / 2) * 8;
    s.push('<path d="M0 0 q' + n(dx * 0.5) + ' ' + n(-h * 0.6) + ' ' + n(dx * 1.6) + ' ' +
      n(-h * (0.8 + (k % 3) * 0.14)) + '" stroke="currentColor" stroke-width="6" ' +
      'stroke-linecap="round" fill="none"/>');
  }
  s.push('<ellipse cy="-4" rx="' + n(blades * 3) + '" ry="7"' + SHADE + '/>');
  return s.join('');
}

function pot(v) {
  const w = [26, 20, 30][v];
  return '<path d="M' + -w + ' -42 L' + w + ' -42 L' + n(w * 0.7) + ' 0 L' + n(-w * 0.7) +
    ' 0 Z" fill="currentColor"/>' +
    '<path d="M' + -w + ' -42 L0 -42 L' + n(-w * 0.7) + ' 0 Z"' + SHADE + '/>' +
    '<rect x="' + n(-w * 1.15) + '" y="-50" width="' + n(w * 2.3) + '" height="10" rx="3"' + LIGHT + '/>' +
    '<circle cx="0" cy="-62" r="' + n(w * 0.8) + '" fill="currentColor"/>' +
    '<circle cx="' + n(w * 0.5) + '" cy="-72" r="' + n(w * 0.5) + '"' + LIGHT + '/>';
}

// La hoja que cuelga del dosel y barre la cámara al pasar.
function hang(v) {
  const h = [120, 96, 140][v];
  return '<path d="M0 0 C-38 ' + n(h * 0.3) + ' -42 ' + n(h * 0.74) + ' 0 ' + h +
    ' C42 ' + n(h * 0.74) + ' 38 ' + n(h * 0.3) + ' 0 0 Z" fill="currentColor"/>' +
    '<path d="M0 6 L0 ' + n(h * 0.94) + '" stroke="#fff" stroke-opacity="0.2" stroke-width="3"/>';
}

// Piedra: el detalle que hace que el suelo pase por debajo y no flote.
function stone(v) {
  const r = [18, 12, 24][v];
  return '<path d="M' + -r + ' 0 q' + n(r * 0.4) + ' ' + n(-r * 1.05) + ' ' + r + ' ' + n(-r * 0.85) +
    ' q' + n(r * 0.75) + ' ' + n(r * 0.2) + ' ' + r + ' ' + n(r * 0.85) + ' Z" fill="currentColor"/>' +
    '<path d="M' + -r + ' 0 q' + n(r * 0.4) + ' ' + n(-r * 1.05) + ' ' + r + ' ' + n(-r * 0.85) +
    ' q' + n(-r * 0.3) + ' ' + n(r * 0.5) + ' ' + n(-r * 0.5) + ' ' + n(r * 0.85) + ' Z"' + LIGHT + '/>';
}

const SHAPES = { palm: palm, conifer: conifer, bush: bush, cactus: cactus, tuft: tuft, pot: pot };
const KIND = {
  selva: 'palm', bosque: 'conifer', jardin: 'bush',
  desierto: 'cactus', huerto: 'tuft', taller: 'pot'
};
// Qué biomas tienen techo: en la selva y el bosque la cámara pasa por debajo
// del dosel, y eso es lo que hace que se sienta que uno entra.
const CANOPY = { selva: 1, bosque: 1, jardin: 1 };

// ——— El bioma sembrado ———
// Las plantas se siembran una sola vez, con semilla fija, cada una con su
// distancia. La cámara solo cambia de sitio: el bosque no se recalcula.
function biomeArt(b) {
  const g = b.ground;
  let seed = 0;
  for (let i = 0; i < b.key.length; i++) seed = (seed * 31 + b.key.charCodeAt(i)) % 2147483647;
  seed = (seed * 7919 + 13) % 2147483647;
  function rnd() { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; }
  function span(a, c) { return a + rnd() * (c - a); }
  function pick(a) { return a[Math.floor(rnd() * a.length) % a.length]; }

  const K_ = b.key;
  const kind = KIND[K_] || 'bush';
  const leaf = mix(g.top, '#060d08', 0.18);
  const soil = mix(g.rock, '#0a0805', 0.2);

  // Las siluetas del bioma: tres variantes para que la repetición no cante.
  let defs = '';
  for (let v = 0; v < 3; v++) {
    defs += '<g id="p-' + K_ + '-' + v + '">' + SHAPES[kind](v) + '</g>';
    defs += '<g id="s-' + K_ + '-' + v + '">' + stone(v) + '</g>';
    if (CANOPY[K_]) defs += '<g id="h-' + K_ + '-' + v + '">' + hang(v) + '</g>';
  }

  // ——— La siembra ———
  // z es la distancia a la que está cada cosa cuando la cámara está en el
  // origen. Se siembra más allá del recorrido para que al final del viaje el
  // horizonte siga poblado y no se vacíe el mundo.
  const props = [];
  const DEPTH = FAR + TRAVEL + SPROUT;

  // Vegetación a los dos lados del sendero, más apretada cerca del borde.
  for (let i = 0; i < 190; i++) {
    const z = span(NEAR, DEPTH);
    const side = rnd() < 0.5 ? -1 : 1;
    const off = 0.78 + Math.pow(rnd(), 1.5) * 5.6;
    props.push({
      t: 'p', v: Math.floor(rnd() * 3), z: z, x: side * off,
      h: span(0.9, 1.5) * (kind === 'cactus' || kind === 'tuft' ? 0.8 : 1),
      c: leaf
    });
  }
  // Piedras y matojos al borde del camino: el suelo tiene que pasar por debajo.
  for (let i = 0; i < 120; i++) {
    const z = span(NEAR, DEPTH);
    const side = rnd() < 0.5 ? -1 : 1;
    props.push({
      t: 's', v: Math.floor(rnd() * 3), z: z,
      x: side * (PATH_W + span(0.02, 0.5)),
      h: span(0.5, 1), c: soil
    });
  }
  // Dosel: hojas colgando que barren la cámara al pasar por debajo.
  if (CANOPY[K_]) {
    for (let i = 0; i < 90; i++) {
      props.push({
        t: 'h', v: Math.floor(rnd() * 3), z: span(NEAR, DEPTH),
        x: span(-4.6, 4.6), h: span(0.9, 1.7),
        y: -span(0.55, 1.5),           // altura sobre la línea de los ojos
        c: mix(leaf, '#02060a', 0.25)
      });
    }
  }
  // Polvo y luciérnagas suspendidos: lo que hace visible el aire.
  for (let i = 0; i < 70; i++) {
    props.push({
      t: 'm', z: span(NEAR, FAR + TRAVEL), x: span(-5, 5),
      y: -span(0.05, 1.4), h: span(0.5, 1.4),
      c: mix('#e8dcae', g.topLit, span(0, 0.5))
    });
  }

  props.sort(function (a, c) { return c.z - a.z; });

  return { warm: b.warm || 0.2, sky: b.sky, ground: g, defs: defs, props: props, key: K_ };
}

const ART = {};
BIOMES.forEach(function (b) { ART[b.key] = biomeArt(b); });

// ——— El escenario ———
// Cielo, suelo y sendero no cambian con el avance: un camino recto e infinito
// se ve igual desde cualquier punto de sí mismo. Lo único que cambia es la luz.
function stage(art, t) {
  const g = art.ground, K_ = art.key;
  const s = [];
  s.push('<rect width="' + FRAME_W + '" height="' + FRAME_H + '" fill="url(#sky-' + K_ + ')"/>');
  s.push('<rect width="' + FRAME_W + '" height="' + FRAME_H + '" fill="url(#sun-' + K_ + ')"/>');
  s.push('<rect y="' + VY + '" width="' + FRAME_W + '" height="' + (FRAME_H - VY) +
    '" fill="url(#soil-' + K_ + ')"/>');

  // El sendero, trazado en perspectiva desde el punto de fuga.
  const a = pathEdge(0.75), c = pathEdge(30);
  s.push('<path d="M' + n(VX - c.x) + ' ' + n(c.y) + ' L' + n(VX + c.x) + ' ' + n(c.y) +
    ' L' + n(VX + a.x) + ' ' + n(a.y) + ' L' + n(VX - a.x) + ' ' + n(a.y) +
    ' Z" fill="' + g.rockLit + '" opacity="0.22"/>');
  return s.join('');
}

function frameSvg(key, index) {
  const art = ART[key];
  const g = art.ground;
  const i = clamp(Math.round(index), 0, FRAME_COUNT - 1);
  const t = i / (FRAME_COUNT - 1);
  const cam = t * TRAVEL;
  const K_ = art.key;

  // La luz crece según avanza: al final del sendero hay más aire que maleza, y
  // es justo donde el bioma se abre.
  const low = mix(art.sky, '#c8a86a', 0.1 + art.warm * 0.2 + t * 0.12);
  const defs = [
    '<linearGradient id="sky-' + K_ + '" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="' + mix(art.sky, '#000000', 0.6 - t * 0.18) + '"/>' +
      '<stop offset="0.7" stop-color="' + art.sky + '"/>' +
      '<stop offset="1" stop-color="' + low + '"/></linearGradient>',
    '<radialGradient id="sun-' + K_ + '" cx="0.5" cy="' + o(VY / FRAME_H) + '" r="' + o(0.3 + t * 0.4) + '">' +
      '<stop offset="0" stop-color="#f6ecc8" stop-opacity="' + o(0.16 + art.warm * 0.4 + t * 0.22) + '"/>' +
      '<stop offset="1" stop-color="#f6ecc8" stop-opacity="0"/></radialGradient>',
    '<linearGradient id="soil-' + K_ + '" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="' + mix(g.topLit, art.sky, 0.45) + '"/>' +
      '<stop offset="0.35" stop-color="' + g.top + '"/>' +
      '<stop offset="1" stop-color="' + mix(g.edge, '#000000', 0.42) + '"/></linearGradient>',
    '<radialGradient id="vig-' + K_ + '" cx="0.5" cy="0.5" r="0.72">' +
      '<stop offset="0.45" stop-color="#000" stop-opacity="0"/>' +
      '<stop offset="1" stop-color="#000" stop-opacity="' + o(0.4 + t * 0.16) + '"/></radialGradient>',
    art.defs
  ];

  const body = [stage(art, t)];

  // ——— El mundo en perspectiva ———
  // De lo lejano a lo cercano. Cada cosa se proyecta según su distancia real a
  // la cámara: por eso nace en el horizonte, crece y sale por el borde.
  art.props.forEach(function (p) {
    const d = p.z - cam;
    if (d <= NEAR || d > FAR) return;

    const scale = K / d;
    const x = VX + p.x * scale;
    const y = VY + (p.y === undefined ? 1 : -p.y) * scale;
    if (x < -900 || x > FRAME_W + 900) return;

    // Bruma: lo lejano se destiñe hacia el cielo, lo muy cercano se oscurece
    // a contraluz. Es lo que da aire entre una planta y la siguiente.
    const far = clamp((d - NEAR) / (FAR - NEAR), 0, 1);
    const tint = mix(mix(p.c, art.sky, far * 0.82), '#000000', clamp((2.4 - d) / 2.4, 0, 1) * 0.45);
    // Nada aparece ni desaparece de golpe: se funde al entrar y al salir.
    const fade = Math.min(1, (FAR - d) / SPROUT, (d - NEAR) / 0.6);

    if (p.t === 'm') {
      body.push('<circle cx="' + n(x) + '" cy="' + n(y) + '" r="' + o(Math.min(9, p.h * scale * 0.02)) +
        '" fill="' + tint + '" opacity="' + o(fade * (0.16 + (1 - far) * 0.4)) + '"/>');
      return;
    }

    const size = o(p.h * scale * 0.01);
    if (size < 0.02) return;
    body.push('<use href="#' + p.t + '-' + K_ + '-' + p.v + '" transform="translate(' + n(x) + ',' +
      n(y) + ') scale(' + size + ')" color="' + tint + '"' +
      (fade < 0.99 ? ' opacity="' + o(fade) + '"' : '') + '/>');
  });

  body.push('<rect width="' + FRAME_W + '" height="' + FRAME_H + '" fill="url(#vig-' + K_ + ')"/>');

  return '<svg xmlns="http://www.w3.org/2000/svg" width="' + FRAME_W + '" height="' + FRAME_H +
    '" viewBox="0 0 ' + FRAME_W + ' ' + FRAME_H + '">' +
    '<defs>' + defs.join('') + '</defs>' + body.join('') + '</svg>';
}

// Los cuadros no dependen de la base de datos, así que se calculan al arrancar
// y se quedan en memoria: servir uno es devolver una cadena.
const FRAMES = {};
BIOMES.forEach(function (b) {
  const list = [];
  for (let i = 0; i < FRAME_COUNT; i++) list.push(frameSvg(b.key, i));
  FRAMES[b.key] = list;
});

function frames(key) {
  return Object.prototype.hasOwnProperty.call(FRAMES, key) ? FRAMES[key] : null;
}

// Los cuadros se sirven con caché inmutable, así que la URL tiene que cambiar
// cuando cambia el dibujo: si no, quien ya visitó el sitio seguiría viendo el
// bioma viejo. La huella se saca de los propios cuadros.
const VERSION = (function () {
  let h = 2166136261;
  BIOMES.forEach(function (b) {
    const s = FRAMES[b.key][0] + FRAMES[b.key][FRAME_COUNT - 1];
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
  });
  return (h >>> 0).toString(36);
})();

// ——— Fotos reales ———
// Lo dibujado es el suplente. Si en src/public/img/entrada/<bioma>/ hay
// imágenes, mandan ellas: se ordenan por nombre y esa es la secuencia que
// recorre el scroll. Con una sola foto también funciona — el scroll la acerca
// en vez de pasar cuadros. Se mira al arrancar, no en cada visita.
const PHOTO_DIR = path.join(__dirname, '..', 'public', 'img', 'entrada');
const PHOTO_EXT = /\.(jpe?g|png|webp|avif)$/i;

function readPhotos(key) {
  try {
    return fs
      .readdirSync(path.join(PHOTO_DIR, key))
      .filter((f) => PHOTO_EXT.test(f))
      .sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
  } catch (err) {
    return [];   // no hay carpeta: se sigue con el dibujo
  }
}

const PHOTOS = {};
BIOMES.forEach(function (b) { PHOTOS[b.key] = readPhotos(b.key); });

// De dónde salen los cuadros de este bioma. La vista y el navegador no
// necesitan saber cuál de los dos es: solo una base y una lista.
function source(key) {
  const shots = PHOTOS[key] || [];
  if (shots.length) {
    return { kind: 'foto', base: '/img/entrada/' + key + '/', list: shots, count: shots.length };
  }
  return {
    kind: 'dibujo',
    base: '/bioma/' + key + '/',
    list: null,
    count: FRAME_COUNT,
    version: VERSION
  };
}

module.exports = { FRAME_COUNT, FRAME_W, FRAME_H, VERSION, frames, frameSvg, source };
