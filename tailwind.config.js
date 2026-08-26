/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/views/**/*.ejs'],
  theme: {
    extend: {
      colors: {
        night: '#12160f',      // fondo principal, verde-negro elegante
        cream: '#faf6ec',      // blanco cálido — texto/superficies claras sobre fondo oscuro
        surface: '#1a1e15',    // paneles / tarjetas
        surface2: '#232920',   // paneles elevados, hover, chips
        line: 'rgba(244,241,230,0.12)', // bordes sutiles sobre fondo oscuro
        ink: '#f5f2e8',        // texto principal (claro, sobre fondo oscuro)
        moss: '#a3ab97',       // texto secundario
        leaf: '#5c9161',       // verde bosque (acento primario, aclarado para contraste)
        leaf2: '#7ec684',      // verde claro (hover / glow)
        clay: '#e2894f',       // terracota (acento secundario, precios)
        ok: '#5cbf6b',
        warn: '#e0a542',
        danger: '#e2685a'
      },
      fontFamily: {
        display: ['"Inter"', 'sans-serif'],
        body: ['"Inter"', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'monospace']
      },
      backgroundImage: {
        canopy: 'radial-gradient(circle at 50% 0%, rgba(92,145,97,0.18), transparent 60%)'
      },
      boxShadow: {
        glow: '0 0 0 1px rgba(92,145,97,0.4), 0 0 24px rgba(92,145,97,0.22)'
      }
    }
  },
  plugins: []
};
