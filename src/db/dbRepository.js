import {
  ensureUniqueSortedStrings,
  normalizeBaseDb,
  safeDeepMerge,
  sanitizeEntriesByDate,
} from './dbSchema.js';
import { clearOverlay } from '../state/persistence.js';
import { getState, initStore, updateOverlay } from '../state/store.js';
import { ensureYmd, isValidYmd, todayYmd } from '../utils/date.js';

const normalizeTagList = (value) => {
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
    acc[child] = { tags: [], note: '' };
    return acc;
  }, {});
};

const createDefaultEntry = (date, childrenList = []) => ({
  date,
  angebote: [],
  observations: buildDefaultObservations(childrenList),
  absentChildren: [],
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
    const incoming =
      incomingValue && typeof incomingValue === 'object' ? incomingValue : {};
    const existing =
      base[child] && typeof base[child] === 'object' ? base[child] : {};
    const incomingTags = normalizeTagList(incoming.tags);
    const existingTags = normalizeTagList(existing.tags);
    const shouldReplaceTags = incoming.replaceTags === true;
    const tags = incoming.tags
      ? shouldReplaceTags
        ? incomingTags
        : normalizeTagList([...existingTags, ...incomingTags])
      : existingTags;
    const note =
      typeof incoming.note === 'string'
        ? incoming.note
        : typeof existing.note === 'string'
          ? existing.note
          : '';

    base[child] = { tags, note };
  });

  return base;
};

const ensureRecordsContainer = (overlay) => {
  if (!overlay.records) {
    overlay.records = { entriesByDate: {} };
  }

  if (!overlay.records.entriesByDate) {
    overlay.records.entriesByDate = {};
  }
};

const ensurePresetOverrides = (overlay) => {
  if (!overlay.presetOverrides) {
    overlay.presetOverrides = { angeboteAdded: [], observationsAdded: [] };
  }
};

export const getChildrenList = () => {
  return getState().db?.presetData?.childrenList || [];
};

export const getPresets = (type) => {
  const presets = getState().db?.presetData;
  if (!presets) {
    return [];
  }

  if (type === 'angebote') {
    return presets.angebote;
  }

  if (type === 'observations') {
    return presets.observations;
  }

  return [];
};

export const getEntry = (date) => {
  const ymd = ensureYmd(date, todayYmd());
  const entries = getState().db?.records?.entriesByDate || {};

  if (entries[ymd]) {
    return entries[ymd];
  }

  const childrenList = getChildrenList();
  const entry = createDefaultEntry(ymd, childrenList);
  updateOverlay((overlay) => {
    ensureRecordsContainer(overlay);
    overlay.records.entriesByDate[ymd] = entry;
  });

  return entry;
};

export const updateEntry = (date, patch) => {
  const ymd = ensureYmd(date, todayYmd());
  const payload = patch && typeof patch === 'object' ? patch : {};

  updateOverlay((overlay) => {
    ensureRecordsContainer(overlay);
    const existing =
      overlay.records.entriesByDate[ymd] ||
      createDefaultEntry(ymd, getChildrenList());
    const merged = safeDeepMerge(existing, payload);
    if (payload.observations) {
      merged.observations = mergeObservations(
        existing.observations,
        payload.observations,
      );
    }
    merged.date = ymd;
    overlay.records.entriesByDate[ymd] = merged;
  });
};

export const addPreset = (type, value) => {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  if (!trimmed) {
    return;
  }

  const presets = getPresets(type);
  if (presets.includes(trimmed)) {
    return;
  }

  updateOverlay((overlay) => {
    ensurePresetOverrides(overlay);
    const key =
      type === 'angebote' ? 'angeboteAdded' : 'observationsAdded';
    const current = Array.isArray(overlay.presetOverrides[key])
      ? overlay.presetOverrides[key]
      : [];

    if (!current.includes(trimmed)) {
      current.push(trimmed);
    }

    overlay.presetOverrides[key] = current;
  });
};

export const clearDay = (date) => {
  const ymd = ensureYmd(date, todayYmd());

  updateOverlay((overlay) => {
    ensureRecordsContainer(overlay);
    delete overlay.records.entriesByDate[ymd];
  });
};

export const resetOverlay = async () => {
  clearOverlay();
  await initStore();
};

export const exportJson = (mode) => {
  const { db, ui } = getState();
  const exportMode = mode === 'all' ? 'all' : 'day';

  if (!db) {
    return { filename: 'freilog.json', jsonString: '{}' };
  }

  if (exportMode === 'all') {
    return {
      filename: `freilog-${todayYmd()}-all.json`,
      jsonString: JSON.stringify(db, null, 2),
    };
  }

  const date = ensureYmd(ui.selectedDate, todayYmd());
  const entry =
    db.records.entriesByDate[date] ||
    createDefaultEntry(date, getChildrenList());
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

  const childrenList = getState().db?.presetData?.childrenList || [];
  const isFullDb =
    obj.meta &&
    typeof obj.meta.schemaVersion === 'number' &&
    obj.presetData;

  if (isFullDb) {
    const normalized = normalizeBaseDb(obj);
    const sanitizedEntries = sanitizeEntriesByDate(
      normalized.records.entriesByDate,
      childrenList,
    );

    updateOverlay((overlay) => {
      ensureRecordsContainer(overlay);
      ensurePresetOverrides(overlay);
      overlay.records.entriesByDate = safeDeepMerge(
        overlay.records.entriesByDate,
        sanitizedEntries,
      );
      overlay.presetOverrides.angeboteAdded = ensureUniqueSortedStrings([
        ...(overlay.presetOverrides.angeboteAdded || []),
        ...normalized.presetData.angebote,
      ]);
      overlay.presetOverrides.observationsAdded = ensureUniqueSortedStrings([
        ...(overlay.presetOverrides.observationsAdded || []),
        ...normalized.presetData.observations,
      ]);
    });

    return;
  }

  const payload = obj;
  if (!isValidYmd(payload.date) || typeof payload.entry !== 'object') {
    return;
  }

  const sanitizedEntry =
    sanitizeEntriesByDate({ [payload.date]: payload.entry }, childrenList)[
      payload.date
    ] || createDefaultEntry(payload.date, childrenList);

  updateEntry(payload.date, sanitizedEntry);
};
