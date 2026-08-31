// El envío se cotiza por WhatsApp, así que la tienda no calcula tarifas — pero
// sí necesita saber a dónde va el paquete antes de esa conversación. Una
// dirección suelta ("calle 45 #12-30") no dice si el pedido sale de la ciudad
// ni por cuál transportadora, y esa es exactamente la pregunta que abría cada
// chat. Departamento cerrado en una lista para que llegue escrito igual
// siempre; ciudad libre, porque son más de mil.

const REGIONS = [
  'Amazonas', 'Antioquia', 'Arauca', 'Archipiélago de San Andrés, Providencia y Santa Catalina',
  'Atlántico', 'Bogotá D.C.', 'Bolívar', 'Boyacá', 'Caldas', 'Caquetá', 'Casanare', 'Cauca',
  'Cesar', 'Chocó', 'Córdoba', 'Cundinamarca', 'Guainía', 'Guaviare', 'Huila', 'La Guajira',
  'Magdalena', 'Meta', 'Nariño', 'Norte de Santander', 'Putumayo', 'Quindío', 'Risaralda',
  'Santander', 'Sucre', 'Tolima', 'Valle del Cauca', 'Vaupés', 'Vichada'
];

const isRegion = (value) => REGIONS.includes(value);

module.exports = { REGIONS, isRegion };
