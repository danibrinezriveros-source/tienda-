# Arborea — vivero online con panel de administrador

Tienda construida con **Node.js + Express**, **PostgreSQL** y **Tailwind CSS**, con una
identidad visual cálida y botánica (verdes, terracota y tipografía serif) pensada para
un vivero: no solo vende, también educa con guías de cuidado y una página "Sobre Arborea".

## Qué incluye

**Cliente**
- Portada con propuesta de valor, categorías destacadas, adelanto de guías de cuidado y
  una sección de compromiso/sostenibilidad.
- Catálogo de productos con precio, stock y filtro por categoría/búsqueda.
- Ficha de producto con "cuidados a simple vista" (a partir de las etiquetas del producto)
  y carrito de compra.
- **`/guias`** — guías de cuidado (luz, riego, trasplante, plagas, plantas para principiantes,
  plantas pet-friendly), contenido estático definido en `src/config/careGuides.js`.
- **`/sobre-arborea`** — misión, valores y compromiso del vivero.
- **Asistente de compra personalizado** (por reglas, sin costo ni API externa): 3 preguntas
  rápidas → recomendaciones ordenadas por afinidad con una frase explicando el porqué.
- Carrito con cantidades editables, que se pone al día con la tienda cada vez que se
  abre: si algo se agotó o cambió de precio mientras esperaba, se dice ahí y no dentro
  del checkout.
- **Checkout sin cuenta**: se pide con nombre, teléfono, dirección, ciudad y departamento.
  El pedido se confirma por WhatsApp, así que el registro es opcional; quien tiene cuenta
  entra y se ahorra escribir sus datos, y conserva el historial de "Mis pedidos".

**Administrador** (`/admin/ingresar`, protegido con contraseña)
- **Cargar catálogo**: alta/edición manual de productos o **importación masiva por CSV**.
- **Pedidos entrantes** (pendientes de confirmar) y **salientes** (confirmado → entregado/cancelado),
  con cambio de estado.
- Panel de resumen con estadísticas (productos activos, pedidos, ingresos).
- **Ajustes → Conectar WhatsApp**: interruptor para activar el envío de confirmación de pedidos
  por WhatsApp. Mientras no tengas cuenta de Twilio, el mensaje se **simula en la consola del
  servidor** para que puedas probar todo el flujo sin costo; cuando tengas credenciales, solo
  agrégalas al `.env` y el envío real se activa sin tocar código (ver más abajo).

## Requisitos

- Node.js 18 o superior
- PostgreSQL 13 o superior (local o en la nube: Railway, Render, Supabase, Neon, etc.)

## Instalación

```bash
# 1. Instalar dependencias
npm install

# 2. Configurar variables de entorno
cp .env.example .env
# Edita .env: datos de conexión a PostgreSQL, SESSION_SECRET,
# y el correo/contraseña que quieres para la cuenta admin inicial.

# 3. Crear las tablas + cuenta admin + catálogo de ejemplo
npm run db:init

# 4. Compilar el CSS de Tailwind
npm run build:css

# 5. Levantar el servidor
npm start
```

Abre `http://localhost:3000` para la tienda, y `http://localhost:3000/admin/ingresar`
para el panel de administrador (usa el email/contraseña que pusiste en `ADMIN_EMAIL` /
`ADMIN_PASSWORD` dentro de `.env`).

Durante desarrollo, en dos terminales puedes correr:
```bash
npm run watch:css   # recompila el CSS al guardar cambios
npm run dev          # reinicia el servidor al guardar cambios (requiere nodemon)
```

## Activar WhatsApp más adelante (Twilio)

1. Crea una cuenta en [twilio.com/whatsapp](https://www.twilio.com/whatsapp) y activa el
   sandbox de pruebas o un número de WhatsApp Business.
2. Copia tu **Account SID**, **Auth Token** y el **número de WhatsApp "from"** en el `.env`:
   ```
   TWILIO_ACCOUNT_SID=xxxxxxxx
   TWILIO_AUTH_TOKEN=xxxxxxxx
   TWILIO_WHATSAPP_FROM=whatsapp:+14155238886
   ```
3. Reinicia el servidor y entra a **Admin → Ajustes**: activa el interruptor y escribe el
   número (con código de país) que debe recibir las confirmaciones. Desde ese momento cada
   pedido nuevo se enviará por WhatsApp de verdad; antes de configurar Twilio, el sistema
   simplemente lo simula en consola.

## Anunciarse en Google y TikTok

El sitio publica lo que necesitan las plataformas de anuncios: `robots.txt`,
`sitemap.xml`, feeds de catálogo en `/feeds/google.xml` y `/feeds/tiktok.csv`,
datos estructurados con precio y disponibilidad, páginas de contacto, términos y
envíos, y los píxeles de Google Ads y TikTok detrás de un aviso de cookies.

Nada de eso se activa solo: cada pieza depende de una variable de entorno, y sin
identificador configurado el script no se carga y su dominio ni siquiera se abre
en la política de seguridad. El orden para ponerlo en marcha está en
[MARKETING.md](MARKETING.md), y las variables en `.env.example`.

## Formato del CSV para carga masiva de catálogo

Las `tags` (etiquetas separadas por coma) alimentan tanto el asistente de compra como los
chips de "cuidados a simple vista" en la ficha de producto — usa palabras como
`principiante`, `poca-luz`, `exterior` o `pet-friendly` para que ambos funcionen bien.

```
name,description,price,stock,category,tags,image_url
Zamioculca,Tolera poca luz y riegos espaciados. Ideal para empezar.,25.00,12,interior,"principiante,poca-luz,pet-friendly",https://...
```

## Estructura del proyecto

```
api/index.js         función serverless de Vercel (reexporta src/app.js)
db/                   esquema SQL e inicialización
src/
  app.js              app de Express (rutas, sesión, middlewares) — sin app.listen()
  server.js           arranque local: valida conexión a DB y llama app.listen()
  db.js               conexión a PostgreSQL (pool)
  middleware/auth.js  sesiones y protección de rutas (usuario/admin)
  config/whatsapp.js  envío de confirmaciones (Twilio o modo simulado)
  config/assistant.js lógica del asistente de compra por reglas
  config/careGuides.js contenido de las guías de cuidado (/guias)
  routes/             rutas públicas, cliente, asistente y administrador
  views/               plantillas EJS (tienda + panel admin)
  public/css           Tailwind (input.css → output.css compilado)
vercel.json           configuración de build/rutas para Vercel
```

## Desplegar en Vercel

El proyecto se despliega como **una función serverless** (`api/index.js`) que envuelve
toda la app de Express; `vercel.json` enruta todo el tráfico hacia ella y compila el CSS
de Tailwind en cada build (`buildCommand`).

1. **Crea una base de datos PostgreSQL alcanzable desde internet** (Vercel Postgres, Neon,
   Supabase o Railway). Una base en `localhost` **no funciona en Vercel** — esa fue la causa
   del `FUNCTION_INVOCATION_FAILED`: no había `DATABASE_URL` de producción configurada y el
   arranque anterior mataba el proceso si no lograba conectar.
2. En **Vercel → Project Settings → Environment Variables**, agrega (entorno *Production*,
   y *Preview* si usas ramas):
   - `DATABASE_URL` — cadena de conexión de tu Postgres (usa la variante "pooled"/pgbouncer
     que ofrecen Neon/Supabase si esperas tráfico concurrente; ver nota abajo).
   - `SESSION_SECRET` — un valor largo y aleatorio, distinto al de desarrollo.
   - `NODE_ENV=production`
   - `ADMIN_EMAIL` / `ADMIN_PASSWORD` — solo se usan al correr `db:init`.
   - `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_WHATSAPP_FROM` — opcional.
3. Inicializa el esquema y el admin **contra esa misma base de datos**, en tu máquina:
   ```bash
   DATABASE_URL="postgres://...tu-base-de-produccion..." NODE_ENV=production npm run db:init
   ```
   (en PowerShell: `$env:DATABASE_URL="..."; $env:NODE_ENV="production"; npm run db:init`)
4. Conecta el repo en Vercel (o hacer `git push` si ya está conectado) y despliega. Vercel
   detecta `api/index.js` automáticamente gracias a `vercel.json`.

**Sesiones**: las sesiones ahora se guardan en PostgreSQL vía `connect-pg-simple` (tabla
`session`, se crea sola) en vez de memoria — imprescindible en serverless, donde cada
invocación puede caer en una instancia distinta y la memoria no se comparte.

**Conexiones a la base de datos**: cada instancia de la función abre su propio pool (ver
`src/db.js`, limitado a 5 conexiones en producción). Si vas a tener tráfico real y
concurrente, usa la connection string "pooled" de tu proveedor (por ejemplo, en Neon el
host `...-pooler...`, en Supabase el puerto `6543`) para no agotar las conexiones de Postgres.

## Seguridad

Lo que ya está puesto, y por qué, para que nadie lo quite por error.

**Identidad y sesión**
- `SESSION_SECRET` es obligatoria en producción y debe tener 32 caracteres o más: la app
  **se niega a arrancar** sin ella. Antes había un valor por defecto escrito en el código, es
  decir, público, y con él se puede firmar la cookie de cualquiera.
- La cookie de sesión se llama `__Host-arborea.sid` en producción. Ese prefijo obliga al
  navegador a aceptarla solo desde este mismo origen y por HTTPS, así que un subdominio
  comprometido no puede sobrescribirla para fijar una sesión.
- El ID de sesión se regenera al ingresar, al registrarse y al cambiar la contraseña.
- La sesión del panel caduca a las **12 horas** desde que se autenticó, aparte de la cookie.
- Contraseñas con bcrypt de coste 12, mínimo 10 caracteres (12 para el panel).
  Se pueden cambiar desde el sitio: clientes en `/cuenta/contrasena`, administrador en
  Ajustes. `db:init` exige un `ADMIN_PASSWORD` propio de 12 caracteres o más.

**Escrituras**
- Todo formulario que escribe algo lleva un token CSRF (`src/middleware/csrf.js`) y el
  servidor rechaza con 403 lo que llegue sin él. Los formularios con archivo verifican el
  token justo después de multer, y solo esas tres rutas pueden recibir `multipart/form-data`.
- Límite de peticiones global, y más estrecho en ingreso (5 intentos / 30 min en el panel),
  registro, checkout, segundo factor y cambio de contraseña. **El conteo vive en Postgres**
  (`src/middleware/rateLimitStore.js`), no en la memoria del proceso: en Vercel cada
  instancia serverless llevaba el suyo, así que "cinco intentos" eran cinco *por instancia*
  y en la práctica ninguno.
- La importación por CSV valida el archivo entero antes de escribir y lo inserta dentro de
  una transacción: o entra completo, o no entra nada.
- Retirar un producto lo marca inactivo; no borra la fila, para no perder el historial de
  pedidos ni chocar con la clave foránea.

**Contenido**
- Cabeceras por `helmet`: CSP con nonce (sin `unsafe-inline` en scripts), `frame-ancestors
  'none'`, `form-action 'self'`, HSTS de dos años, `Permissions-Policy` restrictiva.
- El JSON-LD se serializa con `jsonForScript` (`src/utils/seo.js`), que escapa `<`, `>` y `&`
  para que un nombre de producto no pueda cerrar la etiqueta `<script>`.
- Las fotos subidas se validan por los bytes del archivo, no por lo que diga el formulario;
  se acepta JPG, PNG, WEBP y GIF, y **no** SVG (puede llevar `<script>` dentro).
- Las URLs de foto pegadas a mano solo se aceptan si son `http(s)` o una ruta interna.

**Migrar una base que ya tiene clientes**

`npm run db:init` es el arranque de una tienda vacía: crea las tablas, la cuenta de
administrador y —si el catálogo está vacío— ocho plantas de ejemplo. Contra producción eso
último es un accidente esperando, así que para migrar se usa:

```bash
npm run db:migrar        # = node db/init.js --solo-esquema
```

Crea solo las tablas y columnas que falten. No siembra el catálogo, no crea la cuenta de
administrador, no pide `ADMIN_PASSWORD`. Todo es `IF NOT EXISTS`, así que correrlo dos
veces no cambia nada. Al terminar imprime cuántas tablas, productos y usuarios hay, para
confirmar de un vistazo que apuntaste a la base que creías.

Contra una base remota hay que pasar `NODE_ENV=production`: sin esa variable la conexión no
usa TLS y Neon o Supabase la rechazan — parece un error de red y no lo es.

```bash
NODE_ENV=production DATABASE_URL='...' npm run db:migrar
```

**Infraestructura**
- TLS verificado contra la base de datos (`rejectUnauthorized: true`). Si tu proveedor usa
  una autoridad propia, pásale el certificado por `DATABASE_CA_CERT`; no desactives la
  verificación.
- Sirve el sitio detrás de HTTPS. `app.set('trust proxy', 1)` está activado para que las
  cookies `secure` funcionen tras el proxy de Vercel.
- Las sesiones se guardan en PostgreSQL (`connect-pg-simple`), no en memoria, así que
  sobreviven a reinicios y escalado horizontal.

**Segundo factor del panel (TOTP)**
- Se activa desde **Admin → Seguridad**: se escanea un QR con Google Authenticator, Authy,
  1Password o el gestor del teléfono, y se confirma con un código antes de quedar activo —
  sin esa confirmación se podría cerrar el panel con una llave que el teléfono no guardó.
- Con el segundo factor activo, la contraseña correcta **no abre nada**: deja una
  autorización a medias (`session.pendingAdmin`, 10 minutos) que ninguna ruta del panel
  reconoce. Hacen falta los dos factores.
- Ocho **códigos de recuperación** de un solo uso para cuando se pierde el teléfono. Se
  muestran una vez; en la base de datos solo quedan sus hashes.
- El algoritmo está en `src/utils/totp.js`, escrito sobre `crypto` en vez de traído de una
  librería: cabe en media página y su corrección se comprueba contra los vectores oficiales
  del RFC 6238. El secreto se guarda cifrado con AES-256-GCM (`TOTP_ENCRYPTION_KEY`).
- Desactivarlo cuesta lo mismo que activarlo: contraseña **y** código vigente.

**Recuperación de contraseña**
- `/recuperar` envía un enlace de un solo uso que vence en una hora. De cada token solo se
  guarda el hash SHA-256: quien lea la base de datos no puede reconstruir ningún enlace.
- La respuesta es idéntica exista o no la cuenta, para que el formulario no sirva de censo
  de clientes.
- Al restablecer se cierran **todas** las sesiones de esa cuenta. Lo mismo al cambiar la
  contraseña desde dentro (`src/utils/sessions.js`): antes solo se invalidaba la del
  navegador que hacía el cambio, y el intruso conservaba la suya durante días.
- El envío usa SMTP (`SMTP_*` en `.env`). Sin configurar, el correo se imprime en la consola
  del servidor igual que la confirmación por WhatsApp, así que el flujo se puede probar
  entero desde el primer día.

**Registro de actividad**
- Todo lo que se hace en el panel queda anotado en `admin_audit` y se lee en
  **Admin → Registro**: ingresos, intentos fallidos, códigos de segundo factor incorrectos,
  altas y bajas de producto, importaciones, cambios de estado de pedidos, cambios de
  contraseña. Con quién, cuándo, sobre qué y desde qué IP.
- El correo del actor se copia en la fila, no se referencia: si la cuenta se borra, el
  registro sigue diciendo quién hizo qué.
- Se conservan 180 días. Un registro perpetuo deja de ser útil y pasa a ser un archivo de
  direcciones IP que hay que custodiar sin motivo.

**Lo que todavía no está**
- No hay bloqueo por cuenta, solo por dirección IP. Un atacante con muchas direcciones
  diluye el límite. La defensa real ahí es el segundo factor.
- El registro de actividad no avisa solo: hay que entrar a mirarlo.
- Los clientes no tienen segundo factor, solo el panel.
