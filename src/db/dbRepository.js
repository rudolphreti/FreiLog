import {
  ensureUniqueSortedStrings,
  normalizeChildName,
  normalizeEntlassung,
  normalizeAppData,
  sanitizeDaysByDate,
} from './dbSchema.js';
import { clearAppData } from '../state/persistence.js';
import { getState, initStore, setSelectedDate, updateAppData } from '../state/store.js';
import { ensureYmd, isValidYmd, todayYmd } from '../utils/date.js';
import {
  buildAngebotId,
  getAngebotCatalogLabels,
  normalizeAngebotCatalog,
  normalizeAngebotGroups,
  normalizeAngebotKey,
  normalizeAngebotText,
} from '../utils/angebotCatalog.js';
import {
  buildObservationId,
  normalizeObservationGroups,
  normalizeObservationKey,
  normalizeObservationText,
} from '../utils/observationCatalog.js';
import { isFreeDay, normalizeFreeDays } from '../utils/freeDays.js';
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
import { normalizeAngebotNote } from '../utils/angebotNotes.js';

const normalizeObservationList = (value) => {
  if (typeof value === 'string') {
    const normalized = normalizeObservationText(value);
    const key = normalizeObservationKey(normalized);
    return key ? [normalized] : [];
  }

  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return normalizeObservationList(value.tags);
  }

  if (!Array.isArray(value)) {
    return [];
  }

  const unique = new Set();
  const result = [];
  value.forEach((item) => {
    if (typeof item !== 'string') {
      return;
    }
    const normalized = normalizeObservationText(item);
    const key = normalizeObservationKey(normalized);
    if (!key || unique.has(key)) {
      return;
    }
    unique.add(key);
    result.push(normalized);
  });

  return result;
};

const createEmptyClassProfile = () => ({
  teacherName: '',
  name: '',
  badge: '',
  motto: '',
  notes: '',
  childrenNotes: {},
  entlassung: {
    regular: {
      monday: [],
      tuesday: [],
      wednesday: [],
      thursday: [],
      friday: [],
    },
    special: [],
  },
});

const ensureClassProfileDraft = (data) => {
  if (!data.classProfile || typeof data.classProfile !== 'object') {
    data.classProfile = createEmptyClassProfile();
  }
  if (!data.classProfile.childrenNotes || typeof data.classProfile.childrenNotes !== 'object') {
    data.classProfile.childrenNotes = {};
  }
  if (typeof data.classProfile.name !== 'string') {
    data.classProfile.name = '';
  }
  if (typeof data.classProfile.teacherName !== 'string') {
    data.classProfile.teacherName = '';
  }
  if (typeof data.classProfile.badge !== 'string') {
    data.classProfile.badge = '';
  }
  if (typeof data.classProfile.motto !== 'string') {
    data.classProfile.motto = '';
  }
  if (typeof data.classProfile.notes !== 'string') {
    data.classProfile.notes = '';
  }
  if (!data.classProfile.entlassung || typeof data.classProfile.entlassung !== 'object') {
    data.classProfile.entlassung = createEmptyClassProfile().entlassung;
  }
};

const normalizeInlineText = (value) =>
  typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';

const normalizeNoteText = (value) => (typeof value === 'string' ? value : '');

const replaceObservationReferences = (days, fromKey, toText) => {
  if (!days || typeof days !== 'object') {
    return;
  }
  const normalizedTarget = normalizeObservationText(toText);
  if (!normalizedTarget) {
    return;
  }
  Object.values(days).forEach((entry) => {
    if (!entry || typeof entry !== 'object') {
      return;
    }
    if (!entry.observations || typeof entry.observations !== 'object') {
      return;
    }
    Object.keys(entry.observations).forEach((child) => {
      const list = normalizeObservationList(entry.observations[child]);
      if (!list.length) {
        return;
      }
      const updated = [];
      const seen = new Set();
      list.forEach((item) => {
        const normalizedItem = normalizeObservationText(item);
        const nextText =
          normalizeObservationKey(normalizedItem) === fromKey
            ? normalizedTarget
            : normalizedItem;
        const nextKey = normalizeObservationKey(nextText);
        if (!nextKey || seen.has(nextKey)) {
          return;
        }
        seen.add(nextKey);
        updated.push(nextText);
      });
      entry.observations[child] = updated;
    });
  });
};

const removeObservationReferences = (days, targetKey) => {
  if (!days || typeof days !== 'object') {
    return;
  }
  Object.values(days).forEach((entry) => {
    if (!entry || typeof entry !== 'object') {
      return;
    }
    if (!entry.observations || typeof entry.observations !== 'object') {
      return;
    }
    Object.keys(entry.observations).forEach((child) => {
      const list = normalizeObservationList(entry.observations[child]);
      if (!list.length) {
        return;
      }
      const updated = list.filter(
        (item) => normalizeObservationKey(item) !== targetKey,
      );
      if (updated.length === list.length) {
        return;
      }
      entry.observations[child] = updated;
    });
  });
};

const replaceAngebotReferences = (days, fromKey, toText) => {
  if (!days || typeof days !== 'object') {
    return;
  }
  const normalizedTarget = normalizeAngebotText(toText);
  const targetKey = normalizeAngebotKey(normalizedTarget);
  if (!targetKey) {
    return;
  }

  Object.values(days).forEach((entry) => {
    if (!entry || !Array.isArray(entry.angebote)) {
      return;
    }
    const normalized = ensureUniqueSortedStrings(
      entry.angebote
        .map((item) => normalizeAngebotText(item))
        .filter(Boolean)
        .map((item) => (normalizeAngebotKey(item) === fromKey ? normalizedTarget : item)),
    );
    entry.angebote = normalized;
  });
};

const removeAngebotReferences = (days, targetKey) => {
  if (!days || typeof days !== 'object') {
    return;
  }
  Object.values(days).forEach((entry) => {
    if (!entry || typeof entry !== 'object') {
      return;
    }
    if (Array.isArray(entry.angebote)) {
      entry.angebote = entry.angebote.filter(
        (item) => normalizeAngebotKey(item) !== targetKey,
      );
    }
    if (entry.angebotModules && typeof entry.angebotModules === 'object') {
      Object.keys(entry.angebotModules).forEach((moduleId) => {
        const list = entry.angebotModules[moduleId];
        if (!Array.isArray(list)) {
          return;
        }
        entry.angebotModules[moduleId] = list.filter(
          (item) => normalizeAngebotKey(item) !== targetKey,
        );
      });
    }
  });
};

const buildDefaultObservations = (childrenList) => {
  if (!Array.isArray(childrenList)) {
    return {};
  }

  return childrenList.reduce((acc, child) => {
    acc[child] = [];
    return acc;
  }, {});
};

const buildDefaultObservationNotes = (childrenList) => {
  if (!Array.isArray(childrenList)) {
    return {};
  }

  return childrenList.reduce((acc, child) => {
    acc[child] = '';
    return acc;
  }, {});
};

const createDefaultDay = (date, childrenList = []) => ({
  date,
  angebote: [],
  angebotModules: {},
  angebotNotes: '',
  observations: buildDefaultObservations(childrenList),
  observationNotes: buildDefaultObservationNotes(childrenList),
  absentChildIds: [],
  notes: '',
});

const normalizeAbsentChildren = (value, childrenSet) => {
  const absentList = ensureUniqueSortedStrings(value || []);
  if (!childrenSet) {
    return absentList;
  }
  return absentList.filter((child) => childrenSet.has(child));
};

const sanitizeObservationsForDate = (observations, { absentSet, childrenSet, isFreeDay }) => {
  const shouldFillChildren = childrenSet && childrenSet.size > 0;
  if (isFreeDay) {
    return shouldFillChildren ? buildDefaultObservations(Array.from(childrenSet)) : {};
  }

  const result = {};
  if (observations && typeof observations === 'object') {
    Object.entries(observations).forEach(([child, value]) => {
      if (childrenSet && !childrenSet.has(child)) {
        return;
      }
      if (absentSet.has(child)) {
        return;
      }
      const normalized = normalizeObservationList(value);
      if (normalized.length) {
        result[child] = normalized;
      }
    });
  }

  if (shouldFillChildren) {
    childrenSet.forEach((child) => {
      if (!result[child]) {
        result[child] = [];
      }
    });
  }

  return result;
};

const sanitizeObservationNotesForDate = (observationNotes, { absentSet, childrenSet, isFreeDay }) => {
  const shouldFillChildren = childrenSet && childrenSet.size > 0;
  const result = {};
  if (observationNotes && typeof observationNotes === 'object') {
    Object.entries(observationNotes).forEach(([child, note]) => {
      if (childrenSet && !childrenSet.has(child)) {
        return;
      }
      if (absentSet.has(child)) {
        return;
      }
      result[child] = normalizeNoteText(note);
    });
  }

  if (shouldFillChildren) {
    childrenSet.forEach((child) => {
      if (!result[child]) {
        result[child] = '';
      }
    });
  }

  return result;
};

const mergeObservations = (currentObservations, patchObservations) => {
  if (!patchObservations || typeof patchObservations !== 'object') {
    return currentObservations;
  }

  const base =
    currentObservations && typeof currentObservations === 'object'
      ? { ...currentObservations }
      : {};

  Object.entries(patchObservations).forEach(([child, incomingValue]) => {
    const existing = normalizeObservationList(base[child]);
    let replace = false;
    let incomingList = [];

    if (Array.isArray(incomingValue) || typeof incomingValue === 'string') {
      incomingList = normalizeObservationList(incomingValue);
    } else if (incomingValue && typeof incomingValue === 'object') {
      const items =
        Array.isArray(incomingValue.items) || typeof incomingValue.items === 'string'
          ? incomingValue.items
          : Array.isArray(incomingValue.tags)
            ? incomingValue.tags
            : [];
      incomingList = normalizeObservationList(items);
      replace =
        incomingValue.replace === true ||
        incomingValue.replaceObservations === true ||
        incomingValue.replaceTags === true;
    }

    const merged = replace
      ? incomingList
      : normalizeObservationList([...existing, ...incomingList]);
    base[child] = merged;
  });

  return base;
};

const mergeObservationNotes = (currentNotes, patchNotes) => {
  if (!patchNotes || typeof patchNotes !== 'object') {
    return currentNotes;
  }

  const base =
    currentNotes && typeof currentNotes === 'object'
      ? { ...currentNotes }
      : {};

  Object.entries(patchNotes).forEach(([child, incomingValue]) => {
    base[child] = normalizeNoteText(incomingValue);
  });

  return base;
};

const normalizeTimetableSubjects = (value) =>
  ensureUniqueSortedStrings(Array.isArray(value) ? value : []).sort((a, b) =>
    a.localeCompare(b, 'de', { sensitivity: 'base' }),
  );

const isValidTimeRange = (value) => typeof value === 'string' && /^\d{2}:\d{2}$/.test(value);

const normalizeTimetableLessons = (value, fallback = DEFAULT_TIMETABLE_LESSONS) => {
  const source = Array.isArray(value) ? value : Array.isArray(fallback) ? fallback : [];
  const result = [];
  const max = 10;
  for (let i = 0; i < max; i += 1) {
    const period = i + 1;
    const entry = source[i] || {};
    const start = isValidTimeRange(entry.start) ? entry.start : fallback[i]?.start || '';
    const end = isValidTimeRange(entry.end) ? entry.end : fallback[i]?.end || '';
    result.push({ period, start, end });
  }
  return result;
};

const normalizeTimetableSchedule = (
  schedule,
  subjects = DEFAULT_TIMETABLE_SUBJECTS,
  lessons = DEFAULT_TIMETABLE_LESSONS,
) => {
  const normalizedSchedule = {};
  const source = schedule && typeof schedule === 'object' ? schedule : {};

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
      items.push(trimmed);
    });
    return items;
  };

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

const normalizeTimetableSubjectColorsDraft = (value, subjects) =>
  normalizeTimetableSubjectColors(value, subjects, DEFAULT_TIMETABLE_SUBJECT_COLORS);

const getTimetableData = () => {
  const state = getState();
  const subjects = normalizeTimetableSubjects(
    state.db?.timetableSubjects || DEFAULT_TIMETABLE_SUBJECTS,
  );
  const lessons = normalizeTimetableLessons(
    state.db?.timetableLessons || DEFAULT_TIMETABLE_LESSONS,
    DEFAULT_TIMETABLE_LESSONS,
  );
  const subjectColors = normalizeTimetableSubjectColorsDraft(
    state.db?.timetableSubjectColors,
    subjects,
  );
  const schedule = normalizeTimetableSchedule(
    state.db?.timetableSchedule || DEFAULT_TIMETABLE_SCHEDULE,
    subjects,
    lessons,
  );
  return { subjects, lessons, schedule, subjectColors };
};

const applyChildMappingToEntry = (entry, renameMap, allowedSet) => {
  if (!entry || typeof entry !== 'object') {
    return;
  }

  const nextObservations = {};
  if (entry.observations && typeof entry.observations === 'object') {
    Object.entries(entry.observations).forEach(([child, value]) => {
      const target = renameMap.get(child) || child;
      if (!allowedSet.has(target)) {
        return;
      }
      const merged = normalizeObservationList([
        ...(nextObservations[target] || []),
        ...normalizeObservationList(value),
      ]);
      if (merged.length) {
        nextObservations[target] = merged;
      }
    });
  }
  entry.observations = nextObservations;

  const absentList = Array.isArray(entry.absentChildIds) ? entry.absentChildIds : [];
  const updatedAbsent = [];
  absentList.forEach((child) => {
    const target = renameMap.get(child) || child;
    if (!allowedSet.has(target) || updatedAbsent.includes(target)) {
      return;
    }
    updatedAbsent.push(target);
  });
  entry.absentChildIds = updatedAbsent;
};

const ensureDaysContainer = (data) => {
  if (!data.days) {
    data.days = {};
  }
};

export const getChildrenList = () => {
  return getState().db?.children || [];
};

export const getClassProfile = () => {
  const state = getState();
  const profile = state.db?.classProfile || createEmptyClassProfile();
  const children = state.db?.children || [];
  const notesSource =
    (profile && typeof profile.childrenNotes === 'object' && profile.childrenNotes) || {};
  const childrenNotes = {};

  children.forEach((child) => {
    const normalizedChild = normalizeChildName(child);
    if (!normalizedChild) {
      return;
    }
    const note =
      typeof notesSource[normalizedChild] === 'string' ? notesSource[normalizedChild] : '';
    childrenNotes[normalizedChild] = note;
  });

  return {
    teacherName: typeof profile.teacherName === 'string' ? profile.teacherName : '',
    name: typeof profile.name === 'string' ? profile.name : '',
    badge: typeof profile.badge === 'string' ? profile.badge : '',
    motto: typeof profile.motto === 'string' ? profile.motto : '',
    notes: typeof profile.notes === 'string' ? profile.notes : '',
    childrenNotes,
  };
};

export const saveClassProfileFields = ({
  teacherName,
  name,
  badge,
  motto,
  notes,
} = {}) => {
  updateAppData((data) => {
    ensureClassProfileDraft(data);
    if (teacherName !== undefined) {
      data.classProfile.teacherName = normalizeInlineText(teacherName);
    }
    if (name !== undefined) {
      data.classProfile.name = normalizeInlineText(name);
    }
    if (badge !== undefined) {
      data.classProfile.badge = normalizeInlineText(badge);
    }
    if (motto !== undefined) {
      data.classProfile.motto = normalizeInlineText(motto);
    }
    if (notes !== undefined) {
      data.classProfile.notes = typeof notes === 'string' ? notes : '';
    }
  });
};

export const saveClassEntlassung = (entlassung) => {
  updateAppData((data) => {
    ensureClassProfileDraft(data);
    const childrenList = Array.isArray(data.children) ? data.children : [];
    data.classProfile.entlassung = normalizeEntlassung(entlassung, childrenList);
  });
};

export const saveClassChildren = (rows = []) => {
  const entries = Array.isArray(rows) ? rows : [];
  const renameMap = new Map();
  const desiredChildren = [];
  const noteMap = new Map();

  entries.forEach((row) => {
    if (!row) {
      return;
    }
    const normalizedName = normalizeChildName(row.name);
    const normalizedOriginal = normalizeChildName(row.originalName);
    const normalizedNote = normalizeNoteText(row.note);
    if (normalizedName) {
      desiredChildren.push(normalizedName);
      noteMap.set(normalizedName, normalizedNote);
    }
    if (normalizedOriginal && normalizedName && normalizedOriginal !== normalizedName) {
      renameMap.set(normalizedOriginal, normalizedName);
    }
  });

  const normalizedChildren = ensureUniqueSortedStrings(desiredChildren);
  const allowedSet = new Set(normalizedChildren);

  updateAppData((data) => {
    ensureClassProfileDraft(data);
    const existingNotes = data.classProfile.childrenNotes || {};
    const mergedNotes = {};

    Object.entries(existingNotes).forEach(([child, note]) => {
      const target = renameMap.get(child) || child;
      if (!allowedSet.has(target)) {
        return;
      }
      mergedNotes[target] = normalizeNoteText(note);
    });

    noteMap.forEach((note, child) => {
      mergedNotes[child] = normalizeNoteText(note);
    });

    if (data.days && typeof data.days === 'object') {
      Object.values(data.days).forEach((entry) => {
        applyChildMappingToEntry(entry, renameMap, allowedSet);
      });
    }

    data.children = normalizedChildren;
    data.classProfile.childrenNotes = {};
    normalizedChildren.forEach((child) => {
      data.classProfile.childrenNotes[child] = mergedNotes[child] || '';
    });
  });
};

export const getPresets = (type) => {
  const presets = getState().db;
  if (!presets) {
    return [];
  }

  if (type === 'angebote') {
    const catalog = normalizeAngebotCatalog(
      presets.angebotCatalog || presets.angebote,
      presets.angebote,
    );
    const labels = getAngebotCatalogLabels(catalog);
    if (labels.length) {
      return labels;
    }
    return presets.angebote || [];
  }

  if (type === 'observations') {
    return presets.observationTemplates || [];
  }

  return [];
};

export const getFreeDays = () => {
  const data = getState().db?.settings;
  return Array.isArray(data?.freeDays) ? data.freeDays : [];
};

export const saveFreeDays = (rows = []) => {
  const normalized = normalizeFreeDays(rows);
  updateAppData((data) => {
    if (!data.settings) {
      data.settings = {};
    }
    data.settings.freeDays = normalized;
  });
};

export const getEntry = (date) => {
  const ymd = ensureYmd(date, todayYmd());
  const days = getState().db?.days || {};

  if (days[ymd]) {
    return days[ymd];
  }

  const childrenList = getChildrenList();
  const entry = createDefaultDay(ymd, childrenList);
  updateAppData((data) => {
    ensureDaysContainer(data);
    data.days[ymd] = entry;
  });

  return entry;
};

export const updateEntry = (date, patch) => {
  const ymd = ensureYmd(date, todayYmd());
  const payload = patch && typeof patch === 'object' ? patch : {};
  const childrenList = getChildrenList();
  const childrenSet = new Set(childrenList);
  const freeDays = getFreeDays();
  const { lessons: timetableLessons, schedule: timetableSchedule } = getTimetableData();

  updateAppData((data) => {
    ensureDaysContainer(data);
    const existing =
      data.days[ymd] || createDefaultDay(ymd, childrenList);
    const merged = { ...existing, ...payload };

    const modulesForDay = getFreizeitModulesForDate(
      ymd,
      timetableSchedule,
      timetableLessons,
    );
    const normalizedExistingModules = modulesForDay.length
      ? normalizeModuleAssignments(modulesForDay, existing.angebotModules, existing.angebote)
      : {};
    const normalizeByAggregated = (desiredList) => {
      const desired = normalizeAngebotListForModules(desiredList);
      if (!modulesForDay.length) {
        return {
          assignments: {},
          aggregated: desired,
        };
      }
      const desiredSet = new Set(desired);
      const trimmed = {};
      modulesForDay.forEach((module, index) => {
        const currentList = normalizedExistingModules[module.id] || [];
        const nextList = currentList.filter((angebot) => {
          if (desiredSet.has(angebot)) {
            desiredSet.delete(angebot);
            return true;
          }
          return false;
        });
        trimmed[module.id] = nextList;
        if (!nextList.length && !desired.length) {
          trimmed[module.id] = [];
        }
        if (index === 0 && desiredSet.size) {
          trimmed[module.id] = normalizeAngebotListForModules([
            ...nextList,
            ...Array.from(desiredSet),
          ]);
          desiredSet.clear();
        }
      });
      const normalizedAssignments = normalizeModuleAssignments(
        modulesForDay,
        trimmed,
        Array.from(desiredSet),
      );
      return {
        assignments: normalizedAssignments,
        aggregated: flattenModuleAssignments(normalizedAssignments),
      };
    };

    if (payload.angebotModules && typeof payload.angebotModules === 'object') {
      const mergedAssignments = mergeModuleAssignments(
        normalizedExistingModules,
        payload.angebotModules,
      );
      const normalizedAssignments = normalizeModuleAssignments(
        modulesForDay,
        mergedAssignments,
        payload.angebote,
      );
      merged.angebotModules = normalizedAssignments;
      merged.angebote = modulesForDay.length
        ? flattenModuleAssignments(normalizedAssignments)
        : normalizeAngebotListForModules(payload.angebote || existing.angebote);
    } else if (payload.angebote) {
      const { assignments, aggregated } = normalizeByAggregated(payload.angebote);
      merged.angebotModules = assignments;
      merged.angebote = aggregated;
    } else if (modulesForDay.length) {
      const normalizedAssignments = normalizeModuleAssignments(
        modulesForDay,
        normalizedExistingModules,
        existing.angebote,
      );
      merged.angebotModules = normalizedAssignments;
      merged.angebote = flattenModuleAssignments(normalizedAssignments);
    } else {
      merged.angebotModules = {};
      merged.angebote = normalizeAngebotListForModules(existing.angebote);
    }

    if (payload.observations) {
      merged.observations = mergeObservations(
        existing.observations,
        payload.observations,
      );
    }
    if (payload.observationNotes) {
      merged.observationNotes = mergeObservationNotes(
        existing.observationNotes,
        payload.observationNotes,
      );
    }
    merged.angebotNotes = normalizeAngebotNote(
      payload.angebotNotes !== undefined ? payload.angebotNotes : existing.angebotNotes,
    );
    const absentValues = merged.absentChildIds || merged.absentChildren || [];
    merged.absentChildIds = normalizeAbsentChildren(absentValues, childrenSet);
    const absentSet = new Set(merged.absentChildIds);
    merged.observations = sanitizeObservationsForDate(
      merged.observations || existing.observations,
      {
        absentSet,
        childrenSet,
        isFreeDay: isFreeDay(ymd, freeDays),
      },
    );
    merged.observationNotes = sanitizeObservationNotesForDate(
      merged.observationNotes || existing.observationNotes,
      {
        absentSet,
        childrenSet,
        isFreeDay: isFreeDay(ymd, freeDays),
      },
    );
    merged.date = ymd;
    data.days[ymd] = merged;
  });
};

export const getAngebotCatalog = () => {
  const data = getState().db;
  if (!data) {
    return [];
  }
  return normalizeAngebotCatalog(data.angebotCatalog || data.angebote, data.angebote);
};

export const upsertAngebotCatalogEntry = (value, groups = []) => {
  const normalizedText = normalizeAngebotText(value);
  if (!normalizedText) {
    return '';
  }

  const normalizedGroups = normalizeAngebotGroups(groups);
  let resolvedText = normalizedText;

  updateAppData((data) => {
    const catalog = normalizeAngebotCatalog(
      data.angebotCatalog || data.angebote,
      data.angebote,
    );
    const normalizedKey = normalizeAngebotKey(normalizedText);
    const index = catalog.findIndex(
      (entry) => normalizeAngebotKey(entry?.text || entry || '') === normalizedKey,
    );

    if (index >= 0) {
      const existing = catalog[index];
      resolvedText = normalizeAngebotText(existing?.text || existing || normalizedText);
      const mergedGroups = normalizeAngebotGroups([
        ...(Array.isArray(existing?.groups) ? existing.groups : []),
        ...normalizedGroups,
      ]);
      catalog[index] =
        typeof existing === 'string'
          ? {
              id: buildAngebotId(resolvedText),
              text: resolvedText,
              groups: mergedGroups,
              createdAt: new Date().toISOString(),
            }
          : {
              ...existing,
              text: resolvedText,
              groups: mergedGroups,
            };
    } else {
      catalog.push({
        id: buildAngebotId(normalizedText),
        text: normalizedText,
        groups: normalizedGroups,
        createdAt: new Date().toISOString(),
      });
    }

    data.angebotCatalog = catalog;
    data.angebote = ensureUniqueSortedStrings([...(data.angebote || []), resolvedText]);
  });

  return resolvedText;
};

export const updateAngebotCatalogEntry = ({ currentText, nextText, groups = [] }) => {
  const normalizedCurrent = normalizeAngebotText(currentText);
  const normalizedNext = normalizeAngebotText(nextText);
  if (!normalizedCurrent || !normalizedNext) {
    return { status: 'invalid', value: normalizedNext || '' };
  }

  const normalizedGroups = normalizeAngebotGroups(groups);
  const currentKey = normalizeAngebotKey(normalizedCurrent);
  const nextKey = normalizeAngebotKey(normalizedNext);
  let result = { status: 'updated', value: normalizedNext };

  updateAppData((data) => {
    const catalog = normalizeAngebotCatalog(
      data.angebotCatalog || data.angebote,
      data.angebote,
    );
    const currentIndex = catalog.findIndex(
      (entry) => normalizeAngebotKey(entry?.text || entry || '') === currentKey,
    );
    if (currentIndex < 0) {
      catalog.push({
        id: buildAngebotId(normalizedNext),
        text: normalizedNext,
        groups: normalizedGroups,
        createdAt: new Date().toISOString(),
      });
      data.angebotCatalog = catalog;
      data.angebote = ensureUniqueSortedStrings([...(data.angebote || []), normalizedNext]);
      result = { status: 'created', value: normalizedNext };
      return;
    }

    const targetIndex = catalog.findIndex(
      (entry, index) =>
        index !== currentIndex &&
        normalizeAngebotKey(entry?.text || entry || '') === nextKey,
    );

    if (targetIndex >= 0) {
      const targetEntry = catalog[targetIndex];
      const targetText = normalizeAngebotText(targetEntry?.text || targetEntry || normalizedNext);
      const mergedGroups = normalizeAngebotGroups([
        ...(Array.isArray(targetEntry?.groups) ? targetEntry.groups : []),
        ...normalizedGroups,
      ]);
      catalog[targetIndex] =
        typeof targetEntry === 'string'
          ? {
              id: buildAngebotId(targetText || normalizedNext),
              text: targetText || normalizedNext,
              groups: mergedGroups,
              createdAt: new Date().toISOString(),
            }
          : {
              ...targetEntry,
              text: targetText || normalizedNext,
              groups: mergedGroups,
            };
      catalog.splice(currentIndex, 1);
      if (data.days) {
        replaceAngebotReferences(data.days, currentKey, targetText || normalizedNext);
      }
      result = {
        status: 'merged',
        value: targetText || normalizedNext,
      };
      data.angebotCatalog = catalog;
      data.angebote = ensureUniqueSortedStrings([
        ...(data.angebote || []),
        targetText || normalizedNext,
      ]);
      return;
    }

    const existing = catalog[currentIndex];
    const existingText =
      typeof existing === 'string'
        ? normalizeAngebotText(existing)
        : normalizeAngebotText(existing?.text);
    const mergedGroups = normalizeAngebotGroups([
      ...(Array.isArray(existing?.groups) ? existing.groups : []),
      ...normalizedGroups,
    ]);
    if (existingText !== normalizedNext && data.days) {
      replaceAngebotReferences(data.days, currentKey, normalizedNext);
    }
    catalog[currentIndex] =
      typeof existing === 'string'
        ? {
            id: buildAngebotId(normalizedNext),
            text: normalizedNext,
            groups: mergedGroups,
            createdAt: new Date().toISOString(),
          }
        : {
            ...existing,
            id: buildAngebotId(normalizedNext),
            text: normalizedNext,
            groups: mergedGroups,
          };
    data.angebotCatalog = catalog;
    data.angebote = ensureUniqueSortedStrings([
      ...(data.angebote || []),
      normalizedNext,
    ]);
  });

  return result;
};

export const removeAngebotCatalogEntry = (value) => {
  const normalizedText = normalizeAngebotText(value);
  const normalizedKey = normalizeAngebotKey(normalizedText);
  if (!normalizedText || !normalizedKey) {
    return false;
  }

  let removed = false;

  updateAppData((data) => {
    const catalog = normalizeAngebotCatalog(
      data.angebotCatalog || data.angebote,
      data.angebote,
    );
    const filtered = catalog.filter(
      (entry) => normalizeAngebotKey(entry?.text || entry || '') !== normalizedKey,
    );
    if (filtered.length === catalog.length) {
      return;
    }
    removed = true;
    data.angebotCatalog = filtered;
    data.angebote = ensureUniqueSortedStrings(
      (data.angebote || []).filter(
        (item) => normalizeAngebotKey(item) !== normalizedKey,
      ),
    );
    if (data.days) {
      removeAngebotReferences(data.days, normalizedKey);
    }
  });

  return removed;
};

export const upsertObservationCatalogEntry = (value, groups = []) => {
  const normalizedText = normalizeObservationText(value);
  if (!normalizedText) {
    return '';
  }

  const normalizedGroups = normalizeObservationGroups(groups);
  let resolvedText = normalizedText;

  updateAppData((data) => {
    const catalog = Array.isArray(data.observationCatalog)
      ? [...data.observationCatalog]
      : [];
    const normalizedKey = normalizeObservationKey(normalizedText);
    const index = catalog.findIndex(
      (entry) => normalizeObservationKey(entry?.text || entry || '') === normalizedKey,
    );

    if (index >= 0) {
      const existing = catalog[index];
      const existingText =
        typeof existing === 'string'
          ? normalizeObservationText(existing)
          : normalizeObservationText(existing?.text);
      resolvedText = existingText || normalizedText;
      const existingGroups =
        typeof existing === 'string' ? [] : normalizeObservationGroups(existing?.groups);
      const mergedGroups = normalizeObservationGroups([
        ...existingGroups,
        ...normalizedGroups,
      ]);
      if (typeof existing === 'string') {
        if (mergedGroups.length) {
          catalog[index] = {
            id: buildObservationId(resolvedText),
            text: resolvedText,
            groups: mergedGroups,
            createdAt: new Date().toISOString(),
          };
        }
      } else if (mergedGroups.length) {
        catalog[index] = {
          ...existing,
          text: resolvedText,
          groups: mergedGroups,
        };
      }
    } else {
      catalog.push({
        id: buildObservationId(normalizedText),
        text: normalizedText,
        groups: normalizedGroups,
        createdAt: new Date().toISOString(),
      });
    }

    data.observationCatalog = catalog;
    data.observationTemplates = ensureUniqueSortedStrings([
      ...(data.observationTemplates || []),
      resolvedText,
    ]);
  });

  return resolvedText;
};

export const updateObservationCatalogEntry = ({
  currentText,
  nextText,
  groups = [],
}) => {
  const normalizedCurrent = normalizeObservationText(currentText);
  const normalizedNext = normalizeObservationText(nextText);
  if (!normalizedCurrent || !normalizedNext) {
    return { status: 'invalid', value: normalizedNext || '' };
  }

  const normalizedGroups = normalizeObservationGroups(groups);
  const currentKey = normalizeObservationKey(normalizedCurrent);
  const nextKey = normalizeObservationKey(normalizedNext);
  let result = { status: 'updated', value: normalizedNext };

  updateAppData((data) => {
    const catalog = Array.isArray(data.observationCatalog)
      ? [...data.observationCatalog]
      : [];
    const currentIndex = catalog.findIndex(
      (entry) =>
        normalizeObservationKey(entry?.text || entry || '') === currentKey,
    );
    if (currentIndex === -1) {
      return;
    }

    const targetIndex = catalog.findIndex(
      (entry) =>
        normalizeObservationKey(entry?.text || entry || '') === nextKey,
    );

    if (targetIndex !== -1 && targetIndex !== currentIndex) {
      const currentEntry = catalog[currentIndex];
      const targetEntry = catalog[targetIndex];
      const targetText =
        typeof targetEntry === 'string'
          ? normalizeObservationText(targetEntry)
          : normalizeObservationText(targetEntry?.text);
      const currentGroups =
        typeof currentEntry === 'string'
          ? []
          : normalizeObservationGroups(currentEntry?.groups);
      const targetGroups =
        typeof targetEntry === 'string'
          ? []
          : normalizeObservationGroups(targetEntry?.groups);
      const mergedGroups = normalizeObservationGroups([
        ...targetGroups,
        ...currentGroups,
        ...normalizedGroups,
      ]);
      catalog[targetIndex] =
        typeof targetEntry === 'string'
          ? {
              id: buildObservationId(targetText || normalizedNext),
              text: targetText || normalizedNext,
              groups: mergedGroups,
              createdAt: new Date().toISOString(),
            }
          : {
              ...targetEntry,
              text: targetText || normalizedNext,
              groups: mergedGroups,
            };
      catalog.splice(currentIndex, 1);
      if (data.days) {
        replaceObservationReferences(
          data.days,
          currentKey,
          targetText || normalizedNext,
        );
      }
      result = {
        status: 'merged',
        value: targetText || normalizedNext,
      };
      data.observationCatalog = catalog;
      return;
    }

    const existing = catalog[currentIndex];
    const existingText =
      typeof existing === 'string'
        ? normalizeObservationText(existing)
        : normalizeObservationText(existing?.text);
    if (existingText !== normalizedNext && data.days) {
      replaceObservationReferences(data.days, currentKey, normalizedNext);
    }
    catalog[currentIndex] =
      typeof existing === 'string'
        ? {
            id: buildObservationId(normalizedNext),
            text: normalizedNext,
            groups: normalizedGroups,
            createdAt: new Date().toISOString(),
          }
        : {
            ...existing,
            id: buildObservationId(normalizedNext),
            text: normalizedNext,
            groups: normalizedGroups,
          };
    data.observationCatalog = catalog;
    result = { status: 'updated', value: normalizedNext };
  });

  return result;
};

export const removeObservationCatalogEntry = (value) => {
  const normalizedText = normalizeObservationText(value);
  const normalizedKey = normalizeObservationKey(normalizedText);
  if (!normalizedText || !normalizedKey) {
    return false;
  }

  let removed = false;

  updateAppData((data) => {
    const catalog = Array.isArray(data.observationCatalog)
      ? [...data.observationCatalog]
      : [];
    const filtered = catalog.filter(
      (entry) =>
        normalizeObservationKey(entry?.text || entry || '') !== normalizedKey,
    );
    if (filtered.length === catalog.length) {
      return;
    }
    removed = true;
    data.observationCatalog = filtered;
    data.observationTemplates = ensureUniqueSortedStrings(
      (data.observationTemplates || []).filter(
        (item) => normalizeObservationKey(item) !== normalizedKey,
      ),
    );
    if (data.days) {
      removeObservationReferences(data.days, normalizedKey);
    }
  });

  return removed;
};

export const addPreset = (type, value) => {
  const trimmed =
    type === 'observations'
      ? normalizeObservationText(value)
      : type === 'angebote'
        ? normalizeAngebotText(value)
        : typeof value === 'string'
          ? value.trim()
          : '';
  if (!trimmed) {
    return;
  }

  const presets = getPresets(type);
  if (type !== 'observations' && presets.includes(trimmed)) {
    return;
  }

  updateAppData((data) => {
    if (type === 'angebote') {
      const catalog = normalizeAngebotCatalog(
        data.angebotCatalog || data.angebote,
        data.angebote,
      );
      const existing = catalog.find(
        (entry) => normalizeAngebotKey(entry?.text || entry || '') === normalizeAngebotKey(trimmed),
      );
      if (!existing) {
        catalog.push({
          id: buildAngebotId(trimmed),
          text: trimmed,
          groups: [],
          createdAt: new Date().toISOString(),
        });
      }
      data.angebotCatalog = catalog;
      data.angebote = ensureUniqueSortedStrings([...(data.angebote || []), trimmed]);
      return;
    }

    if (type === 'observations') {
      const catalog = Array.isArray(data.observationCatalog)
        ? data.observationCatalog
        : [];
      const normalizedKey = normalizeObservationKey(trimmed);
      const existing = catalog.find(
        (entry) =>
          normalizeObservationKey(entry?.text || '') === normalizedKey,
      );
      if (!existing) {
        catalog.push({
          id: buildObservationId(trimmed),
          text: trimmed,
          groups: [],
          createdAt: new Date().toISOString(),
        });
      }
      data.observationCatalog = catalog;
      data.observationTemplates = ensureUniqueSortedStrings([
        ...(data.observationTemplates || []),
        trimmed,
      ]);
    }
  });
};

export const clearDay = (date) => {
  const ymd = ensureYmd(date, todayYmd());

  updateAppData((data) => {
    ensureDaysContainer(data);
    delete data.days[ymd];
  });
};

export const resetOverlay = async () => {
  clearAppData();
  await initStore();
};

export const exportJson = (mode) => {
  const { db, ui } = getState();
  const exportMode = mode === 'all' ? 'all' : 'day';

  if (!db) {
    return { filename: 'freilog.json', jsonString: '{}' };
  }

  if (exportMode === 'all') {
    const payload = {
      ...db,
      groupDictionary: db.observationGroups,
    };
    return {
      filename: `freilog-${todayYmd()}-all.json`,
      jsonString: JSON.stringify(payload, null, 2),
    };
  }

  const date = ensureYmd(ui.selectedDate, todayYmd());
  const entry =
    db.days?.[date] || createDefaultDay(date, getChildrenList());
  const payload = { type: 'day', date, entry };

  return {
    filename: `freilog-${date}.json`,
    jsonString: JSON.stringify(payload, null, 2),
  };
};

export const importJson = (obj) => {
  if (!obj || typeof obj !== 'object') {
    return;
  }

  let applied = false;
  const childrenList = getState().db?.children || [];
  const freeDays = getFreeDays();
  const hasSchemaVersion = typeof obj.schemaVersion === 'number';
  const hasCatalog = Array.isArray(obj.observationCatalog);
  const hasValidCatalog =
    hasCatalog &&
    obj.observationCatalog.every(
      (item) =>
        item &&
        typeof item === 'object' &&
        typeof item.text === 'string' &&
        item.text.trim(),
    );

  if (hasSchemaVersion && hasCatalog) {
    if (!hasValidCatalog) {
      return;
    }

    const sanitizedCatalog = obj.observationCatalog.map((item) => ({
      ...item,
      groups: Array.isArray(item.groups) ? item.groups : [],
    }));
    const importedGroups =
      obj.groupDictionary && typeof obj.groupDictionary === 'object'
        ? obj.groupDictionary
        : obj.observationGroups;
    const normalized = normalizeAppData(
      {
        ...obj,
        observationCatalog: sanitizedCatalog,
        observationGroups: importedGroups,
      },
      getState().db || {},
    );

    updateAppData((data) => {
      const merged = normalizeAppData(normalized, data);
      Object.assign(data, merged);
    });

    applied = true;
  } else {
    const payload = obj;
    if (!isValidYmd(payload.date) || typeof payload.entry !== 'object') {
      return;
    }

    const { lessons: timetableLessons, schedule: timetableSchedule } = getTimetableData();
    const sanitizedDay =
      sanitizeDaysByDate(
        { [payload.date]: payload.entry },
        childrenList,
        freeDays,
        timetableSchedule,
        timetableLessons,
      )[payload.date] || createDefaultDay(payload.date, childrenList);

    updateEntry(payload.date, sanitizedDay);
    applied = true;
  }

  if (applied) {
    setSelectedDate(todayYmd());
  }
};

export const getTimetable = () => getTimetableData();

export const saveTimetableSubjects = (subjects) => {
  updateAppData((data) => {
    const normalizedSubjects = normalizeTimetableSubjects(subjects);
    data.timetableSubjects = normalizedSubjects;
    data.timetableSubjectColors = normalizeTimetableSubjectColorsDraft(
      data.timetableSubjectColors,
      normalizedSubjects,
    );
    data.timetableLessons = normalizeTimetableLessons(
      data.timetableLessons,
      DEFAULT_TIMETABLE_LESSONS,
    );
    data.timetableSchedule = normalizeTimetableSchedule(
      data.timetableSchedule,
      normalizedSubjects,
      data.timetableLessons,
    );
  });
};

export const saveTimetableLessons = (lessons) => {
  updateAppData((data) => {
    const normalizedLessons = normalizeTimetableLessons(lessons, DEFAULT_TIMETABLE_LESSONS);
    data.timetableLessons = normalizedLessons;
    data.timetableSubjects = normalizeTimetableSubjects(
      data.timetableSubjects || DEFAULT_TIMETABLE_SUBJECTS,
    );
    data.timetableSubjectColors = normalizeTimetableSubjectColorsDraft(
      data.timetableSubjectColors,
      data.timetableSubjects,
    );
    data.timetableSchedule = normalizeTimetableSchedule(
      data.timetableSchedule,
      data.timetableSubjects,
      normalizedLessons,
    );
  });
};

export const saveTimetableSchedule = (schedule) => {
  updateAppData((data) => {
    data.timetableSubjects = normalizeTimetableSubjects(
      data.timetableSubjects || DEFAULT_TIMETABLE_SUBJECTS,
    );
    data.timetableSubjectColors = normalizeTimetableSubjectColorsDraft(
      data.timetableSubjectColors,
      data.timetableSubjects,
    );
    data.timetableLessons = normalizeTimetableLessons(
      data.timetableLessons || DEFAULT_TIMETABLE_LESSONS,
      DEFAULT_TIMETABLE_LESSONS,
    );
    data.timetableSchedule = normalizeTimetableSchedule(
      schedule,
      data.timetableSubjects,
      data.timetableLessons,
    );
  });
};

export const saveTimetableSubjectColors = (subjectColors) => {
  updateAppData((data) => {
    data.timetableSubjects = normalizeTimetableSubjects(
      data.timetableSubjects || DEFAULT_TIMETABLE_SUBJECTS,
    );
    data.timetableSubjectColors = normalizeTimetableSubjectColorsDraft(
      subjectColors,
      data.timetableSubjects,
    );
    data.timetableLessons = normalizeTimetableLessons(
      data.timetableLessons || DEFAULT_TIMETABLE_LESSONS,
      DEFAULT_TIMETABLE_LESSONS,
    );
    data.timetableSchedule = normalizeTimetableSchedule(
      data.timetableSchedule,
      data.timetableSubjects,
      data.timetableLessons,
    );
  });
};
