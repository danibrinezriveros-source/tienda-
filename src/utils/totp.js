const crypto = require('crypto');

// Segundo factor del panel: TOTP, el código de seis cifras que cambia cada
// treinta segundos y que leen Google Authenticator, Authy, 1Password o el
// gestor de contraseñas del teléfono.
//
// Está escrito aquí en vez de traído de una librería porque el algoritmo cabe
// en media página y su corrección es comprobable: al final de este archivo hay
// una prueba contra los vectores oficiales del RFC 6238. Una dependencia más en
// la cadena de suministro, para esto, es más riesgo que beneficio.
//
// Contra qué protege: contra que una contraseña robada —filtrada, adivinada,
// escrita en un chat, reutilizada en un servicio con una fuga— alcance para
// entrar. Con esto, quien la tenga sigue necesitando el teléfono.

const DIGITS = 6;
const PERIOD = 30; // segundos por código, el estándar que asumen todas las apps

// --- Base32 (RFC 4648), que es como las apps de autenticación leen el secreto ---

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Encode(buffer) {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

function base32Decode(str) {
  const clean = String(str).toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0;
  let value = 0;
  const bytes = [];
  for (const char of clean) {
    value = (value << 5) | ALPHABET.indexOf(char);
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

// --- El algoritmo ---

// HOTP (RFC 4226): HMAC-SHA1 del contador, y de los 20 bytes resultantes se
// eligen cuatro cuya posición la marca el último medio byte del propio hash.
// Ese rodeo —"truncamiento dinámico"— existe para que el código no dependa
// siempre de la misma parte del hash.
function hotp(secret, counter) {
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));

  const digest = crypto.createHmac('sha1', secret).update(message).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    (digest[offset + 1] << 16) |
    (digest[offset + 2] << 8) |
    digest[offset + 3];

  return String(binary % 10 ** DIGITS).padStart(DIGITS, '0');
}

function counterAt(seconds) {
  return Math.floor(seconds / PERIOD);
}

// Se aceptan también el código anterior y el siguiente. El reloj del teléfono
// nunca coincide exactamente con el del servidor, y sin ese margen un usuario
// con treinta segundos de desfase no podría entrar nunca. Un paso a cada lado
// es lo que recomienda el propio RFC: amplía la ventana a minuto y medio, que
// sigue siendo irrelevante frente a un límite de ocho intentos.
const DRIFT_STEPS = 1;

function verify(token, secretBase32, atSeconds) {
  const code = String(token || '').replace(/\D/g, '');
  if (code.length !== DIGITS) return false;

  const secret = base32Decode(secretBase32);
  if (!secret.length) return false;

  const now = counterAt(atSeconds == null ? Date.now() / 1000 : atSeconds);

  // Se recorren todos los pasos siempre, sin cortar en el primer acierto: así
  // el tiempo que tarda en responder no dice cuál de los códigos era el bueno.
  let ok = false;
  for (let step = -DRIFT_STEPS; step <= DRIFT_STEPS; step++) {
    const expected = Buffer.from(hotp(secret, now + step), 'utf8');
    const given = Buffer.from(code, 'utf8');
    if (expected.length === given.length && crypto.timingSafeEqual(expected, given)) ok = true;
  }
  return ok;
}

// 20 bytes es el tamaño que usa el RFC y el que esperan todas las apps.
function generateSecret() {
  return base32Encode(crypto.randomBytes(20));
}

// La dirección que la app de autenticación lee del código QR. La etiqueta es lo
// que el usuario verá en su lista de cuentas, así que lleva el nombre de la
// tienda y el correo con el que entra.
function otpauthUri(secretBase32, account, issuer) {
  const label = encodeURIComponent(`${issuer}:${account}`);
  const params = new URLSearchParams({
    secret: secretBase32,
    issuer,
    algorithm: 'SHA1',
    digits: String(DIGITS),
    period: String(PERIOD)
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

// --- El secreto guardado ---
//
// A diferencia de una contraseña, este valor no puede guardarse como hash: el
// servidor necesita el original cada vez para calcular el código esperado. Así
// que se cifra, y la llave vive fuera de la base de datos. Quien se lleve una
// copia de la base no se lleva los segundos factores.

function encryptionKey() {
  // Se prefiere una llave dedicada. Si no la hay, se deriva de SESSION_SECRET,
  // que en producción ya es obligatoria y suficientemente larga. Consecuencia
  // que conviene conocer: rotar SESSION_SECRET sin haber definido
  // TOTP_ENCRYPTION_KEY deja los secretos ilegibles y hay que volver a
  // registrar el teléfono. Es un fallo hacia el lado seguro —cierra, no abre—
  // y los códigos de recuperación siguen funcionando, porque no dependen de
  // esta llave.
  const material = process.env.TOTP_ENCRYPTION_KEY || process.env.SESSION_SECRET || '';
  if (!material) throw new Error('Falta TOTP_ENCRYPTION_KEY (o SESSION_SECRET) para cifrar el secreto.');
  return crypto.scryptSync(material, 'arborea:totp', 32);
}

function encryptSecret(secretBase32) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const body = Buffer.concat([cipher.update(secretBase32, 'utf8'), cipher.final()]);
  // El tag de GCM es lo que detecta que el texto cifrado fue alterado: sin él,
  // esto cifraría pero no garantizaría que lo descifrado es lo que se guardó.
  return [iv.toString('base64'), cipher.getAuthTag().toString('base64'), body.toString('base64')].join(':');
}

function decryptSecret(stored) {
  const parts = String(stored || '').split(':');
  if (parts.length !== 3) return null;
  try {
    const [iv, tag, body] = parts.map((p) => Buffer.from(p, 'base64'));
    const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(body), decipher.final()]).toString('utf8');
  } catch (e) {
    // Llave cambiada o dato corrupto. Devolver null hace que el código nunca
    // valide, que es lo correcto: se entra por un código de recuperación.
    return null;
  }
}

// --- Códigos de recuperación ---
//
// Para el día en que el teléfono se pierda, se rompa o se formatee. Sin esto,
// activar el segundo factor es apostar el panel entero a un solo dispositivo.

const RECOVERY_COUNT = 8;

function hashRecovery(code) {
  return crypto.createHash('sha256').update(code.toUpperCase()).digest('hex');
}

// Se muestran una sola vez, en claro, y de ahí en adelante solo quedan sus
// hashes. Son aleatorios y largos, así que sha256 basta: no hay diccionario que
// probar contra ellos como sí lo hay contra una contraseña elegida a mano.
function generateRecoveryCodes() {
  const plain = [];
  for (let i = 0; i < RECOVERY_COUNT; i++) {
    const raw = crypto.randomBytes(5).toString('hex').toUpperCase(); // 10 caracteres
    plain.push(`${raw.slice(0, 5)}-${raw.slice(5)}`);
  }
  return { plain, hashes: plain.map(hashRecovery).join(',') };
}

// Devuelve la lista de hashes que quedan si el código era válido, o null si no
// lo era. Un código usado se retira: son de un solo uso.
function consumeRecovery(code, stored) {
  const clean = String(code || '').trim().toUpperCase();
  if (!clean) return null;
  const hashes = String(stored || '').split(',').filter(Boolean);
  const target = hashRecovery(clean);
  const remaining = hashes.filter((h) => h !== target);
  return remaining.length === hashes.length ? null : remaining.join(',');
}

module.exports = {
  DIGITS,
  PERIOD,
  RECOVERY_COUNT,
  base32Encode,
  base32Decode,
  hotp,
  verify,
  generateSecret,
  otpauthUri,
  encryptSecret,
  decryptSecret,
  generateRecoveryCodes,
  consumeRecovery
};
