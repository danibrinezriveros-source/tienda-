# Anunciar Arbórea en Google y TikTok

El sitio ya trae todo lo que depende del código. Lo que queda son cuentas y
credenciales, que solo puedes crear tú. Este documento es el orden en que
conviene hacerlo: cada fase depende de que la anterior esté cerrada.

---

## Fase 0 — Bloqueantes reales

Ninguna plataforma aprueba una tienda hasta que esto esté resuelto.

### 1. Fotos de producto — bloqueante crítico

**53 productos activos, 0 con fotografía.** Ahora mismo la ficha muestra un
dibujo generado por código, y eso basta para vender, pero no para anunciarse:
Google Merchant Center y el catálogo de TikTok rechazan cualquier artículo sin
foto real. Puedes comprobarlo tú mismo — el feed sale vacío:

```bash
curl -s http://localhost:3000/feeds/google.xml
```

Sin fotos puedes correr anuncios de búsqueda y de video (llevando tráfico a la
home o a una categoría), pero **no** Shopping, **no** Performance Max con
catálogo y **no** anuncios dinámicos de producto — que es donde está el retorno
en una tienda. Súbelas desde *Admin → Cargar catálogo*.

Requisitos de las dos plataformas: fondo limpio, el producto ocupando al menos
el 75 % del encuadre, mínimo 500×500 px (recomendado 1000×1000), sin texto,
logos ni marcas de agua encima.

### 2. Dominio propio

Define `SITE_URL` con el dominio final, sin barra al final. De ahí salen las URL
canónicas, el sitemap, la vista previa al compartir y el enlace de cada producto
en los feeds. Mientras el sitio esté en localhost o en una URL de preview de
Vercel, `robots.txt` responde `Disallow: /` a propósito: un dominio de preview
indexado compite contra el real por las mismas búsquedas.

### 3. Datos del negocio

Llena en `.env` el bloque `BUSINESS_*`. Un revisor humano abre `/contacto` y
busca un nombre legal, un NIT, un teléfono y un correo. Si no los encuentra,
rechaza la cuenta y apelar toma semanas.

### 4. Revisión legal de `/terminos` y `/envios-y-devoluciones`

Los textos están redactados como punto de partida sobre la Ley 1480 de 2011,
pero los tiempos de envío, la cobertura y el costo tienen que coincidir con lo
que realmente haces. Las plataformas contrastan lo prometido contra las quejas
de los clientes, y una discrepancia suspende la cuenta.

### 5. Peso de las imágenes de entrada

Las seis fotos de `src/public/img/entrada/` pesan ~1,1 MB cada una. La home carga
una completa antes de mostrar nada. En 4G eso son varios segundos, y tanto el
nivel de calidad de Google Ads como el costo por clic de TikTok castigan una
página lenta: estás pagando por clics que se van antes de ver la tienda.
Recomprímelas a WebP de ~150 KB manteniendo el nombre, o sirve variantes por
tamaño.

---

## Fase 1 — Verificar que el dominio es tuyo

Sin esto no se puede pasar a nada más.

| Plataforma | Dónde | Qué hacer |
|---|---|---|
| Google | [Search Console](https://search.google.com/search-console) → Agregar propiedad → Prefijo de URL → **Etiqueta HTML** | Copia solo el valor del `content` a `GOOGLE_SITE_VERIFICATION`, despliega y pulsa Verificar |
| TikTok | Business Center → Assets → Website → **Meta tag** | Copia el valor a `TIKTOK_DOMAIN_VERIFICATION`, despliega y verifica |

Ya verificado en Google, envía el sitemap desde Search Console → Sitemaps:
`https://tudominio.com/sitemap.xml`

La verificación de Search Console es también la que habilita Merchant Center, así
que no la repitas allá.

---

## Fase 2 — Medición

El orden importa: crea primero la propiedad, luego la conversión, y solo al
final pega los identificadores.

### Google Analytics 4
1. [analytics.google.com](https://analytics.google.com) → crear propiedad → flujo de datos web.
2. Copia el ID `G-XXXXXXXXXX` a `GA4_MEASUREMENT_ID`.

### Google Ads
1. Crea la cuenta en [ads.google.com](https://ads.google.com) (no lances campaña todavía).
2. Herramientas → Conversiones → Nueva acción de conversión → **Sitio web** → configuración manual.
3. Nómbrala *Compra*, categoría *Purchase*, valor *usar valores distintos*, contar *cada conversión*.
4. Toma la etiqueta, que se ve como `AW-123456789/AbC-D_efGhIj`:
   - la parte antes de `/` va en `GOOGLE_ADS_ID`
   - la parte después de `/` va en `GOOGLE_ADS_PURCHASE_LABEL`
5. Vincula Google Ads con la propiedad de GA4 (Herramientas → Vinculaciones).

### TikTok
1. [Events Manager](https://ads.tiktok.com) → Conectar fuente de datos → Web → **Instalación manual del pixel**.
2. Copia el ID del pixel a `TIKTOK_PIXEL_ID`.
3. Ignora el fragmento de código que te ofrece copiar: el sitio ya lo implementa,
   y pegarlo otra vez duplicaría cada evento.

### Comprobar que llega
Después de desplegar, con la extensión **Google Tag Assistant** y **TikTok Pixel
Helper**, recorre: ficha de producto → agregar al carrito → checkout → confirmar
pedido. Deben aparecer, en ese orden:

| Paso | Google | TikTok |
|---|---|---|
| Ver una planta | `view_item` | `ViewContent` |
| Agregar al carrito | `add_to_cart` | `AddToCart` |
| Ver el carrito | `view_cart` | — |
| Iniciar checkout | `begin_checkout` | `InitiateCheckout` |
| Pedido creado | `purchase` + `conversion` | `CompletePayment` + `PlaceAnOrder` |

Nada de esto se dispara hasta aceptar el aviso de cookies — es el
comportamiento correcto, no un fallo. Para volver a probar desde cero, entra a
`/privacidad` y pulsa *revisar mi decisión sobre cookies*.

**Nota sobre el evento de compra.** Se dispara cuando el pedido queda creado en
estado *pendiente*, no cuando cobras: este flujo confirma por WhatsApp antes de
cobrar. Es lo más cercano a una venta que el sitio puede afirmar por sí solo, y
es una base legítima para optimizar. Si más adelante quieres que Google y TikTok
aprendan solo de los pedidos que sí terminaron pagados, hay que importar
conversiones offline — implica guardar el `gclid`/`ttclid` junto al pedido y
exportar los confirmados. No está hecho.

---

## Fase 3 — Catálogo de productos

Solo después de que los productos tengan foto.

### Google Merchant Center
1. [merchants.google.com](https://merchants.google.com) → crear cuenta, país Colombia, moneda COP.
2. Confirma que el sitio aparece verificado (viene de Search Console).
3. Productos → Feeds → Agregar → **Feed programado**:
   `https://tudominio.com/feeds/google.xml`, frecuencia diaria.
4. Configura envío e impuestos en la cuenta: sin eso, todos los productos quedan
   rechazados aunque el feed esté perfecto.
5. Vincula Merchant Center con Google Ads.

### Catálogo de TikTok
1. Business Center → Assets → Catálogos → Crear catálogo (Colombia, COP).
2. Agregar productos → **Feed programado**: `https://tudominio.com/feeds/tiktok.csv`.

### Qué esperar del feed
Solo entran los productos activos, con precio mayor a cero y con foto. Los demás
se omiten en silencio — es deliberado: una fila rechazada ensucia la cuenta y
puede suspender el catálogo entero. Para saber cuántos productos entran hoy:

```bash
curl -s https://tudominio.com/feeds/tiktok.csv | tail -n +2 | wc -l
```

Los productos van sin GTIN (`identifier_exists: no`), que es lo correcto para
plantas, y en la categoría 2802 de Google (*Home & Garden > Plants*).

---

## Fase 4 — Campañas

Con lo anterior cerrado, el orden que suele dar mejor retorno para un vivero:

1. **Búsqueda de marca (Google).** Barata y defensiva: evita que alguien más
   compre tu nombre. Presupuesto mínimo.
2. **Shopping / Performance Max (Google).** Aquí vive la intención de compra —
   alguien que busca "monstera deliciosa precio" ya decidió. Requiere el catálogo
   de la Fase 3.
3. **TikTok con video.** No es intención, es descubrimiento: el formato que
   funciona es el proceso, no el producto quieto. Trasplantar, sacar una planta
   de la maceta, mostrar la raíz, el antes y después de una planta recuperada.
   El mundo isométrico de la home da material propio que casi ningún vivero
   tiene.

Deja cada campaña correr al menos 2 semanas sin tocarla: los dos algoritmos
tienen ventana de aprendizaje y editar la puja la reinicia.

---

## Lo que hace el sitio, en una tabla

| Ruta | Para qué |
|---|---|
| `/robots.txt` | Abre el sitio a rastreadores en producción; lo cierra entero en preview y local |
| `/sitemap.xml` | Todas las páginas públicas más una entrada por producto activo |
| `/feeds/google.xml` | Feed RSS para Merchant Center |
| `/feeds/tiktok.csv` | Feed CSV para el catálogo de TikTok |
| `/contacto` | Datos verificables del negocio |
| `/terminos` | Condiciones de venta |
| `/envios-y-devoluciones` | Tiempos, cobertura, garantía y retracto |
| `/privacidad` | Política de datos, con el detalle de cookies de medición |

Además, cada página lleva URL canónica, etiquetas Open Graph para la vista
previa del enlace, y datos estructurados JSON-LD — `Store` en todas y `Product`
con precio y disponibilidad en cada ficha, que es lo que Merchant Center
contrasta contra el feed. El carrito, el checkout y la cuenta salen marcados
`noindex`.

---

## Lo que no puedo hacer por ti

Crear las cuentas, aceptar los términos de servicio de las plataformas y
registrar un medio de pago son acciones que tienen que salir de ti. Cuando
tengas los identificadores, pégalos en las variables de entorno de Vercel y
redespliega: no hay que tocar código.

## Lo que quedó fuera

- **API de conversiones del lado del servidor** (Events API de TikTok, Conversions
  API de Google). Mejora la medición frente a bloqueadores y a Safari, pero
  necesita una clave de acceso por plataforma.
- **Importación de conversiones offline** para medir solo los pedidos realmente
  confirmados por WhatsApp.
- **Consentimiento por región.** El aviso se muestra a todo el mundo por igual.
  Es lo más conservador y funciona; si algún día el tráfico europeo pesa, habría
  que distinguir.
