const { pool } = require('../db');

/**
 * Servicio de notificaciones por WhatsApp.
 *
 * Cómo activarlo cuando tengas cuenta de Twilio:
 *  1. Crea una cuenta en https://www.twilio.com/whatsapp y activa el sandbox o un número de WhatsApp Business.
 *  2. Copia tu Account SID, Auth Token y el número de WhatsApp "from" a las variables
 *     TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN y TWILIO_WHATSAPP_FROM en tu archivo .env.
 *  3. Reinicia el servidor y activa el interruptor "Conectar WhatsApp" en el panel de administrador
 *     (Ajustes), indicando el número que debe recibir las confirmaciones (formato: 57300XXXXXXX).
 *
 * Mientras no haya credenciales configuradas, el envío se simula: el mensaje queda
 * registrado en la consola del servidor y el pedido se marca igual como "notificado",
 * así el resto del flujo funciona sin necesitar Twilio todavía.
 */

async function getSetting(key) {
  const { rows } = await pool.query('SELECT value FROM settings WHERE key = $1', [key]);
  return rows[0] ? rows[0].value : null;
}

function isTwilioConfigured() {
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID &&
    process.env.TWILIO_AUTH_TOKEN &&
    process.env.TWILIO_WHATSAPP_FROM
  );
}

async function sendOrderConfirmation(order, items) {
  const enabled = (await getSetting('whatsapp_enabled')) === 'true';
  const notifyNumber = await getSetting('whatsapp_notify_number');

  if (!enabled) {
    return { sent: false, mode: 'desactivado' };
  }

  const itemsText = items.map((i) => `• ${i.quantity}x ${i.product_name}`).join('\n');
  const message =
    `Nuevo pedido #${order.id} confirmado\n` +
    `Cliente: ${order.customer_name}\n` +
    `Teléfono: ${order.customer_phone || 'N/A'}\n\n` +
    `${itemsText}\n\n` +
    `Total: $${Number(order.total).toFixed(2)}`;

  if (!isTwilioConfigured()) {
    // Modo simulado: no hay credenciales de Twilio todavía.
    console.log('--- [WhatsApp simulado] ---');
    console.log(`Para: ${notifyNumber || '(sin número configurado)'}`);
    console.log(message);
    console.log('----------------------------');
    return { sent: true, mode: 'simulado' };
  }

  try {
    const twilio = require('twilio');
    const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    await client.messages.create({
      from: process.env.TWILIO_WHATSAPP_FROM,
      to: `whatsapp:+${notifyNumber.replace(/\D/g, '')}`,
      body: message
    });
    return { sent: true, mode: 'twilio' };
  } catch (err) {
    console.error('Error enviando WhatsApp vía Twilio:', err.message);
    return { sent: false, mode: 'error', error: err.message };
  }
}

module.exports = { sendOrderConfirmation, getSetting, isTwilioConfigured };
