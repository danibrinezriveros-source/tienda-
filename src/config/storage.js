const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/**
 * Sube la foto de un producto y devuelve la URL pública.
 *
 * En producción (Vercel), usa Vercel Blob — necesita la variable
 * BLOB_READ_WRITE_TOKEN (se agrega sola al conectar un Blob store al
 * proyecto desde Vercel → Storage). El disco de una función serverless
 * es efímero, así que no se puede guardar el archivo ahí.
 *
 * En desarrollo local, si no hay ese token configurado, se guarda en
 * src/public/uploads/ para poder probar el flujo completo sin depender
 * de un servicio externo.
 */
async function uploadProductImage(buffer, originalName, mimetype) {
  const ext = path.extname(originalName || '') || '';
  const filename = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`;

  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const { put } = require('@vercel/blob');
    const blob = await put(`productos/${filename}`, buffer, {
      access: 'public',
      contentType: mimetype
    });
    return blob.url;
  }

  const uploadsDir = path.join(__dirname, '..', 'public', 'uploads');
  fs.mkdirSync(uploadsDir, { recursive: true });
  fs.writeFileSync(path.join(uploadsDir, filename), buffer);
  return `/uploads/${filename}`;
}

module.exports = { uploadProductImage };
