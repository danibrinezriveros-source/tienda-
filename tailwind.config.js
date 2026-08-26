/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/views/**/*.ejs'],
  theme: {
    extend: {
      colors: {
        cream: '#faf6ec',      // fondo principal, blanco cálido
        surface: '#ffffff',    // paneles / tarjetas
        surface2: '#f1ead9',   // paneles elevados, hover, chips
        line: '#e6ddc5',       // bordes sutiles
        ink: '#20291d',        // texto principal (verde-negro cálido)
        moss: '#66735a',       // texto secundario
        leaf: '#2f5233',       // verde bosque (acento primario)
        leaf2: '#4c7a4f',      // verde claro (hover / glow)
        clay: '#b5652d',       // terracota (acento secundario, precios)
        ok: '#3f7d4a',
        warn: '#c98a2c',
        danger: '#b3432f'
      },
      fontFamily: {
        display: ['"Fraunces"', 'serif'],
        body: ['"Inter"', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'monospace']
      },
      backgroundImage: {
        canopy: 'radial-gradient(circle at 50% 0%, rgba(47,82,51,0.14), transparent 60%)'
      },
      boxShadow: {
        glow: '0 0 0 1px rgba(47,82,51,0.35), 0 0 24px rgba(47,82,51,0.18)'
      }
    }
  },
  plugins: []
};
