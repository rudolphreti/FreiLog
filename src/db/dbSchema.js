import { DEFAULT_DRAWER_SECTIONS, DEFAULT_EXPORT_MODE } from '../config.js';
import { isValidYmd } from '../utils/date.js';

export const SCHEMA_VERSION = 2;

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
          tags: Array.isArray(item.tags) ? item.tags : [],
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
    const tags = ensureUniqueStrings(item.tags);
    if (preset && !tags.includes(preset)) {
      tags.push(preset);
    }
    const note = typeof item.note === 'string' ? item.note : '';

    result[child] = { tags, note };
  });

  return result;
};

const normalizeDayEntry = (entry, date, childrenSet) => {
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
  const notes = typeof source.notes === 'string' ? source.notes : '';

  return {
    date,
    angebote,
    observations,
    absentChildIds: filteredAbsent,
    notes,
  };
};

export const sanitizeDaysByDate = (days, childrenList) => {
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
    result[date] = normalizeDayEntry(days[date], date, childrenSet);
  });

  return result;
};

const normalizeUi = (ui) => {
  const source = isPlainObject(ui) ? ui : {};
  const drawer = isPlainObject(source.drawer) ? source.drawer : {};
  const drawerSections = isPlainObject(drawer.sections)
    ? drawer.sections
    : {};

  return {
    selectedDate: typeof source.selectedDate === 'string' ? source.selectedDate : '',
    exportMode: typeof source.exportMode === 'string' ? source.exportMode : '',
    observationsFilter:
      typeof source.observationsFilter === 'string'
        ? source.observationsFilter
        : 'ALL',
    drawer: {
      open: typeof drawer.open === 'boolean' ? drawer.open : false,
      sections: {
        actions:
          typeof drawerSections.actions === 'boolean'
            ? drawerSections.actions
            : DEFAULT_DRAWER_SECTIONS.actions,
        attendance:
          typeof drawerSections.attendance === 'boolean'
            ? drawerSections.attendance
            : DEFAULT_DRAWER_SECTIONS.attendance,
        angebote:
          typeof drawerSections.angebote === 'boolean'
            ? drawerSections.angebote
            : DEFAULT_DRAWER_SECTIONS.angebote,
      },
    },
  };
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
      if (!data || typeof data !== 'object') {
        return;
      }
      const tags = ensureUniqueStrings(data.tags);
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
  angebote: [],
  observationTemplates: [],
  days: {},
  observationStats: {},
  settings: {
    exportMode: DEFAULT_EXPORT_MODE,
  },
  ui: normalizeUi(null),
});

export const normalizeAppData = (source, fallback = {}) => {
  const base = isPlainObject(source) ? source : {};
  const fallbackData = isPlainObject(fallback) ? fallback : {};

  const children = ensureUniqueSortedStrings(
    Array.isArray(base.children) ? base.children : fallbackData.children,
  );

  const angebote = ensureUniqueSortedStrings(
    Array.isArray(base.angebote) ? base.angebote : fallbackData.angebote,
  );

  const observationTemplates = ensureUniqueSortedStrings(
    Array.isArray(base.observationTemplates)
      ? base.observationTemplates
      : fallbackData.observationTemplates,
  );

  const daysSource =
    base.days || base.records?.entriesByDate || fallbackData.days || {};
  const days = sanitizeDaysByDate(daysSource, children);

  const exportMode =
    typeof base.settings?.exportMode === 'string'
      ? base.settings.exportMode
      : typeof fallbackData.settings?.exportMode === 'string'
        ? fallbackData.settings.exportMode
        : DEFAULT_EXPORT_MODE;

  const uiSource = base.ui || fallbackData.ui || null;

  return {
    schemaVersion:
      typeof base.schemaVersion === 'number'
        ? base.schemaVersion
        : SCHEMA_VERSION,
    children,
    angebote,
    observationTemplates,
    days,
    observationStats: buildObservationStats(days),
    settings: {
      exportMode,
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
