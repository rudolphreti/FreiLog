import { DEFAULT_DRAWER_SECTIONS, OVERLAY_STORAGE_KEY } from '../config.js';
import { normalizeOverlay } from '../db/dbSchema.js';

const createEmptyOverlay = () => ({
  meta: { savedAt: new Date().toISOString() },
  records: { entriesByDate: {} },
  presetOverrides: { angeboteAdded: [], observationsAdded: [] },
  ui: {
    selectedDate: '',
    exportMode: '',
    observationsFilter: 'ALL',
    drawer: {
      open: false,
      sections: { ...DEFAULT_DRAWER_SECTIONS },
    },
  },
});

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

export const saveOverlay = (overlay) => {
  if (typeof localStorage === 'undefined') {
    return;
  }

  const normalized = normalizeOverlay(overlay) || createEmptyOverlay();
  normalized.meta.savedAt = new Date().toISOString();
  localStorage.setItem(OVERLAY_STORAGE_KEY, JSON.stringify(normalized));
};

export const clearOverlay = () => {
  if (typeof localStorage === 'undefined') {
    return;
  }

  localStorage.removeItem(OVERLAY_STORAGE_KEY);
};
