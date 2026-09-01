const nodemailer = require('nodemailer');
const site = require('./site');

/**
 * Envío de correo.
 *
 * Sigue el mismo trato que la confirmación por WhatsApp: mientras no haya
 * credenciales configuradas, el mensaje se imprime en la consola del servidor
 * en vez de enviarse. Así el flujo de recuperación de contraseña funciona
 * completo desde el primer día —se puede probar de punta a punta— sin obligar a
 * contratar un proveedor antes de tener el primer cliente.
 *
 * Para activarlo de verdad, en `.env`:
 *   SMTP_HOST=smtp.tuproveedor.com
 *   SMTP_PORT=587
 *   SMTP_USER=...
 *   SMTP_PASSWORD=...
 *   MAIL_FROM="Arbórea <hola@tudominio.com>"
 *
 * Sirve cualquier proveedor con SMTP: Resend, Postmark, Brevo, Zoho, SES. Lo
 * que no conviene es la cuenta personal de Gmail — el correo de recuperación
 * acaba en spam y el dominio queda mal mirado.
 */

const trim = (v) => (typeof v === 'string' ? v.trim() : '');

function config() {
  return {
    host: trim(process.env.SMTP_HOST),
    port: Number(process.env.SMTP_PORT) || 587,
    user: trim(process.env.SMTP_USER),
    password: trim(process.env.SMTP_PASSWORD),
    from: trim(process.env.MAIL_FROM) || (site.email ? `${site.name} <${site.email}>` : '')
  };
}

function isConfigured() {
  const c = config();
  return Boolean(c.host && c.user && c.password && c.from);
}

let transport = null;

function transporter() {
  if (transport) return transport;
  const c = config();
  transport = nodemailer.createTransport({
    host: c.host,
    port: c.port,
    // El puerto 465 habla TLS desde el primer byte; el 587 empieza en claro y
    // sube a TLS con STARTTLS. Poner `secure` al revés hace que la conexión
    // falle o, peor, que no llegue a cifrarse.
    secure: c.port === 465,
    auth: { user: c.user, pass: c.password },
    // Sin esto, un servidor con certificado inválido pasaría desapercibido y
    // las credenciales SMTP viajarían hacia quien se hubiera interpuesto.
    tls: { rejectUnauthorized: true }
  });
  return transport;
}

/**
 * Envía un correo. Devuelve { sent, mode } y nunca lanza: quien llama a esto
 * está en mitad de un flujo de recuperación, y que el proveedor de correo esté
 * caído no debe convertirse en un error 500 en la cara del usuario.
 */
async function send({ to, subject, text }) {
  const c = config();

  if (!isConfigured()) {
    console.log('--- [Correo simulado: falta configurar SMTP] ---');
    console.log(`Para: ${to}`);
    console.log(`Asunto: ${subject}`);
    console.log(text);
    console.log('------------------------------------------------');
    return { sent: true, mode: 'simulado' };
  }

  try {
    await transporter().sendMail({ from: c.from, to, subject, text });
    return { sent: true, mode: 'smtp' };
  } catch (err) {
    console.error('Error enviando correo:', err.message);
    return { sent: false, mode: 'error', error: err.message };
  }
}

module.exports = { send, isConfigured };
