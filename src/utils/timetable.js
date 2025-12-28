export const TIMETABLE_DAY_ORDER = [
  { key: 'monday', label: 'Monday' },
  { key: 'tuesday', label: 'Tuesday' },
  { key: 'wednesday', label: 'Wednesday' },
  { key: 'thursday', label: 'Thursday' },
  { key: 'friday', label: 'Friday' },
];

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
