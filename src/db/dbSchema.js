import { DEFAULT_DRAWER_SECTIONS, DEFAULT_EXPORT_MODE } from '../config.js';
import { isValidYmd } from '../utils/date.js';
import {
  OBSERVATION_GROUP_CODES,
  buildObservationId,
  getObservationCatalogLabels,
  normalizeObservationGroups,
  normalizeObservationKey,
  normalizeObservationText,
} from '../utils/observationCatalog.js';

export const SCHEMA_VERSION = 3;

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
      result[child] = ensureUniqueStrings(entry);
      return;
    }

    if (typeof entry === 'string') {
      result[child] = ensureUniqueStrings([entry]);
      return;
    }

    const item = isPlainObject(entry) ? entry : {};
    const preset =
      typeof item.preset === 'string' ? item.preset.trim() : '';
    const tags = ensureUniqueStrings(item.tags);
    if (preset && !tags.includes(preset)) {
      tags.push(preset);
    }

    result[child] = tags;
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
        settings:
          typeof drawerSections.settings === 'boolean'
            ? drawerSections.settings
            : DEFAULT_DRAWER_SECTIONS.settings,
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
      const tags = ensureUniqueStrings(list);
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
  observationCatalog: [],
  observationGroups: { ...DEFAULT_OBSERVATION_GROUPS },
  days: {},
  observationStats: {},
  settings: {
    exportMode: DEFAULT_EXPORT_MODE,
  },
  ui: {
    ...normalizeUi(null),
    overlay: {
      savedObsFilters: { ...DEFAULT_SAVED_OBSERVATION_FILTERS },
    },
  },
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
    schemaVersion: SCHEMA_VERSION,
    children,
    angebote,
    observationTemplates: getObservationCatalogLabels(observationCatalog),
    observationCatalog,
    observationGroups,
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
