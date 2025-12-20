import { DEFAULT_EXPORT_MODE } from '../config.js';
import { isValidYmd } from '../utils/date.js';

const isPlainObject = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

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

const normalizeObservationEntries = (value, childrenSet) => {
  let source = {};

  if (Array.isArray(value)) {
    source = value.reduce((acc, item) => {
      if (item && item.child) {
        acc[item.child] = {
          preset: item.preset || '',
          note: item.note || '',
        };
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

    const item = isPlainObject(source[child]) ? source[child] : {};
    const preset =
      typeof item.preset === 'string' ? item.preset.trim() : '';
    const note = typeof item.note === 'string' ? item.note : '';

    result[child] = { preset, note };
  });

  return result;
};

const normalizeEntry = (entry, date, childrenSet) => {
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
  const angebote = ensureUniqueStrings(angebotList);
  const absentChildren = ensureUniqueStrings(source.absentChildren);
  const filteredAbsent = childrenSet
    ? absentChildren.filter((name) => childrenSet.has(name))
    : absentChildren;
  const observations = normalizeObservationEntries(
    source.observations,
    childrenSet,
  );
  const notes = typeof source.notes === 'string' ? source.notes : '';

  return {
    date,
    angebote,
    observations,
    absentChildren: filteredAbsent,
    notes,
  };
};

export const sanitizeEntriesByDate = (entriesByDate, childrenList) => {
  if (!isPlainObject(entriesByDate)) {
    return {};
  }

  const childrenSet = Array.isArray(childrenList)
    ? new Set(childrenList)
    : null;
  const result = {};

  Object.keys(entriesByDate).forEach((date) => {
    if (!isValidYmd(date)) {
      return;
    }
    result[date] = normalizeEntry(entriesByDate[date], date, childrenSet);
  });

  return result;
};

export const safeDeepMerge = (a, b) => {
  if (!isPlainObject(a) && !isPlainObject(b)) {
    return b !== undefined ? b : a;
  }

  const base = isPlainObject(a) ? { ...a } : {};
  const incoming = isPlainObject(b) ? b : {};

  Object.keys(incoming).forEach((key) => {
    const baseValue = base[key];
    const incomingValue = incoming[key];

    if (isPlainObject(baseValue) && isPlainObject(incomingValue)) {
      base[key] = safeDeepMerge(baseValue, incomingValue);
    } else {
      base[key] = incomingValue;
    }
  });

  return base;
};

export const normalizeBaseDb = (base) => {
  const source = isPlainObject(base) ? base : {};
  const presetData = isPlainObject(source.presetData) ? source.presetData : {};
  const records = isPlainObject(source.records) ? source.records : {};
  const settings = isPlainObject(source.settings) ? source.settings : {};

  return {
    meta: isPlainObject(source.meta) ? { ...source.meta } : {},
    presetData: {
      childrenList: ensureUniqueSortedStrings(presetData.childrenList),
      angebote: ensureUniqueSortedStrings(presetData.angebote),
      observations: ensureUniqueSortedStrings(presetData.observations),
    },
    records: {
      entriesByDate: isPlainObject(records.entriesByDate)
        ? { ...records.entriesByDate }
        : {},
    },
    settings: {
      exportMode:
        typeof settings.exportMode === 'string'
          ? settings.exportMode
          : DEFAULT_EXPORT_MODE,
    },
  };
};

export const normalizeOverlay = (overlay) => {
  if (!isPlainObject(overlay)) {
    return null;
  }

  const meta = isPlainObject(overlay.meta) ? overlay.meta : {};
  const records = isPlainObject(overlay.records) ? overlay.records : {};
  const presetOverrides = isPlainObject(overlay.presetOverrides)
    ? overlay.presetOverrides
    : {};
  const ui = isPlainObject(overlay.ui) ? overlay.ui : {};

  return {
    meta: {
      savedAt:
        typeof meta.savedAt === 'string'
          ? meta.savedAt
          : new Date().toISOString(),
    },
    records: {
      entriesByDate: isPlainObject(records.entriesByDate)
        ? { ...records.entriesByDate }
        : {},
    },
    presetOverrides: {
      angeboteAdded: ensureUniqueSortedStrings(presetOverrides.angeboteAdded),
      observationsAdded: ensureUniqueSortedStrings(
        presetOverrides.observationsAdded,
      ),
    },
    ui: {
      selectedDate: typeof ui.selectedDate === 'string' ? ui.selectedDate : '',
      exportMode: typeof ui.exportMode === 'string' ? ui.exportMode : '',
    },
  };
};

export const normalizeEffectiveDb = (db) => {
  return normalizeBaseDb(db);
};
