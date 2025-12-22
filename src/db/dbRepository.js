import {
  ensureUniqueSortedStrings,
  normalizeAppData,
  sanitizeDaysByDate,
} from './dbSchema.js';
import { clearAppData } from '../state/persistence.js';
import { getState, initStore, updateAppData } from '../state/store.js';
import { ensureYmd, isValidYmd, todayYmd } from '../utils/date.js';
import {
  buildObservationId,
  normalizeObservationGroups,
  normalizeObservationKey,
  normalizeObservationText,
} from '../utils/observationCatalog.js';

const normalizeObservationList = (value) => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed ? [trimmed] : [];
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
    const trimmed = item.trim();
    if (!trimmed || unique.has(trimmed)) {
      return;
    }
    unique.add(trimmed);
    result.push(trimmed);
  });

  return result;
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

const createDefaultDay = (date, childrenList = []) => ({
  date,
  angebote: [],
  observations: buildDefaultObservations(childrenList),
  absentChildIds: [],
  notes: '',
});

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

const ensureDaysContainer = (data) => {
  if (!data.days) {
    data.days = {};
  }
};

export const getChildrenList = () => {
  return getState().db?.children || [];
};

export const getPresets = (type) => {
  const presets = getState().db;
  if (!presets) {
    return [];
  }

  if (type === 'angebote') {
    return presets.angebote || [];
  }

  if (type === 'observations') {
    return presets.observationTemplates || [];
  }

  return [];
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

  updateAppData((data) => {
    ensureDaysContainer(data);
    const existing =
      data.days[ymd] || createDefaultDay(ymd, getChildrenList());
    const merged = { ...existing, ...payload };
    if (payload.observations) {
      merged.observations = mergeObservations(
        existing.observations,
        payload.observations,
      );
    }
    merged.date = ymd;
    data.days[ymd] = merged;
  });
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

export const addPreset = (type, value) => {
  const trimmed =
    type === 'observations'
      ? normalizeObservationText(value)
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
      data.angebote = ensureUniqueSortedStrings([
        ...(data.angebote || []),
        trimmed,
      ]);
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

  const childrenList = getState().db?.children || [];
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

    return;
  }

  const payload = obj;
  if (!isValidYmd(payload.date) || typeof payload.entry !== 'object') {
    return;
  }

  const sanitizedDay =
    sanitizeDaysByDate({ [payload.date]: payload.entry }, childrenList)[
      payload.date
    ] || createDefaultDay(payload.date, childrenList);

  updateEntry(payload.date, sanitizedDay);
};
