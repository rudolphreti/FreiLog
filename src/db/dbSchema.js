import { DEFAULT_EXPORT_MODE } from '../config.js';

const isPlainObject = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

export const ensureUniqueSortedStrings = (arr) => {
  if (!Array.isArray(arr)) {
    return [];
  }

  const unique = new Set();
  arr.forEach((item) => {
    if (typeof item === 'string') {
      unique.add(item);
    }
  });

  return Array.from(unique).sort((a, b) => a.localeCompare(b));
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
