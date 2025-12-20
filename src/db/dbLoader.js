import { OVERLAY_STORAGE_KEY } from '../config.js';
import {
  ensureUniqueSortedStrings,
  normalizeBaseDb,
  normalizeEffectiveDb,
  normalizeOverlay,
  safeDeepMerge,
} from './dbSchema.js';

export const loadBaseDb = async () => {
  const response = await fetch('/data/db.json', { cache: 'no-store' });
  const text = await response.text();
  const data = JSON.parse(text);
  return normalizeBaseDb(data);
};

export const loadOverlay = () => {
  if (typeof localStorage === 'undefined') {
    return null;
  }

  const raw = localStorage.getItem(OVERLAY_STORAGE_KEY);
  if (!raw) {
    return null;
  }

  try {
    return normalizeOverlay(JSON.parse(raw));
  } catch (error) {
    console.warn('Failed to parse overlay from localStorage.', error);
    return null;
  }
};

export const buildEffectiveDb = (base, overlay) => {
  const normalizedBase = normalizeBaseDb(base);
  const normalizedOverlay = normalizeOverlay(overlay);

  const mergedEntries = safeDeepMerge(
    normalizedBase.records.entriesByDate,
    normalizedOverlay?.records?.entriesByDate || {},
  );

  const angebote = ensureUniqueSortedStrings([
    ...normalizedBase.presetData.angebote,
    ...(normalizedOverlay?.presetOverrides?.angeboteAdded || []),
  ]);

  const observations = ensureUniqueSortedStrings([
    ...normalizedBase.presetData.observations,
    ...(normalizedOverlay?.presetOverrides?.observationsAdded || []),
  ]);

  const exportMode =
    normalizedOverlay?.ui?.exportMode || normalizedBase.settings.exportMode;

  const effective = {
    meta: normalizedBase.meta,
    presetData: {
      childrenList: normalizedBase.presetData.childrenList,
      angebote,
      observations,
    },
    records: {
      entriesByDate: mergedEntries,
    },
    settings: {
      exportMode,
    },
  };

  return normalizeEffectiveDb(effective);
};
