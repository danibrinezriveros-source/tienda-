// Función serverless única de Vercel: reexporta la app de Express.
// vercel.json enruta todas las rutas hacia aquí.
module.exports = require('../src/app');
