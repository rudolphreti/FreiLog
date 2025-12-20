import { DEFAULT_EXPORT_MODE } from '../config.js';
import {
  buildEffectiveDb,
  loadBaseDb,
  loadOverlay as loadOverlayFromDb,
} from '../db/dbLoader.js';
import { normalizeOverlay } from '../db/dbSchema.js';
import { saveOverlay } from './persistence.js';

let baseDb = null;
let overlay = null;
let effectiveDb = null;
const subscribers = new Set();

const createEmptyOverlay = () => ({
  meta: { savedAt: new Date().toISOString() },
  records: { entriesByDate: {} },
  presetOverrides: { angeboteAdded: [], observationsAdded: [] },
  ui: { selectedDate: '', exportMode: '' },
});

const ensureOverlay = () => {
  if (!overlay) {
    overlay = createEmptyOverlay();
  }
  return overlay;
};

export const subscribe = (fn) => {
  if (typeof fn !== 'function') {
    return () => {};
  }

  subscribers.add(fn);
  return () => {
    subscribers.delete(fn);
  };
};

export const notify = () => {
  const state = getState();
  subscribers.forEach((fn) => fn(state));
};

export const initStore = async () => {
  baseDb = await loadBaseDb();
  overlay = loadOverlayFromDb();
  effectiveDb = buildEffectiveDb(baseDb, overlay);
  notify();
};

export const getState = () => {
  const selectedDate = overlay?.ui?.selectedDate || '';
  const exportMode =
    overlay?.ui?.exportMode ||
    effectiveDb?.settings?.exportMode ||
    DEFAULT_EXPORT_MODE;

  return {
    db: effectiveDb,
    ui: {
      selectedDate,
      exportMode,
    },
  };
};

export const setSelectedDate = (date) => {
  updateOverlay((draft) => {
    draft.ui.selectedDate = date;
  });
};

export const setExportMode = (mode) => {
  updateOverlay((draft) => {
    draft.ui.exportMode = mode;
  });
};

export const updateOverlay = (mutatorFn) => {
  const working = ensureOverlay();

  if (typeof mutatorFn === 'function') {
    mutatorFn(working);
  }

  overlay = normalizeOverlay(working) || createEmptyOverlay();
  saveOverlay(overlay);

  if (baseDb) {
    effectiveDb = buildEffectiveDb(baseDb, overlay);
  }

  notify();
};
