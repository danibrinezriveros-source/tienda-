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
- Registro/login de cliente y checkout con historial de "Mis pedidos".

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
db/                  esquema SQL e inicialización
src/
  server.js          servidor Express
  db.js              conexión a PostgreSQL
  middleware/auth.js  sesiones y protección de rutas (usuario/admin)
  config/whatsapp.js  envío de confirmaciones (Twilio o modo simulado)
  config/assistant.js lógica del asistente de compra por reglas
  config/careGuides.js contenido de las guías de cuidado (/guias)
  routes/            rutas públicas, cliente, asistente y administrador
  views/             plantillas EJS (tienda + panel admin)
  public/css          Tailwind (input.css → output.css compilado)
```

## Notas de seguridad para producción

- Cambia `SESSION_SECRET` y las contraseñas de ejemplo antes de publicar el sitio.
- Sirve el sitio detrás de HTTPS (así las cookies de sesión pueden ir con `secure: true`, ya
  configurado automáticamente cuando `NODE_ENV=production`).
- Considera usar `connect-pg-simple` (ya incluido como dependencia) para guardar las sesiones
  en PostgreSQL en vez de memoria, si vas a tener varias instancias del servidor.
