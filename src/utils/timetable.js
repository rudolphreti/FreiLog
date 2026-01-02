export const TIMETABLE_DAY_ORDER = [
  { key: 'monday', label: 'Montag' },
  { key: 'tuesday', label: 'Dienstag' },
  { key: 'wednesday', label: 'Mittwoch' },
  { key: 'thursday', label: 'Donnerstag' },
  { key: 'friday', label: 'Freitag' },
];

export const normalizeSubjectName = (value) => (typeof value === 'string' ? value.trim() : '');

export const buildSubjectKey = (value) => normalizeSubjectName(value).toLocaleLowerCase('de');

const SUBJECT_COLOR_PALETTE = [
  '#3b82f6',
  '#f97316',
  '#22c55e',
  '#8b5cf6',
  '#ec4899',
  '#0ea5e9',
  '#a855f7',
  '#ef4444',
  '#14b8a6',
  '#94a3b8',
];

const isPlainObject = (value) => value && typeof value === 'object' && !Array.isArray(value);
const isValidHexColor = (value) => typeof value === 'string' && /^#([0-9a-fA-F]{6})$/.test(value.trim());

const pickPaletteColor = (key) => {
  if (!key) {
    return SUBJECT_COLOR_PALETTE[0];
  }
  const normalized = key.toString();
  let hash = 0;
  for (let i = 0; i < normalized.length; i += 1) {
    hash = (hash << 5) - hash + normalized.charCodeAt(i);
    hash |= 0;
  }
  const index = Math.abs(hash) % SUBJECT_COLOR_PALETTE.length;
  return SUBJECT_COLOR_PALETTE[index];
};

const DEFAULT_SUBJECTS = [
  'Bewegung und Sport',
  'BuS',
  'Deutsch',
  'Freizeit',
  'IFÖ',
  'KuG',
  'Lernzeit',
  'Mathe',
  'Mittagsessen',
  'Musik',
  'Rel. Isl.',
  'Rel. Ort.',
  'Rel. RK',
  'Sachunterricht',
  'Spätdienst',
  'SU',
  'TeD',
];

export const DEFAULT_TIMETABLE_SUBJECTS = [...DEFAULT_SUBJECTS].sort((a, b) =>
  a.localeCompare(b, 'de', { sensitivity: 'base' }),
);

export const DEFAULT_TIMETABLE_SUBJECT_COLORS = {
  [buildSubjectKey('Freizeit')]: '#facc15',
  [buildSubjectKey('Mittagsessen')]: '#fb923c',
  [buildSubjectKey('Lernzeit')]: '#3b82f6',
  [buildSubjectKey('Bus')]: '#0ea5e9',
  [buildSubjectKey('TeD')]: '#f59e0b',
  [buildSubjectKey('Spätdienst')]: '#ef4444',
  [buildSubjectKey('Bewegung und Sport')]: '#22c55e',
  [buildSubjectKey('KuG')]: '#8b5cf6',
  [buildSubjectKey('Deutsch')]: '#6366f1',
  [buildSubjectKey('Mathe')]: '#14b8a6',
  [buildSubjectKey('Rel. Isl.')]: '#a855f7',
  [buildSubjectKey('Rel. Ort.')]: '#a855f7',
  [buildSubjectKey('Rel. RK')]: '#a855f7',
  [buildSubjectKey('SU')]: '#0ea5e9',
  [buildSubjectKey('Sachunterricht')]: '#0ea5e9',
  [buildSubjectKey('Musik')]: '#ec4899',
  [buildSubjectKey('IFÖ')]: '#10b981',
  [buildSubjectKey('BuS')]: '#14b8a6',
};

export const getSubjectColor = (
  subject,
  colorMap = {},
  fallbackColors = DEFAULT_TIMETABLE_SUBJECT_COLORS,
) => {
  const key = buildSubjectKey(subject);
  if (!key) {
    return SUBJECT_COLOR_PALETTE[0];
  }
  const source = isPlainObject(colorMap) ? colorMap : {};
  const exactMatch = typeof source[key] === 'string' ? source[key] : source[subject];
  if (isValidHexColor(exactMatch)) {
    return exactMatch;
  }
  if (fallbackColors && isValidHexColor(fallbackColors[key])) {
    return fallbackColors[key];
  }
  return pickPaletteColor(key);
};

export const normalizeTimetableSubjectColors = (
  colorMap,
  subjects = [],
  fallbackColors = DEFAULT_TIMETABLE_SUBJECT_COLORS,
) => {
  const source = isPlainObject(colorMap) ? colorMap : {};
  const result = {};
  const subjectList = Array.isArray(subjects) ? subjects : [];
  subjectList.forEach((subject) => {
    const key = buildSubjectKey(subject);
    if (!key) {
      return;
    }
    const provided = source[key] || source[subject];
    const normalized =
      isValidHexColor(provided) && provided
        ? provided
        : getSubjectColor(subject, source, fallbackColors);
    result[key] = normalized;
  });
  return result;
};

export const DEFAULT_TIMETABLE_LESSONS = [
  { period: 1, start: '08:00', end: '08:50' },
  { period: 2, start: '08:55', end: '09:45' },
  { period: 3, start: '10:10', end: '11:00' },
  { period: 4, start: '11:05', end: '11:55' },
  { period: 5, start: '12:05', end: '12:55' },
  { period: 6, start: '13:00', end: '13:50' },
  { period: 7, start: '13:50', end: '14:40' },
  { period: 8, start: '14:40', end: '15:30' },
  { period: 9, start: '15:30', end: '16:30' },
  { period: 10, start: '16:30', end: '17:30' },
];

export const DEFAULT_TIMETABLE_SCHEDULE = {
  monday: [
    ['Deutsch'],
    ['Mathe'],
    ['Deutsch', 'IFÖ'],
    ['Mittagsessen'],
    ['BuS'],
    ['Musik'],
    ['Lernzeit'],
    ['Freizeit'],
    ['Spätdienst'],
    ['Spätdienst'],
  ],
  tuesday: [
    ['Mathe'],
    ['SU'],
    ['Deutsch'],
    ['Mittagsessen'],
    ['Deutsch'],
    ['Lernzeit', 'Rel. Isl.'],
    ['SU'],
    ['Freizeit'],
    ['Spätdienst'],
    ['Spätdienst'],
  ],
  wednesday: [
    ['Deutsch'],
    ['Mathe'],
    ['KuG'],
    ['Mittagsessen'],
    ['Freizeit'],
    ['Lernzeit'],
    ['Lernzeit'],
    ['Rel. Isl.', 'Freizeit'],
    ['Spätdienst'],
    ['Spätdienst'],
  ],
  thursday: [
    ['Deutsch'],
    ['Sachunterricht'],
    ['TeD'],
    ['Mittagsessen'],
    ['Bewegung und Sport'],
    ['Freizeit', 'Rel. RK'],
    ['Freizeit'],
    ['Freizeit', 'Rel. Ort.'],
    ['Spätdienst'],
    ['Spätdienst'],
  ],
  friday: [
    ['Deutsch'],
    ['Bewegung und Sport'],
    ['Mathe'],
    ['Mittagsessen'],
    ['Lernzeit'],
    ['Freizeit'],
    ['Freizeit'],
    ['Freizeit'],
    ['Spätdienst'],
    ['Spätdienst'],
  ],
};

export const formatSubjectsList = (subjects) => {
  if (!Array.isArray(subjects) || !subjects.length) {
    return '';
  }
  return subjects.join(' + ');
};

export const getAccessibleTextColor = (hexColor) => {
  const color = isValidHexColor(hexColor) ? hexColor : '#000000';
  const stripped = color.replace('#', '');
  const bigint = parseInt(stripped, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? '#0f172a' : '#ffffff';
};
