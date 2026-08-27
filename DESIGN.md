---
name: Arbórea
description: Un mundo de ecosistemas que contiene una tienda — islas isométricas donde las plantas del catálogo habitan su bioma.
colors:
  night: "#0b120e"
  deep: "#101c16"
  canopy: "#17291f"
  understory: "#26402e"
  leaf: "#3f6a48"
  leaf-lit: "#6d9a69"
  earth: "#3a2f23"
  earth-lit: "#5b4936"
  surface: "#131f19"
  surface2: "#1b2b23"
  line: "rgba(226,220,203,0.14)"
  ink: "#f0ede2"
  sand: "#d9d1bd"
  sand-dim: "#9a927f"
  gold: "#c8a86a"
  gold-dim: "#a08a4f"
  ok: "#7aa86f"
  warn: "#c9a24e"
  danger: "#b8695c"
typography:
  display:
    fontFamily: "Cormorant Garamond, Georgia, serif"
    fontWeight: 400
    lineHeight: 1.05
  body:
    fontFamily: "Jost, system-ui, sans-serif"
    fontWeight: 300
    lineHeight: 1.6
  label:
    fontFamily: "Jost, system-ui, sans-serif"
    fontSize: "11px"
    letterSpacing: "0.34em"
    textTransform: "uppercase"
  label-sm:
    fontFamily: "Jost, system-ui, sans-serif"
    fontSize: "10px"
    letterSpacing: "0.34em"
    textTransform: "uppercase"
rounded:
  sm: "2px"
  full: "9999px"
components:
  action:
    textColor: "{colors.gold}"
    typography: "{typography.label}"
  action-solid:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.night}"
    rounded: "{rounded.full}"
    padding: "12px 28px"
  field:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
---

# Design System: Arbórea

## Overview

**Creative North Star: "Un lugar donde hay plantas que pueden comprarse"**

Arbórea no es una tienda que muestra plantas: es un mundo que las contiene. El visitante debe preguntarse *¿dónde estoy?* antes que *¿qué compro?*, y solo después descubrir que lo que habita la escena tiene nombre y precio. Todo el sistema existe para sostener ese orden.

El mundo se organiza en **ecosistemas**, cada uno una isla isométrica (proyección 2:1) con su propio suelo, luz y atmósfera. Las plantas del catálogo se dibujan como sprites anclados al terreno, ordenados por profundidad. La interfaz es casi invisible: versalitas muy espaciadas, líneas de 1px, cero tarjetas y cero botones de "Comprar ahora" en la superficie de exploración.

Rechazos confirmados por el usuario: la paleta hueso/tinta/sello rojo de "Bitácora de Especímenes"; el "Diorama de Historia Natural" con vitrinas y placas de latón; y en general el lenguaje de e-commerce (grids de producto, tarjetas repetitivas, banners, hero genérico).

**Key Characteristics:**
- Fondo casi negro verdoso (`night`); la luz siempre es cálida y cenital.
- Un solo acento: `gold` — marca lo interactivo y lo descubrible, nunca decora.
- Sin tarjetas. Un producto se anuncia con un punto que respira, no con un rectángulo.
- Isometría 2:1 estricta en el mundo; todo lo demás es tipografía sobre vacío.
- El movimiento es lento (600–900ms) y nunca simultáneo en toda la pantalla.

## Colors

Neutros oscuros y cálidos como base, verdes por profundidad, un único acento dorado.

### Primary
- **Oro de descubrimiento** (`gold`, #c8a86a): puntos de producto, enlaces, foco, el único color que dice "esto responde". Nunca se usa como fondo de área grande.

### Neutral
- **Noche** (`night`, #0b120e): fondo de página y cielo de los biomas.
- **Profundo / Dosel / Sotobosque / Hoja** (`deep`, `canopy`, `understory`, `leaf`, #101c16 → #3f6a48): escala de profundidad de la vegetación. Lo más lejano es lo más oscuro.
- **Hoja iluminada** (`leaf-lit`, #6d9a69): solo donde da la luz.
- **Tierra / Tierra iluminada** (`earth`, `earth-lit`): troncos, roca, el espesor de las islas.
- **Tinta** (`ink`, #f0ede2): texto principal, blanco cálido.
- **Arena / Arena apagada** (`sand`, `sand-dim`): texto secundario y terciario.
- **Línea** (`line`, rgba(226,220,203,0.14)): el único borde permitido.

### Named Rules
**The One Signal Rule.** `gold` significa "interactivo o descubrible". Si algo es dorado y no responde al cursor, está mal pintado.

**The Depth-Is-Value Rule.** La profundidad se codifica en luminosidad, no en desenfoque ni en tamaño solamente: cuanto más lejos, más oscuro y más cerca del `night`.

## Typography

**Display:** Cormorant Garamond (fallback Georgia, serif)
**Body / Label:** Jost (fallback system-ui, sans-serif)

**Character:** Cormorant pone la voz — editorial, tranquila, con contraste alto; Jost desaparece, y en versalitas con `tracking 0.34em` funciona como señalética de sala, no como interfaz de app.

### Hierarchy
- **Display** (400, 2.25–8rem, line-height ~1.05): wordmark, nombres de ecosistema, títulos de sección.
- **Body** (300, 0.875rem, line-height 1.6, medida ≤ 44ch): descripciones.
- **Label** (400, 11px, tracking 0.34em, mayúsculas): navegación, acciones, metadatos.
- **Label sm** (400, 10px, tracking 0.34em, mayúsculas): micro-rótulos subordinados a otro elemento — el indicador "Explorar", la etiqueta de un campo, un estado como "Agotada". Nunca para navegación ni acciones.

La rotulación **dentro** del SVG isométrico (25px / 15px, y 46px / 26px bajo 640px) va en unidades de usuario del `viewBox`, no en píxeles de pantalla: escala con la isla y por eso no pertenece a esta rampa.

### Named Rules
**The No Kicker Rule.** Nunca una etiqueta pequeña sobre un encabezado como adorno. Cuando hace falta contexto (número de ecosistema, conteo de especies) se integra en una sola línea de metadato, no como rótulo suelto.

**The Quiet Interface Rule.** Todo texto de interfaz va en `label`. Si necesita más de 11px para leerse, es contenido, no interfaz.

## Layout

Contenedores `max-w-6xl` (mundo) y `max-w-4xl` (lectura), con `px-6 sm:px-10`. Ritmo vertical de secciones: `py-20` a `py-28`. Las escenas de recorrido ocupan `100svh`. La isla isométrica vive en `.iso-world`, con `aspect-ratio: 808/706`, para que el encuadre no cambie entre dispositivos.

En pantallas angostas la isla se escala completa (no se recorta) y su rotulación crece en unidades de usuario del SVG para no volverse ilegible.

## Elevation & Depth

Sin sombras de caja en la interfaz. La profundidad es del mundo, no de los componentes, y se construye con cuatro recursos: valor (más lejos = más oscuro), oclusión (orden de pintado por `gx + gy`), sombra proyectada en el terreno (elipse 2:1 en el color `edge` del bioma) y parallax en las escenas de scroll.

El único brillo es `.iso-halo` / `shadow-glow`: un halo dorado difuso que aparece **solo** en hover, nunca en reposo.

### Named Rules
**The Flat-Interface Rule.** Las superficies de interfaz son planas y se separan con una línea de 1px. Cualquier sombra pertenece a un objeto del mundo, no a un panel.

## Shapes

Esquinas rectas o de 2px (`rounded-sm`) en todo lo que sea interfaz. Dos excepciones deliberadas: los retratos de planta en listados son círculos, y las acciones sólidas (`action-solid`) son cápsulas — ambas leen como objeto, no como control.

La geometría del mundo es estrictamente isométrica 2:1: tiles de 110×55, y todo elemento del suelo es una elipse con `ry = rx / 2`.

## Components

### Acciones
- **`action`**: texto en `label`, subrayado con una línea `gold/50` que se enciende en hover. Es la acción por defecto.
- **`action-solid`**: cápsula `ink` sobre `night`, pasa a `gold` en hover. Reservada para el paso final de una tarea (pagar, confirmar), nunca para explorar.

### Campos (`field`)
Sin caja: fondo transparente y una sola línea inferior `line` que pasa a `gold` en foco. La etiqueta va arriba en `label`.

### Habitante del mundo (`.iso-plant`) — componente distintivo
Un producto dentro de un bioma. En reposo: la planta ilustrada, su sombra en el suelo y un punto `gold` que respira sobre ella. En hover o foco: el punto se apaga, la planta se levanta 14px, se enciende un halo dorado difuso y aparecen nombre y precio con `paint-order: stroke` para sobrevivir sobre cualquier fondo. En táctil, el primer toque revela y el segundo entra.

### Carril del mundo (`.world-track`) — componente distintivo
Los ecosistemas no se apilan hacia abajo: se recorren de lado, como un mapa. Es un
contenedor con scroll horizontal nativo y `scroll-snap-type: x mandatory`; cada isla es un
panel a ancho completo con `snap-align: center`. Se maneja con swipe, con las flechas ← →
(el carril es `tabindex="0"`), con el menú de ecosistemas o con un enlace directo
(`/#bioma-desierto`). Sin JavaScript sigue siendo un carril desplazable con anclas
funcionales; el JS solo añade el desplazamiento suave y el estado activo del menú.

**The Sideways World Rule.** El eje vertical es para leer (índice, guías, ficha); el eje
horizontal es para viajar entre lugares. Nunca mezclar los dos en la misma superficie.

### Fila de espécimen (`.specimen-row`)
El listado completo del catálogo. Retrato circular + nombre + descripción + precio, separados por una línea de 1px. Reemplaza a la cuadrícula de tarjetas.

### Navegación
Fija y transparente sobre el mundo; gana fondo `night/85` y una línea inferior solo cuando el visitante pasa el 60% del primer viewport.

## Panel de administración

El admin es la otra superficie del proyecto y obedece a otro modo: aquí no se explora, se
**opera**. Comparte paleta, tipografía y lenguaje de formas con la tienda, pero invierte
las prioridades — mandan la densidad, el escaneo y el estado, no la atmósfera. No lleva
escenas, ni parallax, ni descubrimiento: nada se oculta esperando un hover.

- **Estructura:** barra lateral fija de 240px en escritorio (`.admin-side`); por debajo de
  `md` se convierte en una fila de pestañas desplazable y pegajosa. La navegación nunca
  desaparece — el catálogo se administra desde el celular.
- **Voz:** la serif queda solo en títulos y cifras grandes; los datos van en Jost. Las
  cantidades usan `lining-nums tabular-nums`, porque las cifras de estilo antiguo de
  Cormorant no se pueden comparar en columna.
- **Estado:** cada estado de pedido tiene color propio (`partials/order-status.ejs`);
  pendiente ámbar, en curso oro, entregado verde, cancelado rojo. Un panel donde todos los
  estados son grises obliga a leer lo que debería verse.
- **Tablas:** encabezados en versalitas, números a la derecha, y las columnas secundarias
  (contacto, categoría) se ocultan bajo `lg` para que **estado y acciones** nunca se
  recorten. La columna que se corta es la que nadie usa.

**The Operate-First Rule.** En el panel, ningún dato que sirva para decidir puede depender
de un hover, una animación o un desplazamiento lateral. Si hay que descubrirlo, está mal
puesto.

## Do's and Don'ts

### Do:
- **Do** dejar que el visitante descubra: un producto en escena se anuncia con un punto, y solo revela nombre y precio al acercarse.
- **Do** derivar los biomas de las categorías reales de la base de datos (`src/config/biomes.js`); ningún producto activo puede quedar fuera del mundo.
- **Do** mantener la isometría 2:1 exacta en cualquier elemento del terreno.
- **Do** conservar el índice completo con búsqueda y filtros: explorar es la experiencia, pero encontrar rápido sigue siendo un derecho.
- **Do** respetar `prefers-reduced-motion`: sin parallax, sin luciérnagas, sin respiración.

### Don't:
- **Don't** usar cuadrículas de tarjetas de producto, banners comerciales, hero genérico ni botones de "Comprar ahora" en las superficies de exploración.
- **Don't** poner un kicker o eyebrow sobre un encabezado, en ninguna superficie. Ya no queda ninguno: las clases de compatibilidad (`.label-eyebrow`, `.card`, `.btn-primary`, `.input-field`, `.status-pill`, `.tag-chip`, `.section-heading`) y los alias de color `cream` / `clay` / `leaf2` / `moss` se eliminaron cuando se migró la última vista.
- **Don't** mezclar los dos modos: la tienda no lleva tablas ni insignias de estado, y el panel no lleva escenas, parallax ni información que aparezca al pasar el cursor.
- **Don't** confiar en que una utilidad de Tailwind pise a un componente. `.admin-table .num` tiene más especificidad que `text-danger`; por eso el estado de alerta es `.num.is-alert`, no una utilidad suelta.
- **Don't** animar varias cosas a la vez ni bajar de 500ms: el mundo respira, no reacciona.
- **Don't** usar `gold` en algo que no responda al cursor.
- **Don't** meter scripts inline: `src/app.js` aplica un CSP estricto (`script-src 'self'`). Todo JS va en `/public/js`.
