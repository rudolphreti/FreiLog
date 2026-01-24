import { DEFAULT_DRAWER_SECTIONS, DEFAULT_EXPORT_MODE } from '../config.js';
import { isValidYmd } from '../utils/date.js';
import { DEFAULT_FREE_DAYS, isFreeDay, normalizeFreeDays } from '../utils/freeDays.js';
import {
  ANGEBOT_GROUP_CODES,
  buildAngebotId,
  getAngebotCatalogLabels,
  normalizeAngebotCatalog,
  normalizeAngebotGroups,
  normalizeAngebotKey,
  normalizeAngebotText,
} from '../utils/angebotCatalog.js';
import { normalizeAngebotNote } from '../utils/angebotNotes.js';
import {
  OBSERVATION_GROUP_CODES,
  buildObservationId,
  getObservationCatalogLabels,
  normalizeObservationGroups,
  normalizeObservationKey,
  normalizeObservationText,
} from '../utils/observationCatalog.js';
import { normalizeObservationNoteList } from '../utils/observationNotes.js';
import {
  DEFAULT_TIMETABLE_LESSONS,
  DEFAULT_TIMETABLE_SCHEDULE,
  DEFAULT_TIMETABLE_SUBJECT_COLORS,
  DEFAULT_TIMETABLE_SUBJECTS,
  normalizeTimetableSubjectColors,
  TIMETABLE_DAY_ORDER,
} from '../utils/timetable.js';
import {
  flattenModuleAssignments,
  getFreizeitModulesForDate,
  mergeModuleAssignments,
  normalizeModuleAssignments,
  normalizeAngebotListForModules,
} from '../utils/angebotModules.js';
import { normalizeGeldsammlungen } from '../utils/geldsammlungen.js';

export const SCHEMA_VERSION = 13;

const createEmptyEntlassung = () => ({
  regular: {
    monday: [],
    tuesday: [],
    wednesday: [],
    thursday: [],
    friday: [],
  },
  special: [],
  ausnahmen: [],
});

const DEFAULT_CLASS_PROFILE = {
  teacherName: '',
  name: '',
  badge: '',
  motto: '',
  notes: '',
  childrenNotes: {},
  entlassung: createEmptyEntlassung(),
  courses: [],
};

export const DEFAULT_SAVED_ANGEBOT_FILTERS = {
  multiGroups: false,
  andOrMode: 'AND',
  showAndOr: true,
  showAlphabet: false,
  selectedGroups: [],
  selectedLetter: 'ALL',
};

const DEFAULT_OBSERVATION_CREATED_AT = '2025-01-01T00:00:00Z';
export const DEFAULT_SAVED_OBSERVATION_FILTERS = {
  multiGroups: false,
  andOrMode: 'AND',
  showAndOr: true,
  showAlphabet: false,
  selectedGroups: [],
  selectedLetter: 'ALL',
};
const DEFAULT_OBSERVATION_GROUPS = {
  ROT: {
    code: 'ROT',
    label: 'künstlerisch, kreativ',
    color: '#d32f2f',
  },
  BLAU: {
    code: 'BLAU',
    label: 'musikalisch',
    color: '#1976d2',
  },
  ORANGE: {
    code: 'ORANGE',
    label: 'sportlich',
    color: '#f57c00',
  },
  GRUEN: {
    code: 'GRUEN',
    label: 'technisch, forschend',
    color: '#388e3c',
  },
  LILA: {
    code: 'LILA',
    label: 'Gesellschaft, Verhalten, Politik',
    color: '#7b1fa2',
  },
  SCHWARZ: {
    code: 'SCHWARZ',
    label: 'Alarm',
    color: '#212121',
  },
};

const isPlainObject = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const cloneTimetableLessons = (lessons = []) =>
  Array.isArray(lessons)
    ? lessons.map((entry, index) => ({
        period: typeof entry?.period === 'number' ? entry.period : index + 1,
        start: entry?.start || '',
        end: entry?.end || '',
      }))
    : [];

const cloneTimetableSchedule = (schedule = {}) => {
  const cloned = {};
  Object.entries(schedule).forEach(([day, entries]) => {
    cloned[day] = Array.isArray(entries) ? entries.map((cell) => [...(cell || [])]) : [];
  });
  return cloned;
};

export const ensureUniqueSortedStrings = (arr) => {
  if (!Array.isArray(arr)) {
    return [];
  }

  const unique = new Set();
  arr.forEach((item) => {
    if (typeof item === 'string') {
      const trimmed = item.trim();
      if (trimmed) {
        unique.add(trimmed);
      }
    }
  });

  return Array.from(unique).sort((a, b) => a.localeCompare(b));
};

export const normalizeChildName = (value) => {
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim().replace(/\s+/g, ' ');
};

export const normalizeWeekThemeText = (value) => normalizeAngebotText(value);

export const normalizeWeekThemeAssignments = (value, fallback = {}) => {
  const primary = isPlainObject(value) ? value : {};
  const secondary = isPlainObject(fallback) ? fallback : {};
  const merged = { ...secondary, ...primary };
  const result = {};

  Object.entries(merged).forEach(([weekId, theme]) => {
    if (typeof weekId !== 'string') {
      return;
    }
    const normalizedWeekId = weekId.trim();
    if (!normalizedWeekId) {
      return;
    }
    const normalizedTheme = normalizeWeekThemeText(theme);
    if (!normalizedTheme) {
      return;
    }
    result[normalizedWeekId] = normalizedTheme;
  });

  return result;
};

const normalizeChildNotes = (value, childrenList = []) => {
  const source = isPlainObject(value) ? value : {};
  const allowed = Array.isArray(childrenList)
    ? new Set(childrenList.map((child) => normalizeChildName(child)).filter(Boolean))
    : null;
  const result = {};

  Object.entries(source).forEach(([child, note]) => {
    const normalizedChild = normalizeChildName(child);
    if (!normalizedChild || (allowed && !allowed.has(normalizedChild))) {
      return;
    }
    const normalizedNote = typeof note === 'string' ? note : '';
    result[normalizedChild] = normalizedNote;
  });

  if (allowed) {
    allowed.forEach((child) => {
      if (!result[child]) {
        result[child] = '';
      }
    });
  }

  return result;
};

const normalizeEntlassungTime = (value) => {
  if (typeof value !== 'string') {
    return '';
  }
  const trimmed = value.trim();
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(trimmed)) {
    return '';
  }
  return trimmed;
};

const normalizeEntlassungSlots = (value, allowedSet) => {
  if (!Array.isArray(value)) {
    return [];
  }

  const seenTimes = new Set();
  const usedChildren = new Set();
  const result = [];

  value.forEach((slot) => {
    const time = normalizeEntlassungTime(slot?.time);
    if (!time || seenTimes.has(time)) {
      return;
    }

    seenTimes.add(time);
    const children = [];
    const childList = Array.isArray(slot?.children) ? slot.children : [];
    childList.forEach((child) => {
      const normalizedChild = normalizeChildName(child);
      if (!normalizedChild || usedChildren.has(normalizedChild)) {
        return;
      }
      if (allowedSet && !allowedSet.has(normalizedChild)) {
        return;
      }
      usedChildren.add(normalizedChild);
      children.push(normalizedChild);
    });

    result.push({ time, children });
  });

  return result;
};

const normalizeEntlassungAusnahmen = (value, allowedSet) => {
  if (!Array.isArray(value)) {
    return [];
  }

  const seen = new Set();
  const result = [];

  value.forEach((entry) => {
    const date = typeof entry?.date === 'string' ? entry.date.trim() : '';
    if (!isValidYmd(date)) {
      return;
    }
    const child = normalizeChildName(entry?.child);
    if (!child || (allowedSet && !allowedSet.has(child))) {
      return;
    }
    const time = normalizeEntlassungTime(entry?.time);
    if (!time) {
      return;
    }
    const key = `${date}::${child}`;
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    result.push({ date, child, time });
  });

  return result;
};

export const normalizeCourses = (value, childrenList = [], fallbackCourses = []) => {
  const source = Array.isArray(value)
    ? value
    : Array.isArray(fallbackCourses)
      ? fallbackCourses
      : [];
  const allowedSet = Array.isArray(childrenList)
    ? new Set(childrenList.map((child) => normalizeChildName(child)).filter(Boolean))
    : null;
  const allowedDays = new Set(TIMETABLE_DAY_ORDER.map(({ key }) => key));
  const result = [];

  source.forEach((entry) => {
    if (!isPlainObject(entry)) {
      return;
    }
    const name = typeof entry.name === 'string' ? entry.name.trim() : '';
    const icon = typeof entry.icon === 'string' ? entry.icon.trim() : '';
    const day = allowedDays.has(entry.day) ? entry.day : '';
    const time = normalizeEntlassungTime(entry.time);
    const children = [];
    const childList = Array.isArray(entry.children) ? entry.children : [];
    childList.forEach((child) => {
      const normalizedChild = normalizeChildName(child);
      if (!normalizedChild) {
        return;
      }
      if (allowedSet && !allowedSet.has(normalizedChild)) {
        return;
      }
      if (!children.includes(normalizedChild)) {
        children.push(normalizedChild);
      }
    });
    result.push({
      name,
      icon,
      day,
      time,
      children,
    });
  });

  return result;
};

export const normalizeEntlassung = (value, childrenList = [], fallbackEntlassung = null) => {
  const source = isPlainObject(value) ? value : {};
  const fallback = isPlainObject(fallbackEntlassung)
    ? fallbackEntlassung
    : createEmptyEntlassung();
  const baseRegular =
    isPlainObject(source.regular) || Array.isArray(source.regular)
      ? source.regular
      : isPlainObject(fallback.regular)
        ? fallback.regular
        : {};
  const baseSpecial = Array.isArray(source.special)
    ? source.special
    : Array.isArray(fallback.special)
      ? fallback.special
      : [];
  const baseAusnahmen = Array.isArray(source.ausnahmen)
    ? source.ausnahmen
    : Array.isArray(fallback.ausnahmen)
      ? fallback.ausnahmen
      : [];

  const allowedSet = Array.isArray(childrenList)
    ? new Set(childrenList.map((child) => normalizeChildName(child)).filter(Boolean))
    : null;

  const regular = {};
  TIMETABLE_DAY_ORDER.forEach(({ key }) => {
    regular[key] = normalizeEntlassungSlots(baseRegular?.[key], allowedSet);
  });

  const special = [];
  baseSpecial.forEach((entry) => {
    const date = typeof entry?.date === 'string' ? entry.date.trim() : '';
    if (!isValidYmd(date)) {
      return;
    }
    const times = normalizeEntlassungSlots(entry?.times, allowedSet);
    special.push({ date, times });
  });

  const ausnahmen = normalizeEntlassungAusnahmen(baseAusnahmen, allowedSet);

  return {
    regular,
    special,
    ausnahmen,
  };
};

const normalizeClassProfile = (value, childrenList = [], fallbackProfile = {}) => {
  const source = isPlainObject(value) ? value : {};
  const fallback = isPlainObject(fallbackProfile) ? fallbackProfile : DEFAULT_CLASS_PROFILE;
  const baseProfile = { ...DEFAULT_CLASS_PROFILE, ...fallback };

  const teacherName =
    typeof source.teacherName === 'string' && source.teacherName.trim()
      ? source.teacherName.trim()
      : typeof baseProfile.teacherName === 'string'
        ? baseProfile.teacherName.trim()
        : '';
  const name =
    typeof source.name === 'string' && source.name.trim()
      ? source.name.trim()
      : typeof baseProfile.name === 'string'
        ? baseProfile.name.trim()
        : '';
  const badge =
    typeof source.badge === 'string' && source.badge.trim()
      ? source.badge.trim()
      : typeof baseProfile.badge === 'string'
        ? baseProfile.badge.trim()
        : '';
  const motto =
    typeof source.motto === 'string' && source.motto.trim()
      ? source.motto.trim()
      : typeof baseProfile.motto === 'string'
        ? baseProfile.motto.trim()
        : '';
  const notes =
    typeof source.notes === 'string'
      ? source.notes
      : typeof baseProfile.notes === 'string'
        ? baseProfile.notes
        : '';

  const primaryNotes = normalizeChildNotes(
    source.childrenNotes || source.childNotes,
    childrenList,
  );
  const fallbackNotes = normalizeChildNotes(baseProfile.childrenNotes, childrenList);
  const mergedNotes = { ...fallbackNotes, ...primaryNotes };
  const entlassung = normalizeEntlassung(
    source.entlassung,
    childrenList,
    baseProfile.entlassung,
  );
  const courses = normalizeCourses(source.courses, childrenList, baseProfile.courses);

  return {
    teacherName,
    name,
    badge,
    motto,
    notes,
    childrenNotes: mergedNotes,
    entlassung,
    courses,
  };
};

const ensureUniqueStrings = (arr) => {
  if (!Array.isArray(arr)) {
    return [];
  }

  const unique = new Set();
  const result = [];
  arr.forEach((item) => {
    if (typeof item !== 'string') {
      return;
    }
    const trimmed = item.trim();
    if (!trimmed || unique.has(trimmed)) {
      return;
    }
    unique.add(trimmed);
    result.push(trimmed);
  });

  return result;
};

const ensureUniqueObservationTexts = (arr) => {
  if (!Array.isArray(arr)) {
    return [];
  }

  const seen = new Set();
  const result = [];
  arr.forEach((item) => {
    if (typeof item !== 'string') {
      return;
    }
    const normalized = normalizeObservationText(item);
    const key = normalizeObservationKey(normalized);
    if (!key || seen.has(key)) {
      return;
    }
    seen.add(key);
    result.push(normalized);
  });

  return result;
};

const normalizeObservationEntries = (value, childrenSet) => {
  let source = {};

  if (Array.isArray(value)) {
    source = value.reduce((acc, item) => {
      if (item && item.child) {
        acc[item.child] = item;
      }
      return acc;
    }, {});
  } else if (isPlainObject(value)) {
    source = value;
  }

  const result = {};
  Object.keys(source).forEach((child) => {
    if (childrenSet && !childrenSet.has(child)) {
      return;
    }

    const entry = source[child];
    if (Array.isArray(entry)) {
      result[child] = ensureUniqueObservationTexts(entry);
      return;
    }

    if (typeof entry === 'string') {
      result[child] = ensureUniqueObservationTexts([entry]);
      return;
    }

    const item = isPlainObject(entry) ? entry : {};
    const preset =
      typeof item.preset === 'string' ? item.preset.trim() : '';
    const tags = ensureUniqueObservationTexts(item.tags);
    if (preset && !tags.includes(preset)) {
      tags.push(preset);
    }

    result[child] = tags;
  });

  return result;
};

const normalizeObservationNotes = (value, childrenSet) => {
  const source = isPlainObject(value) ? value : {};
  const allowed = childrenSet ? new Set(Array.from(childrenSet)) : null;
  const result = {};

  Object.entries(source).forEach(([child, note]) => {
    const normalizedChild = normalizeChildName(child);
    if (!normalizedChild || (allowed && !allowed.has(normalizedChild))) {
      return;
    }
    result[normalizedChild] = normalizeObservationNoteList(note);
  });

  if (allowed) {
    allowed.forEach((child) => {
      if (!(child in result)) {
        result[child] = [];
      }
    });
  }

  return result;
};

const normalizeDayEntry = (
  entry,
  date,
  childrenSet,
  freeDays,
  timetableSchedule = DEFAULT_TIMETABLE_SCHEDULE,
  timetableLessons = DEFAULT_TIMETABLE_LESSONS,
) => {
  const source = isPlainObject(entry) ? entry : {};
  const legacyAngebot =
    typeof source.angebot === 'string' ? source.angebot.trim() : '';
  const angebotList = Array.isArray(source.angebote)
    ? source.angebote
    : typeof source.angebote === 'string'
      ? [source.angebote]
      : [];
  if (legacyAngebot && !angebotList.includes(legacyAngebot)) {
    angebotList.push(legacyAngebot);
  }
  const angebote = normalizeAngebotListForModules(
    angebotList.map((item) => normalizeAngebotText(item)).filter(Boolean),
  );
  const absentChildren = ensureUniqueStrings(
    source.absentChildIds || source.absentChildren,
  );
  const filteredAbsent = childrenSet
    ? absentChildren.filter((name) => childrenSet.has(name))
    : absentChildren;
  const observations = normalizeObservationEntries(
    source.observations,
    childrenSet,
  );
  const observationNotes = normalizeObservationNotes(
    source.observationNotes,
    childrenSet,
  );
  const angebotNotes = normalizeAngebotNote(source.angebotNotes);
  const notes = typeof source.notes === 'string' ? source.notes : '';

  const isDayFree = isFreeDay(date, freeDays);
  const absentSet = new Set(filteredAbsent);
  const filteredObservations = {};
  const filteredObservationNotes = {};
  if (!isDayFree) {
    Object.entries(observations).forEach(([child, tags]) => {
      if (absentSet.has(child)) {
        return;
      }
      const normalized = ensureUniqueObservationTexts(tags);
      filteredObservations[child] = normalized;
    });
  }

  Object.entries(observationNotes).forEach(([child, note]) => {
    if (absentSet.has(child)) {
      return;
    }
    filteredObservationNotes[child] = note;
  });

  if (childrenSet) {
    childrenSet.forEach((child) => {
      if (!filteredObservationNotes[child]) {
        filteredObservationNotes[child] = '';
      }
    });
  }

  const freizeitModules = getFreizeitModulesForDate(
    date,
    timetableSchedule,
    timetableLessons,
  );
  const angebotModules = freizeitModules.length
    ? normalizeModuleAssignments(freizeitModules, source.angebotModules, angebote)
    : {};
  const normalizedAngebote = freizeitModules.length
    ? flattenModuleAssignments(angebotModules)
    : angebote;

  return {
    date,
    angebote: normalizedAngebote,
    angebotModules,
    observations: filteredObservations,
    observationNotes: filteredObservationNotes,
    absentChildIds: filteredAbsent,
    angebotNotes,
    notes,
  };
};

export const sanitizeDaysByDate = (
  days,
  childrenList,
  freeDays = DEFAULT_FREE_DAYS,
  timetableSchedule = DEFAULT_TIMETABLE_SCHEDULE,
  timetableLessons = DEFAULT_TIMETABLE_LESSONS,
) => {
  if (!isPlainObject(days)) {
    return {};
  }

  const childrenSet = Array.isArray(childrenList)
    ? new Set(childrenList)
    : null;
  const result = {};

  Object.keys(days).forEach((date) => {
    if (!isValidYmd(date)) {
      return;
    }
    result[date] = normalizeDayEntry(
      days[date],
      date,
      childrenSet,
      freeDays,
      timetableSchedule,
      timetableLessons,
    );
  });

  return result;
};

export const normalizeSavedObservationFilters = (value) => {
  const source = isPlainObject(value) ? value : {};
  const selectedGroups = normalizeObservationGroups(source.selectedGroups);
  const multiGroups = source.multiGroups === true;
  const andOrMode = source.andOrMode === 'OR' ? 'OR' : 'AND';
  const showAndOr = source.showAndOr !== false;
  const showAlphabet = source.showAlphabet === true;
  const letterRaw =
    typeof source.selectedLetter === 'string' && source.selectedLetter.trim()
      ? source.selectedLetter.trim()
      : 'ALL';
  const selectedLetter =
    letterRaw === 'ALL' ? 'ALL' : letterRaw.slice(0, 1).toLocaleUpperCase();

  return {
    multiGroups,
    andOrMode,
    showAndOr,
    showAlphabet,
    selectedGroups,
    selectedLetter,
  };
};

export const normalizeSavedAngebotFilters = (value) => {
  const source = isPlainObject(value) ? value : {};
  const selectedGroups = normalizeAngebotGroups(source.selectedGroups);
  const multiGroups = source.multiGroups === true;
  const andOrMode = source.andOrMode === 'OR' ? 'OR' : 'AND';
  const showAndOr = source.showAndOr !== false;
  const showAlphabet = source.showAlphabet === true;
  const letterRaw =
    typeof source.selectedLetter === 'string' && source.selectedLetter.trim()
      ? source.selectedLetter.trim()
      : 'ALL';
  const selectedLetter =
    letterRaw === 'ALL' ? 'ALL' : letterRaw.slice(0, 1).toLocaleUpperCase();

  return {
    multiGroups,
    andOrMode,
    showAndOr,
    showAlphabet,
    selectedGroups,
    selectedLetter,
  };
};

const normalizeTimetableSubjects = (value, fallback = []) => {
  const subjects = ensureUniqueSortedStrings(
    Array.isArray(value) ? value : Array.isArray(fallback) ? fallback : [],
  );
  return subjects.sort((a, b) => a.localeCompare(b, 'de', { sensitivity: 'base' }));
};

const isValidTimeRange = (value) => typeof value === 'string' && /^\d{2}:\d{2}$/.test(value);

const normalizeTimetableLessons = (value, fallback = DEFAULT_TIMETABLE_LESSONS) => {
  const source = Array.isArray(value) ? value : Array.isArray(fallback) ? fallback : [];
  const items = [];
  const maxLessons = 10;

  for (let i = 0; i < maxLessons; i += 1) {
    const period = i + 1;
    const entry = source[i] || {};
    const start = isValidTimeRange(entry.start) ? entry.start : DEFAULT_TIMETABLE_LESSONS[i].start;
    const end = isValidTimeRange(entry.end) ? entry.end : DEFAULT_TIMETABLE_LESSONS[i].end;
    items.push({ period, start, end });
  }

  return items;
};

const normalizeTimetableSchedule = (
  schedule,
  subjects = DEFAULT_TIMETABLE_SUBJECTS,
  lessons = DEFAULT_TIMETABLE_LESSONS,
) => {
  const normalizedSchedule = {};

  const normalizeCell = (value) => {
    if (!Array.isArray(value)) {
      return [];
    }
    const unique = new Set();
    const items = [];
    value.forEach((entry) => {
      if (typeof entry !== 'string') {
        return;
      }
      const trimmed = entry.trim();
      if (!trimmed) {
        return;
      }
      const key = trimmed.toLocaleLowerCase('de');
      if (unique.has(key)) {
        return;
      }
      unique.add(key);
      // Keep subject even if not in list to avoid data loss; will be shown as-is.
      items.push(trimmed);
    });
    return items;
  };

  const source = isPlainObject(schedule) ? schedule : {};
  TIMETABLE_DAY_ORDER.forEach(({ key }) => {
    const dayEntries = Array.isArray(source[key]) ? source[key] : [];
    const normalizedDay = [];
    for (let i = 0; i < lessons.length; i += 1) {
      normalizedDay.push(normalizeCell(dayEntries[i]));
    }
    normalizedSchedule[key] = normalizedDay;
  });

  return normalizedSchedule;
};

const normalizeUi = (ui) => {
  const source = isPlainObject(ui) ? ui : {};
  const drawer = isPlainObject(source.drawer) ? source.drawer : {};
  const drawerSections = isPlainObject(drawer.sections)
    ? drawer.sections
    : {};
  const overlay = isPlainObject(source.overlay) ? source.overlay : {};

  return {
    selectedDate: typeof source.selectedDate === 'string' ? source.selectedDate : '',
    exportMode: typeof source.exportMode === 'string' ? source.exportMode : '',
    observationsFilter:
      typeof source.observationsFilter === 'string'
        ? source.observationsFilter
        : 'ALL',
    overlay: {
      savedAngebotFilters: normalizeSavedAngebotFilters(
        overlay.savedAngebotFilters || DEFAULT_SAVED_ANGEBOT_FILTERS,
      ),
      savedObsFilters: normalizeSavedObservationFilters(
        overlay.savedObsFilters,
        source.observationsFilter,
      ),
    },
    drawer: {
      open: typeof drawer.open === 'boolean' ? drawer.open : false,
      sections: {
        actions:
          typeof drawerSections.actions === 'boolean'
            ? drawerSections.actions
            : DEFAULT_DRAWER_SECTIONS.actions,
        angebote:
          typeof drawerSections.angebote === 'boolean'
            ? drawerSections.angebote
            : DEFAULT_DRAWER_SECTIONS.angebote,
        einstellungen:
          typeof drawerSections.einstellungen === 'boolean'
            ? drawerSections.einstellungen
            : DEFAULT_DRAWER_SECTIONS.einstellungen,
      },
    },
  };
};

const normalizeObservationGroupsDictionary = (value, fallback) => {
  const source = isPlainObject(value) ? value : {};
  const fallbackSource = isPlainObject(fallback) ? fallback : {};
  const result = {};

  OBSERVATION_GROUP_CODES.forEach((code) => {
    const entry =
      (isPlainObject(source[code]) && source[code]) ||
      (isPlainObject(fallbackSource[code]) && fallbackSource[code]) ||
      DEFAULT_OBSERVATION_GROUPS[code] ||
      {};
    const label =
      typeof entry.label === 'string' && entry.label.trim()
        ? entry.label.trim()
        : DEFAULT_OBSERVATION_GROUPS[code].label;
    const color =
      typeof entry.color === 'string' && entry.color.trim()
        ? entry.color.trim()
        : DEFAULT_OBSERVATION_GROUPS[code].color;

    result[code] = {
      code,
      label,
      color,
    };
  });

  return result;
};

const normalizeObservationCatalog = (value, fallback = []) => {
  const source = Array.isArray(value)
    ? value
    : Array.isArray(fallback)
      ? fallback
      : [];
  const seen = new Set();
  const result = [];

  source.forEach((item) => {
    const rawText =
      typeof item === 'string'
        ? item
        : item && typeof item === 'object'
          ? item.text
          : '';
    const text = normalizeObservationText(rawText);
    if (!text) {
      return;
    }
    const key = normalizeObservationKey(text);
    if (seen.has(key)) {
      return;
    }
    seen.add(key);

    const groups = normalizeObservationGroups(item?.groups);
    const createdAt =
      typeof item?.createdAt === 'string' && item.createdAt.trim()
        ? item.createdAt.trim()
        : DEFAULT_OBSERVATION_CREATED_AT;
    const id =
      typeof item?.id === 'string' && item.id.trim()
        ? item.id.trim()
        : buildObservationId(text);

    result.push({
      id,
      text,
      groups,
      createdAt,
    });
  });

  return result;
};

export const buildAngebotStats = (days) => {
  if (!isPlainObject(days)) {
    return {};
  }

  const stats = {};

  Object.values(days).forEach((entry) => {
    if (!entry || !Array.isArray(entry.angebote)) {
      return;
    }

    entry.angebote.forEach((angebot) => {
      const normalized = normalizeAngebotText(angebot);
      const key = normalizeAngebotKey(normalized);
      if (!key) {
        return;
      }
      stats[normalized] = (stats[normalized] || 0) + 1;
    });
  });

  return stats;
};

export const buildObservationStats = (days) => {
  if (!isPlainObject(days)) {
    return {};
  }

  const stats = {};

  Object.values(days).forEach((entry) => {
    if (!entry || !isPlainObject(entry.observations)) {
      return;
    }

    Object.entries(entry.observations).forEach(([child, data]) => {
      const list = Array.isArray(data)
        ? data
        : isPlainObject(data)
          ? data.tags
          : [];
      const tags = ensureUniqueObservationTexts(list);
      if (!tags.length) {
        return;
      }

      if (!stats[child]) {
        stats[child] = {};
      }

      tags.forEach((tag) => {
        stats[child][tag] = (stats[child][tag] || 0) + 1;
      });
    });
  });

  return stats;
};

export const createEmptyAppData = () => ({
  schemaVersion: SCHEMA_VERSION,
  children: [],
  classProfile: { ...DEFAULT_CLASS_PROFILE },
  angebote: [],
  angebotCatalog: [],
  themaDerWoche: {},
  observationTemplates: [],
  observationCatalog: [],
  observationGroups: { ...DEFAULT_OBSERVATION_GROUPS },
  timetableSubjects: [...DEFAULT_TIMETABLE_SUBJECTS],
  timetableSubjectColors: normalizeTimetableSubjectColors(
    DEFAULT_TIMETABLE_SUBJECT_COLORS,
    DEFAULT_TIMETABLE_SUBJECTS,
  ),
  timetableLessons: cloneTimetableLessons(DEFAULT_TIMETABLE_LESSONS),
  timetableSchedule: cloneTimetableSchedule(DEFAULT_TIMETABLE_SCHEDULE),
  geldsammlungen: [],
  days: {},
  angebotStats: {},
  observationStats: {},
  settings: {
    exportMode: DEFAULT_EXPORT_MODE,
    freeDays: normalizeFreeDays(DEFAULT_FREE_DAYS, DEFAULT_FREE_DAYS),
  },
  ui: {
    ...normalizeUi(null),
    overlay: {
      savedAngebotFilters: { ...DEFAULT_SAVED_ANGEBOT_FILTERS },
      savedObsFilters: { ...DEFAULT_SAVED_OBSERVATION_FILTERS },
    },
  },
});

export const normalizeAppData = (source, fallback = {}) => {
  const base = isPlainObject(source) ? source : {};
  const fallbackData = isPlainObject(fallback) ? fallback : {};

  const childrenSource = Array.isArray(base.children)
    ? base.children
    : fallbackData.children;
  const children = ensureUniqueSortedStrings(
    Array.isArray(childrenSource)
      ? childrenSource.map((child) => normalizeChildName(child)).filter(Boolean)
      : [],
  );

  const classProfile = normalizeClassProfile(
    base.classProfile || { childrenNotes: base.childNotes },
    children,
    fallbackData.classProfile || { childrenNotes: fallbackData.childNotes },
  );

  const angebotCatalog = normalizeAngebotCatalog(
    Array.isArray(base.angebotCatalog) ? base.angebotCatalog : base.angebote,
    fallbackData.angebotCatalog || fallbackData.angebote,
  );

  const angebote = ensureUniqueSortedStrings(
    [
      ...(Array.isArray(base.angebote) ? base.angebote : fallbackData.angebote || []),
      ...getAngebotCatalogLabels(angebotCatalog),
    ].map((item) => normalizeAngebotText(item)),
  );

  const themaDerWoche = normalizeWeekThemeAssignments(
    base.themaDerWoche,
    fallbackData.themaDerWoche,
  );

  const observationTemplates = ensureUniqueSortedStrings(
    Array.isArray(base.observationTemplates)
      ? base.observationTemplates
      : fallbackData.observationTemplates,
  );

  const timetableSubjects = normalizeTimetableSubjects(
    base.timetableSubjects,
    fallbackData.timetableSubjects || DEFAULT_TIMETABLE_SUBJECTS,
  );
  const timetableLessons = normalizeTimetableLessons(
    base.timetableLessons,
    fallbackData.timetableLessons || DEFAULT_TIMETABLE_LESSONS,
  );
  const timetableSubjectColors = normalizeTimetableSubjectColors(
    base.timetableSubjectColors,
    timetableSubjects,
    fallbackData.timetableSubjectColors || DEFAULT_TIMETABLE_SUBJECT_COLORS,
  );
  const timetableSchedule = normalizeTimetableSchedule(
    base.timetableSchedule,
    timetableSubjects,
    timetableLessons,
  );

  const observationCatalog = normalizeObservationCatalog(
    Array.isArray(base.observationCatalog)
      ? base.observationCatalog
      : observationTemplates,
    fallbackData.observationCatalog || fallbackData.observationTemplates,
  );

  const observationGroups = normalizeObservationGroupsDictionary(
    base.observationGroups,
    fallbackData.observationGroups,
  );
  const geldsammlungen = normalizeGeldsammlungen(
    Array.isArray(base.geldsammlungen)
      ? base.geldsammlungen
      : fallbackData.geldsammlungen,
    children,
  );

  const exportMode =
    typeof base.settings?.exportMode === 'string'
      ? base.settings.exportMode
      : typeof fallbackData.settings?.exportMode === 'string'
        ? fallbackData.settings.exportMode
        : DEFAULT_EXPORT_MODE;
  const freeDays = normalizeFreeDays(
    base.settings?.freeDays,
    fallbackData.settings?.freeDays || DEFAULT_FREE_DAYS,
  );

  const daysSource =
    base.days || base.records?.entriesByDate || fallbackData.days || {};
  const days = sanitizeDaysByDate(
    daysSource,
    children,
    freeDays,
    timetableSchedule,
    timetableLessons,
  );

  const uiSource = base.ui || fallbackData.ui || null;

  return {
    schemaVersion: SCHEMA_VERSION,
    children,
    classProfile,
    angebote,
    angebotCatalog,
    themaDerWoche,
    observationTemplates: getObservationCatalogLabels(observationCatalog),
    observationCatalog,
    observationGroups,
    timetableSubjects,
    timetableSubjectColors,
    timetableLessons,
    timetableSchedule,
    geldsammlungen,
    days,
    angebotStats: buildAngebotStats(days),
    observationStats: buildObservationStats(days),
    settings: {
      exportMode,
      freeDays,
    },
    ui: normalizeUi(uiSource),
  };
};

export const migrateLegacyData = (source, defaults) => {
  const base = isPlainObject(source) ? source : {};
  const fallback = isPlainObject(defaults) ? defaults : createEmptyAppData();

  if (
    typeof base.schemaVersion === 'number' &&
    (Array.isArray(base.children) || isPlainObject(base.days))
  ) {
    return normalizeAppData(base, fallback);
  }

  if (base.meta && base.presetData) {
    return normalizeAppData(
      {
        schemaVersion: SCHEMA_VERSION,
        children: base.presetData.childrenList,
        angebote: base.presetData.angebote,
        observationTemplates: base.presetData.observations,
        days: base.records?.entriesByDate,
        settings: base.settings,
        ui: fallback.ui,
      },
      fallback,
    );
  }

  if (base.records && base.presetOverrides) {
    const merged = {
      ...fallback,
      days: base.records.entriesByDate,
      ui: base.ui || fallback.ui,
      observationTemplates: ensureUniqueSortedStrings([
        ...(fallback.observationTemplates || []),
        ...(base.presetOverrides.observationsAdded || []),
      ]),
      angebote: ensureUniqueSortedStrings([
        ...(fallback.angebote || []),
        ...(base.presetOverrides.angeboteAdded || []),
      ]),
    };

    return normalizeAppData(merged, fallback);
  }

  return normalizeAppData(fallback, fallback);
};
