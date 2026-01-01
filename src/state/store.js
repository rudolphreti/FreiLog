import { DEFAULT_DRAWER_SECTIONS, DEFAULT_EXPORT_MODE } from '../config.js';
import {
  DEFAULT_SAVED_ANGEBOT_FILTERS,
  DEFAULT_SAVED_OBSERVATION_FILTERS,
  normalizeAppData,
  normalizeSavedAngebotFilters,
  normalizeSavedObservationFilters,
} from '../db/dbSchema.js';
import { loadAppData, saveAppData } from './persistence.js';
import { ensureYmd, todayYmd } from '../utils/date.js';

let appData = null;
const subscribers = new Set();

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
  appData = await loadAppData();
  notify();
};

export const getState = () => {
  const selectedDate = appData?.ui?.selectedDate || '';
  const exportMode =
    appData?.ui?.exportMode ||
    appData?.settings?.exportMode ||
    DEFAULT_EXPORT_MODE;
  const drawer = appData?.ui?.drawer || {};
  const drawerSections = drawer.sections || DEFAULT_DRAWER_SECTIONS;
  const observationsFilter =
    typeof appData?.ui?.observationsFilter === 'string' &&
    appData.ui.observationsFilter.trim()
      ? appData.ui.observationsFilter
      : 'ALL';
  const savedObsFilters = appData?.ui?.overlay?.savedObsFilters
    ? normalizeSavedObservationFilters(appData.ui.overlay.savedObsFilters)
    : { ...DEFAULT_SAVED_OBSERVATION_FILTERS };
  const savedAngebotFilters = appData?.ui?.overlay?.savedAngebotFilters
    ? normalizeSavedAngebotFilters(appData.ui.overlay.savedAngebotFilters)
    : { ...DEFAULT_SAVED_ANGEBOT_FILTERS };

  return {
    db: appData,
    ui: {
      selectedDate,
      exportMode,
      observationsFilter,
      overlay: {
        savedAngebotFilters,
        savedObsFilters,
      },
      drawer: {
        open: Boolean(drawer.open),
        sections: {
          actions:
            typeof drawerSections.actions === 'boolean'
              ? drawerSections.actions
              : DEFAULT_DRAWER_SECTIONS.actions,
          angebote:
            typeof drawerSections.angebote === 'boolean'
              ? drawerSections.angebote
              : DEFAULT_DRAWER_SECTIONS.angebote,
          einstellungen:
            typeof drawerSections.einstellungen === 'boolean'
              ? drawerSections.einstellungen
              : DEFAULT_DRAWER_SECTIONS.einstellungen,
        },
      },
    },
  };
};

export const setSelectedDate = (date) => {
  const normalized = ensureYmd(date, todayYmd());
  updateAppData((draft) => {
    draft.ui.selectedDate = normalized;
  });
};

export const setExportMode = (mode) => {
  updateAppData((draft) => {
    draft.ui.exportMode = mode;
  });
};

const ensureUiDraft = (draft) => {
  if (!draft.ui) {
    draft.ui = {
      selectedDate: '',
      exportMode: '',
      observationsFilter: 'ALL',
      overlay: { savedObsFilters: { ...DEFAULT_SAVED_OBSERVATION_FILTERS } },
      drawer: { open: false, sections: { ...DEFAULT_DRAWER_SECTIONS } },
    };
  }

  if (!draft.ui.drawer) {
    draft.ui.drawer = { open: false, sections: { ...DEFAULT_DRAWER_SECTIONS } };
  }

  if (!draft.ui.drawer.sections) {
    draft.ui.drawer.sections = { ...DEFAULT_DRAWER_SECTIONS };
  }

  if (!draft.ui.overlay) {
    draft.ui.overlay = {
      savedObsFilters: { ...DEFAULT_SAVED_OBSERVATION_FILTERS },
      savedAngebotFilters: { ...DEFAULT_SAVED_ANGEBOT_FILTERS },
    };
  }

  if (!draft.ui.overlay.savedObsFilters) {
    draft.ui.overlay.savedObsFilters = { ...DEFAULT_SAVED_OBSERVATION_FILTERS };
  }

  if (!draft.ui.overlay.savedAngebotFilters) {
    draft.ui.overlay.savedAngebotFilters = { ...DEFAULT_SAVED_ANGEBOT_FILTERS };
  }
};

export const setDrawerSectionState = (sectionId, isOpen) => {
  updateAppData((draft) => {
    ensureUiDraft(draft);
    draft.ui.drawer.sections[sectionId] = Boolean(isOpen);
  });
};

export const setObservationsFilter = (value) => {
  updateAppData((draft) => {
    ensureUiDraft(draft);
    const next =
      typeof value === 'string' && value.trim()
        ? value.trim().toLocaleUpperCase()
        : 'ALL';
    draft.ui.observationsFilter = next;
  });
};

export const setSavedObservationFilters = (value) => {
  updateAppData((draft) => {
    ensureUiDraft(draft);
    const current = draft.ui.overlay.savedObsFilters || DEFAULT_SAVED_OBSERVATION_FILTERS;
    const merged = normalizeSavedObservationFilters({ ...current, ...(value || {}) });
    draft.ui.overlay.savedObsFilters = merged;
  });
};

export const setSavedAngebotFilters = (value) => {
  updateAppData((draft) => {
    ensureUiDraft(draft);
    const current =
      draft.ui.overlay.savedAngebotFilters || DEFAULT_SAVED_ANGEBOT_FILTERS;
    const merged = normalizeSavedAngebotFilters({ ...current, ...(value || {}) });
    draft.ui.overlay.savedAngebotFilters = merged;
  });
};

export const updateAppData = (mutatorFn) => {
  const working = appData ? { ...appData } : null;

  if (!working) {
    return;
  }

  if (typeof mutatorFn === 'function') {
    mutatorFn(working);
  }

  appData = normalizeAppData(working, appData);
  saveAppData(appData);

  notify();
};
