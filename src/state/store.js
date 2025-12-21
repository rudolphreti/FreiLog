import { DEFAULT_DRAWER_SECTIONS, DEFAULT_EXPORT_MODE } from '../config.js';
import { normalizeAppData } from '../db/dbSchema.js';
import { loadAppData, saveAppData } from './persistence.js';

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

  return {
    db: appData,
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
  updateAppData((draft) => {
    draft.ui.selectedDate = date;
  });
};

export const setExportMode = (mode) => {
  updateAppData((draft) => {
    draft.ui.exportMode = mode;
  });
};

export const setDrawerSectionState = (sectionId, isOpen) => {
  updateAppData((draft) => {
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
  updateAppData((draft) => {
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
