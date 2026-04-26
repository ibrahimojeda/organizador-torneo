/* ============================================================
   CONFIG.JS — Constantes WKF + configuración Supabase
   ============================================================ */

/* ----- Supabase (completar después de crear el proyecto) ----- */
const SUPABASE_URL      = 'https://ubhmahzqakgqhcvvnpzv.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InViaG1haHpxYWtncWhjdnZucHp2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU3MDIwNDAsImV4cCI6MjA5MTI3ODA0MH0.cX0HB_3zQLRS8w1MCxedc53EN1OZSf1itSCJoJco_TA';

/* ----- Grupos de Edad (WKF + torneos locales) ----- */
const AGE_GROUPS = [
  { id: 'mini',       label: 'Mini',       minAge: 4,  maxAge: 5  },
  { id: 'benjamines', label: 'Benjamines', minAge: 6,  maxAge: 7  },
  { id: 'alevines',   label: 'Alevines',   minAge: 8,  maxAge: 9  },
  { id: 'infantil',   label: 'Infantil',   minAge: 10, maxAge: 11 },
  { id: 'cadete',     label: 'Cadete',     minAge: 12, maxAge: 15 },
  { id: 'junior',     label: 'Junior',     minAge: 16, maxAge: 17 },
  { id: 'sub21',      label: 'Sub-21',     minAge: 18, maxAge: 20 },
  { id: 'senior',     label: 'Senior',     minAge: 18, maxAge: 34 },
  { id: 'veteranos',  label: 'Veteranos',  minAge: 35, maxAge: 99 },
];

/* ----- Categorías de Peso WKF — Kumite ----- */
const WEIGHT_CLASSES = {
  M: [
    { id: 'm60',    label: '-60 kg',  max: 60,   min: 0    },
    { id: 'm67',    label: '-67 kg',  max: 67,   min: 60.1 },
    { id: 'm75',    label: '-75 kg',  max: 75,   min: 67.1 },
    { id: 'm84',    label: '-84 kg',  max: 84,   min: 75.1 },
    { id: 'mopen',  label: '+84 kg',  max: null, min: 84.1 },
  ],
  F: [
    { id: 'f50',    label: '-50 kg',  max: 50,   min: 0    },
    { id: 'f55',    label: '-55 kg',  max: 55,   min: 50.1 },
    { id: 'f61',    label: '-61 kg',  max: 61,   min: 55.1 },
    { id: 'f68',    label: '-68 kg',  max: 68,   min: 61.1 },
    { id: 'fopen',  label: '+68 kg',  max: null, min: 68.1 },
  ],
};

/* ----- Cinturones individuales ----- */
const BELTS = [
  { id: 'blanco',       label: 'Blanco',       color: '#FFFFFF', textColor: '#1a1a2e', order: 1 },
  { id: 'amarillo',     label: 'Amarillo',      color: '#FFD700', textColor: '#1a1a2e', order: 2 },
  { id: 'naranja',      label: 'Naranja',       color: '#FFA500', textColor: '#1a1a2e', order: 3 },
  { id: 'verde',        label: 'Verde',         color: '#2e7d32', textColor: '#FFFFFF', order: 4 },
  { id: 'azul',         label: 'Azul',          color: '#1565c0', textColor: '#FFFFFF', order: 5 },
  { id: 'morado',       label: 'Morado',        color: '#7e22ce', textColor: '#FFFFFF', order: 6 },
  { id: 'marron',       label: 'Marrón',        color: '#6d4c41', textColor: '#FFFFFF', order: 7 },
  { id: 'negro',        label: 'Negro (Kyu/Dan)', color: '#1a1a1a', textColor: '#FFD700', order: 8 },
];

/* ----- Grupos de cinturón para competencia ----- */
const BELT_GROUPS = [
  {
    id: 'principiante',
    label: 'Principiante',
    belts: ['blanco', 'amarillo', 'naranja'],
    description: 'Cinturón Blanco, Amarillo y Naranja',
  },
  {
    id: 'intermedio',
    label: 'Intermedio',
    belts: ['verde', 'azul', 'morado'],
    description: 'Cinturón Verde, Azul y Morado',
  },
  {
    id: 'avanzado',
    label: 'Avanzado',
    belts: ['marron', 'negro'],
    description: 'Cinturón Marrón y Negro',
  },
];

/* ----- Disciplinas ----- */
const DISCIPLINES = [
  { id: 'kumite', label: 'Kumite', icon: '🥊', description: 'Combate entre dos competidores' },
  { id: 'kata',   label: 'Kata',   icon: '🥋', description: 'Ejecución de formas individuales' },
];

/* ----- Géneros ----- */
const GENDERS = [
  { id: 'M', label: 'Masculino', icon: '♂' },
  { id: 'F', label: 'Femenino',  icon: '♀' },
];

/* ----- Sistemas de Llaves ----- */
const BRACKET_SYSTEMS = [
  {
    id: 'auto',
    label: 'Automático',
    description: 'Round-Robin si < 4 competidores; Bracket si ≥ 4',
    icon: '⚡',
  },
  {
    id: 'single_elimination',
    label: 'Eliminación Simple',
    description: 'Pierde → eliminado. Rápido y directo.',
    icon: '⚔️',
  },
  {
    id: 'repechage',
    label: 'Eliminación + Repesca (WKF)',
    description: 'Los perdedores contra finalistas compiten por el bronce.',
    icon: '🏅',
  },
  {
    id: 'round_robin',
    label: 'Round-Robin',
    description: 'Todos compiten contra todos. Ideal para grupos pequeños.',
    icon: '🔄',
  },
  {
    id: 'double_elimination',
    label: 'Doble Eliminación',
    description: 'Se necesitan 2 derrotas para quedar eliminado.',
    icon: '🔁',
  },
];

/* ----- Estados del Torneo ----- */
const TOURNAMENT_STATUS = {
  DRAFT:      { id: 'draft',      label: 'Borrador',   color: 'blue'   },
  OPEN:       { id: 'open',       label: 'Inscripción Abierta', color: 'gold'  },
  CLOSED:     { id: 'closed',     label: 'Inscripción Cerrada', color: 'orange' },
  ONGOING:    { id: 'ongoing',    label: 'En Progreso', color: 'green'  },
  FINISHED:   { id: 'finished',   label: 'Finalizado',  color: 'muted'  },
  CANCELLED:  { id: 'cancelled',  label: 'Cancelado',   color: 'red'    },
};

/* ----- Estados de un Combate ----- */
const MATCH_STATUS = {
  PENDING:    'pending',
  ONGOING:    'in_progress',
  FINISHED:   'finished',
  BYE:        'bye',
};

/* ----- Roles de usuario ----- */
const USER_ROLES = {
  ORGANIZER:   'organizer',
  REFEREE:     'referee',
  JUDGE:       'judge',
  COMPETITOR:  'competitor',
  PUBLIC:      'public',
  SUPER_ADMIN: 'super_admin',
};

/* ----- Helpers ----- */

/**
 * Calcula el grupo de edad según la fecha de nacimiento y la fecha del torneo.
 * @param {string} dob - Fecha de nacimiento (YYYY-MM-DD)
 * @param {string} tournamentDate - Fecha del torneo (YYYY-MM-DD)
 * @returns {object|null} Grupo de edad que corresponde, o null si no encaja
 */
function getAgeGroup(dob, tournamentDate) {
  const birth = new Date(dob);
  const event = new Date(tournamentDate);
  let age = event.getFullYear() - birth.getFullYear();
  const m = event.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && event.getDate() < birth.getDate())) age--;
  return AGE_GROUPS.find(g => age >= g.minAge && age <= g.maxAge) || null;
}

/**
 * Determina la categoría de peso según el género y peso del competidor.
 * @param {string} gender - 'M' o 'F'
 * @param {number} weight - Peso en kg
 * @returns {object|null}
 */
function getWeightClass(gender, weight) {
  const classes = WEIGHT_CLASSES[gender] || [];
  return classes.find(c => c.max === null ? weight >= c.min : weight <= c.max) || null;
}

/**
 * Determina el grupo de cinturón según el id del cinturón individual.
 * @param {string} beltId
 * @returns {object|null}
 */
function getBeltGroup(beltId) {
  return BELT_GROUPS.find(g => g.belts.includes(beltId)) || null;
}

/**
 * Genera un ID único simple.
 * @returns {string}
 */
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

/**
 * Calcula la siguiente potencia de 2 mayor o igual a n.
 * @param {number} n
 * @returns {number}
 */
function nextPowerOf2(n) {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

/**
 * Formatea una fecha ISO a texto legible.
 * @param {string} isoDate
 * @returns {string}
 */
function formatDate(isoDate) {
  if (!isoDate) return '—';
  return new Date(isoDate).toLocaleDateString('es-ES', {
    day: '2-digit', month: 'long', year: 'numeric',
  });
}
