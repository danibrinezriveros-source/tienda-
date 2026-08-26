/**
 * Contenido informativo de cuidado de plantas, usado en la página /guias
 * y como adelanto en la portada. Es contenido estático de referencia general
 * (no reemplaza el cuidado específico que pueda necesitar cada especie).
 */

const CARE_GUIDES = [
  {
    slug: 'luz',
    icon: 'sun',
    title: 'Cuánta luz necesita tu planta',
    summary: 'La causa más común de que una planta sufra no es el riego: es la luz.',
    tips: [
      'Luz directa: varias horas de sol tocando las hojas (cactus, suculentas, la mayoría de plantas de exterior).',
      'Luz indirecta brillante: cerca de una ventana pero sin sol directo (potos, monstera, singonio).',
      'Poca luz: pasillos y rincones alejados de ventanas (sansevieria, zamioculca, aglaonema).',
      'Si las hojas nuevas salen pequeñas o muy espaciadas, casi siempre falta luz.'
    ]
  },
  {
    slug: 'riego',
    icon: 'drop',
    title: 'Riego sin excesos',
    summary: 'Se matan más plantas por exceso de agua que por falta de ella.',
    tips: [
      'Riega cuando los primeros 2-3 cm de sustrato estén secos al tacto, no en un horario fijo.',
      'Usa macetas con drenaje y deja que sobre el agua salga por el fondo.',
      'En invierno o temporada fría, la mayoría de plantas necesitan bastante menos agua.',
      'Hojas amarillas y blandas suelen indicar exceso de agua; hojas secas y crujientes, falta de ella.'
    ]
  },
  {
    slug: 'trasplante',
    icon: 'repot',
    title: 'Trasplante y sustrato',
    summary: 'Cambiar de maceta a tiempo evita que la planta se quede sin espacio para crecer.',
    tips: [
      'Trasplanta cuando veas raíces saliendo por los agujeros de drenaje o el crecimiento se detenga.',
      'La maceta nueva no debe ser mucho más grande: 2-4 cm más de diámetro es suficiente.',
      'Usa un sustrato apto para la especie (las suculentas necesitan uno más arenoso y con mejor drenaje).',
      'La mejor época para trasplantar es en primavera o al inicio de la temporada de crecimiento.'
    ]
  },
  {
    slug: 'plagas',
    icon: 'search',
    title: 'Plagas y enfermedades comunes',
    summary: 'Revisar tus plantas cada semana permite atajar cualquier problema a tiempo.',
    tips: [
      'Araña roja: puntitos amarillos en las hojas y telarañas finas; sube con el ambiente seco.',
      'Cochinilla algodonosa: bultos blancos en tallos y uniones de hojas; se retira con alcohol isopropílico.',
      'Hongos en la base: suelen aparecer por exceso de riego o falta de ventilación.',
      'Aísla la planta afectada mientras la tratas para no contagiar al resto.'
    ]
  },
  {
    slug: 'principiantes',
    icon: 'sprout',
    title: 'Plantas para empezar sin miedo',
    summary: 'Si vas empezando, elige especies que perdonen algún olvido.',
    tips: [
      'Zamioculca y sansevieria: toleran poca luz y riegos espaciados.',
      'Potos: crece rápido, se adapta a casi cualquier rincón de la casa.',
      'Suculentas: ideales si tienes mucha luz natural y tiendes a regar de menos.',
      'Empieza con una o dos plantas: es más fácil aprender su ritmo antes de ampliar la colección.'
    ]
  },
  {
    slug: 'mascotas',
    icon: 'paw',
    title: 'Plantas seguras para hogares con mascotas',
    summary: 'Algunas especies comunes son tóxicas para perros y gatos si las mastican.',
    tips: [
      'Opciones no tóxicas frecuentes: areca, calathea, maranta, helecho de Boston.',
      'Evita monstera, potos y dieffenbachia al alcance de mascotas curiosas.',
      'Ante cualquier duda sobre una especie puntual, consulta con tu veterinario.',
      'Colgar las plantas más delicadas es una forma sencilla de mantenerlas fuera de alcance.'
    ]
  }
];

module.exports = { CARE_GUIDES };
