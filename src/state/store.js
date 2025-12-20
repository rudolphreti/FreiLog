import { DEFAULT_DRAWER_SECTIONS, DEFAULT_EXPORT_MODE } from '../config.js';
import {
  buildEffectiveDb,
  loadBaseDb,
  loadOverlay as loadOverlayFromDb,
} from '../db/dbLoader.js';
import { normalizeOverlay, sanitizeEntriesByDate } from '../db/dbSchema.js';
import { saveOverlay } from './persistence.js';

let baseDb = null;
let overlay = null;
let effectiveDb = null;
const subscribers = new Set();

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
  if (overlay?.records?.entriesByDate) {
    const childrenList = baseDb?.presetData?.childrenList || [];
    const sanitized = sanitizeEntriesByDate(
      overlay.records.entriesByDate,
      childrenList,
    );
    const original = JSON.stringify(overlay.records.entriesByDate);
    const updated = JSON.stringify(sanitized);
    if (original !== updated) {
      overlay.records.entriesByDate = sanitized;
      saveOverlay(overlay);
    }
  }
  effectiveDb = buildEffectiveDb(baseDb, overlay);
  notify();
};

export const getState = () => {
  const selectedDate = overlay?.ui?.selectedDate || '';
  const exportMode =
    overlay?.ui?.exportMode ||
    effectiveDb?.settings?.exportMode ||
    DEFAULT_EXPORT_MODE;
  const drawer = overlay?.ui?.drawer || {};
  const drawerSections = drawer.sections || DEFAULT_DRAWER_SECTIONS;
  const observationsFilter =
    typeof overlay?.ui?.observationsFilter === 'string' &&
    overlay.ui.observationsFilter.trim()
      ? overlay.ui.observationsFilter
      : 'ALL';

  return {
    db: effectiveDb,
    ui: {
      selectedDate,
      exportMode,
      observationsFilter,
      drawer: {
        open: Boolean(drawer.open),
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

export const setDrawerSectionState = (sectionId, isOpen) => {
  updateOverlay((draft) => {
    if (!draft.ui.drawer) {
      draft.ui.drawer = { open: false, sections: { ...DEFAULT_DRAWER_SECTIONS } };
    }
    if (!draft.ui.drawer.sections) {
      draft.ui.drawer.sections = { ...DEFAULT_DRAWER_SECTIONS };
    }
    draft.ui.drawer.sections[sectionId] = Boolean(isOpen);
  });
};

export const setObservationsFilter = (value) => {
  updateOverlay((draft) => {
    if (!draft.ui) {
      draft.ui = {
        selectedDate: '',
        exportMode: '',
        observationsFilter: 'ALL',
        drawer: { open: false, sections: { ...DEFAULT_DRAWER_SECTIONS } },
      };
    }
    const next =
      typeof value === 'string' && value.trim()
        ? value.trim().toLocaleUpperCase()
        : 'ALL';
    draft.ui.observationsFilter = next;
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
