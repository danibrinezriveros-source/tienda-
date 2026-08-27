# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Compradores mixtos sin un perfil único: principiantes en plantas de interior que buscan
algo fácil de cuidar (coincide con el tag `principiante` que ya usa el catálogo),
aficionados/coleccionistas que ya tienen plantas y buscan variedad, y personas que compran
una planta como regalo. El catálogo, las guías y el asistente de compra están pensados
para servir a los tres perfiles por igual, no para un nicho.

## Product Purpose

Arborea es un vivero online que vende plantas (interior/exterior, con tags declaradas
como `principiante`, `poca-luz`, `pet-friendly`) y además educa: guías de cuidado (luz,
riego, trasplante, plagas, plantas para principiantes, pet-friendly) y un asistente de
compra por reglas (3 preguntas rápidas → recomendaciones ordenadas por afinidad, con una
frase que explica el porqué). El pedido se confirma por WhatsApp (Twilio, opcional;
se simula en consola del servidor si no hay credenciales). Éxito = que el comprador se
vaya con una planta que sepa cuidar, no solo con una planta.

## Positioning

Frente a un vivero físico o una tienda online genérica, el diferencial confirmado de
Arborea es la **educación y el acompañamiento**: no vende sin explicar, guía al
comprador (sobre todo al principiante) hacia la planta correcta y le da las
herramientas para mantenerla viva. La curaduría de catálogo y la conveniencia de
confirmación por WhatsApp son secundarias a ese acompañamiento, no el diferencial
principal.

## Operating Context

- Cliente: navega el catálogo con filtro por categoría/búsqueda, ve ficha de producto
  con "cuidados a simple vista" (derivados de las tags del producto), arma carrito,
  hace checkout, puede registrarse/loguearse y ver "Mis pedidos".
- Asistente de compra (`/asistente`): flujo de 3 preguntas rápidas que devuelve
  recomendaciones ordenadas por afinidad, sin costo ni API externa.
- `/guias` (guías de cuidado) y `/sobre-arborea` (misión, valores, compromiso) son
  contenido de acompañamiento real, no relleno ni solo-SEO.
- Admin (`/admin/ingresar`, protegido con contraseña): alta/edición de productos,
  importación masiva por CSV, gestión de pedidos entrantes/salientes con cambio de
  estado, panel de resumen (productos activos, pedidos, ingresos), ajustes para
  activar WhatsApp.
- Confirmación de pedido por WhatsApp vía Twilio; sin credenciales configuradas se
  simula en la consola del servidor para poder probar el flujo completo sin costo.

## Capabilities and Constraints

- Stack ya definido por el código existente: Node.js + Express + PostgreSQL + Tailwind
  CSS + EJS (renderizado en servidor), desplegado como función serverless en Vercel
  (`api/index.js`).
- Sesiones persistidas en PostgreSQL (`connect-pg-simple`), no en memoria — necesario en
  el entorno serverless donde cada invocación puede caer en otra instancia.
- El asistente de compra es 100% basado en reglas locales sobre las tags del producto,
  sin costo ni API externa — restricción deliberada a preservar en cualquier rediseño.
- Las tags de producto (`principiante`, `poca-luz`, `exterior`, `pet-friendly`, etc.)
  alimentan tanto el asistente de compra como los chips de "cuidados a simple vista" en
  la ficha de producto; un rediseño de esa ficha debe seguir derivando los chips de las
  tags existentes, no inventar una taxonomía nueva.
- Importación de catálogo por CSV con columnas fijas
  (`name,description,price,stock,category,tags,image_url`) — flujo de carga masiva a
  preservar tal cual.

## Brand Commitments

Ninguno es intocable: el usuario confirmó que todo el branding actual está abierto a
cambio, incluido el nombre "Arborea".

Nota de contexto para el rediseño: el `README.md` describe una identidad "cálida y
botánica (verdes, terracota y tipografía serif)", pero la implementación real
(`tailwind.config.js`) usa un tema oscuro verde-negro (`night`/`surface`) con
tipografía Inter (sans-serif) para todo, incluido el bloque `display`. La intención
documentada y la implementación actual ya no coinciden — esto es evidencia de deriva
visual, no una restricción a preservar.

Dirección visual confirmada (2026-08-26): "Diorama de Historia Natural" — el sitio se
presenta como la sala de un museo de historia natural, con cada planta viviendo en la
vitrina de su hábitat (Sala Tropical, Huerto de Aromáticas, Jardín Floral). Ver
`DESIGN.md` para los tokens y componentes. El usuario pidió explícitamente que navegar
el catálogo se sienta como un recorrido que revela cada especie en su hábitat, no como
una grilla de e-commerce genérica.

Dirección rechazada explícitamente por el usuario: "Bitácora de Especímenes" (paleta
hueso/papel/tinta grafito con sello rojo, tipografía Public Sans/JetBrains Mono,
formato de ficha administrativa) — se sintió fría y burocrática, no botánica. No
reproponer esta paleta ni este registro tipográfico en futuros rediseños.

## Evidence on Hand

No hay activos reales confirmados (fotografía de producto propia, testimonios, prensa)
más allá del código y contenido de ejemplo del repositorio. Las imágenes de producto se
cargan por URL o por subida (Vercel Blob) desde el admin; no asumir un banco de
imágenes propio del vivero al diseñar.

## Product Principles

- Educar antes de vender: cada punto de contacto (ficha de producto, catálogo,
  checkout) debe reforzar que el comprador sabrá cuidar la planta, no solo comprarla.
- Servir sin nichos: el diseño no debe favorecer visualmente a un solo perfil de
  comprador (principiante vs. coleccionista vs. regalo) a costa de los otros.
- Preservar el flujo operativo actual: WhatsApp, asistente por reglas, importación CSV
  masiva y los roles admin/cliente son funcionalidad confirmada, no negociable en un
  rediseño visual.
