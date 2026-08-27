/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/views/**/*.ejs'],
  theme: {
    extend: {
      colors: {
        // — Arbórea: una selva que contiene una tienda —
        // Estratos de profundidad, de lo más lejano a lo más cercano.
        night: '#0b120e',      // fondo de página / fondo del vivero (negro suave verdoso)
        deep: '#101c16',       // vegetación de fondo
        canopy: '#17291f',     // masa de árboles
        understory: '#26402e', // verde musgo — vegetación media
        leaf: '#3f6a48',       // verde hoja — vegetación cercana
        leafLit: '#6d9a69',    // hoja tocada por la luz
        earth: '#3a2f23',      // tierra / troncos
        earthLit: '#5b4936',   // corteza iluminada

        // Superficies y texto
        surface: '#131f19',    // paneles (ficha, panel de exploración)
        surface2: '#1b2b23',   // panel elevado, input, chip
        line: 'rgba(226,220,203,0.14)',
        ink: '#f0ede2',        // blanco cálido — texto principal
        sand: '#d9d1bd',       // beige natural — texto secundario
        sandDim: '#9a927f',    // texto terciario
        gold: '#c8a86a',       // luz / acento de descubrimiento
        goldDim: '#a08a4f',

        ok: '#7aa86f',
        warn: '#c9a24e',
        danger: '#b8695c'
      },
      fontFamily: {
        display: ['"Cormorant Garamond"', 'Georgia', 'serif'],
        body: ['"Jost"', 'system-ui', 'sans-serif'],
        mono: ['"Jost"', 'system-ui', 'sans-serif']
      },
      letterSpacing: {
        wander: '0.34em'
      },
      transitionTimingFunction: {
        camera: 'cubic-bezier(0.22, 1, 0.36, 1)'
      },
      boxShadow: {
        glow: '0 0 0 1px rgba(200,168,106,0.35), 0 0 34px -6px rgba(200,168,106,0.3)'
      }
    }
  },
  plugins: []
};
