import { todayYmd } from '../utils/date.js';
import { getFreeDayInfo, isFreeDay } from '../utils/freeDays.js';
import { clearElement } from './dom.js';
import {
  buildHeader,
  buildDrawerShell,
  buildDrawerContent,
  buildAngebotSection,
  buildAngebotOverlay,
  buildAngebotCatalogOverlay,
  buildAngebotCreateOverlay,
  buildAngebotEditOverlay,
  buildObservationsSection,
} from './components.js';
import { bindDateEntry } from '../features/dateEntry.js';
import { bindAngebot } from '../features/angebot.js';
import { bindAngebotCatalog } from '../features/angebotCatalog.js';
import { bindObservations } from '../features/observations.js';
import { bindImportExport } from '../features/importExport.js';
import { bindDrawerSections } from '../features/drawerSections.js';
import { createWeeklyTableView } from '../features/weeklyTable.js';
import { createClassSettingsView } from '../features/classSettings.js';
import { createFreeDaysSettingsView } from '../features/freeDaysSettings.js';
import { bindDummyDataLoader } from '../features/dummyData.js';
import { createTimetableSettingsView } from '../features/timetableSettings.js';

const createFallbackEntry = (date) => ({
  date,
  angebote: [],
  observations: {},
  absentChildIds: [],
  notes: '',
});

const normalizeObservations = (value) => {
  if (!value) {
    return {};
  }

  if (Array.isArray(value)) {
    return value.reduce((acc, item) => {
      if (item && item.child) {
        const preset = item.preset || '';
        const tags = Array.isArray(item.tags) ? item.tags : [];
        if (preset && !tags.includes(preset)) {
          tags.push(preset);
        }
        acc[item.child] = tags;
      }
      return acc;
    }, {});
  }

  if (typeof value === 'object') {
    return Object.entries(value).reduce((acc, [child, item]) => {
      if (Array.isArray(item)) {
        acc[child] = item;
        return acc;
      }
      if (typeof item === 'string') {
        acc[child] = [item];
        return acc;
      }
      const entry = item && typeof item === 'object' ? item : {};
      const preset = typeof entry.preset === 'string' ? entry.preset.trim() : '';
      const tags = Array.isArray(entry.tags) ? [...entry.tags] : [];
      if (preset && !tags.includes(preset)) {
        tags.push(preset);
      }
      acc[child] = tags;
      return acc;
    }, {});
  }

  return {};
};

const getPreservedUiState = (root) => ({
  angebotInputValue: root.querySelector('[data-role="angebot-input"]')?.value || '',
  drawerScrollTop: root.querySelector('[data-drawer-scroll]')?.scrollTop,
});

const getSelectedDate = (state) => state?.ui?.selectedDate || todayYmd();

const getEntryForDate = (db, selectedDate) =>
  db.days?.[selectedDate] || createFallbackEntry(selectedDate);

const getSortedChildren = (children) =>
  [...children].sort((a, b) => a.localeCompare(b, 'de'));

const getAbsentChildren = (entry) =>
  Array.isArray(entry.absentChildIds) ? entry.absentChildIds : [];

let drawerShell = null;
let appShell = null;
let observationsBinding = null;
let weeklyTableViewBinding = null;
let classSettingsView = null;
let freeDaysSettingsView = null;
let angebotBinding = null;
let timetableSettingsView = null;
let angebotOverlayView = null;
let angebotCatalogView = null;
let angebotCatalogBinding = null;
let angebotCreateOverlay = null;
let angebotEditOverlay = null;

const closeDrawer = () => {
  const closeButton = drawerShell?.refs?.closeButton;
  if (closeButton) {
    closeButton.click();
    return;
  }
  const drawerEl = document.getElementById('mainDrawer');
  if (!drawerEl) {
    return;
  }
  drawerEl.classList.remove('show');
  drawerEl.setAttribute('aria-hidden', 'true');
};

const renderDrawerContent = (
  state,
  drawerBody,
  angebotSection,
  preservedScrollTop,
  options = {},
) => {
  if (!drawerBody) {
    return null;
  }

  const scrollTop =
    typeof preservedScrollTop === 'number' ? preservedScrollTop : drawerBody.scrollTop;
  const drawerSections = state?.ui?.drawer?.sections || {};
  const content = buildDrawerContent({
    drawerSections,
    angebotSection: angebotSection?.element,
    ...options,
  });

  drawerBody.replaceChildren(...content.nodes);

  requestAnimationFrame(() => {
    drawerBody.scrollTop = scrollTop;
  });

  return content.refs;
};

export const renderApp = (root, state) => {
  if (!root) {
    return;
  }

  const selectedDate = getSelectedDate(state);
  const db = state?.db || {};
  const entry = getEntryForDate(db, selectedDate);
  const children = db.children || [];
  const sortedChildren = getSortedChildren(children);
  const classProfile = db.classProfile || {};
  const freeDays = db.settings?.freeDays || [];
  const freeDayInfo = getFreeDayInfo(selectedDate, freeDays);
  const isReadOnlyDay = isFreeDay(selectedDate, freeDays);

  const absentChildren = getAbsentChildren(entry);
  const observations = normalizeObservations(entry.observations);
  const angebotePresets = db.angebote || [];
  const observationPresets = db.observationTemplates || [];
  const angebotCatalog = db.angebotCatalog || [];
  const angebotStats = db.angebotStats || {};
  const observationStats = db.observationStats || {};
  const observationCatalog = db.observationCatalog || [];
  const observationGroups = db.observationGroups || {};
  const angebotGroups = Object.fromEntries(
    Object.entries(observationGroups || {}).filter(([code]) => code !== 'SCHWARZ'),
  );
  const timetableSubjects = db.timetableSubjects || [];
  const timetableLessons = db.timetableLessons || [];
  const timetableSchedule = db.timetableSchedule || {};
  const timetableSubjectColors = db.timetableSubjectColors || {};
  const savedAngebotFilters = state?.ui?.overlay?.savedAngebotFilters;
  const savedObsFilters = state?.ui?.overlay?.savedObsFilters;
  const weeklyDays = db.days || {};
  const hasData =
    sortedChildren.length > 0 ||
    Object.keys(weeklyDays || {}).length > 0;

  const preservedUi = getPreservedUiState(root);

  const header = buildHeader({ selectedDate, showInitialActions: !hasData, freeDayInfo });
  const selectedAngebote = Array.isArray(entry.angebote) ? entry.angebote : [];
  const angebotSection = buildAngebotSection({
    angebote: angebotePresets,
    selectedAngebote,
    newValue: preservedUi.angebotInputValue,
    readOnly: isReadOnlyDay,
  });
  const observationsSection = appShell?.observationsView
    ? appShell.observationsView
    : buildObservationsSection({
        children: sortedChildren,
        observations,
        presets: observationPresets,
        observationStats,
        absentChildren,
        observationCatalog,
        observationGroups,
        savedObsFilters,
        readOnly: isReadOnlyDay,
        freeDayInfo,
    });
  if (!angebotOverlayView) {
    angebotOverlayView = buildAngebotOverlay({ angebotGroups });
  }
  if (!angebotCatalogView) {
    angebotCatalogView = buildAngebotCatalogOverlay({
      angebotGroups,
      savedFilters: savedAngebotFilters,
    });
  }
  if (!angebotCreateOverlay) {
    angebotCreateOverlay = buildAngebotCreateOverlay({ angebotGroups });
  }
  if (!angebotEditOverlay) {
    angebotEditOverlay = buildAngebotEditOverlay({ angebotGroups });
  }
  if (!weeklyTableViewBinding) {
    weeklyTableViewBinding = createWeeklyTableView({
      days: weeklyDays,
      children: sortedChildren,
      observationCatalog,
      observationGroups,
      freeDays,
    });
  } else {
    weeklyTableViewBinding.update({
      days: weeklyDays,
      children: sortedChildren,
      observationCatalog,
      observationGroups,
      freeDays,
    });
  }

  if (!classSettingsView) {
    classSettingsView = createClassSettingsView({
      profile: classProfile,
      children: sortedChildren,
    });
  } else {
    classSettingsView.update({
      profile: classProfile,
      children: sortedChildren,
    });
  }

  if (!freeDaysSettingsView) {
    freeDaysSettingsView = createFreeDaysSettingsView({
      freeDays,
    });
  } else {
    freeDaysSettingsView.update({ freeDays });
  }

  if (!timetableSettingsView) {
    timetableSettingsView = createTimetableSettingsView({
      subjects: timetableSubjects,
      lessons: timetableLessons,
      schedule: timetableSchedule,
      subjectColors: timetableSubjectColors,
    });
  } else {
    timetableSettingsView.update({
      subjects: timetableSubjects,
      lessons: timetableLessons,
      schedule: timetableSchedule,
      subjectColors: timetableSubjectColors,
    });
  }

  if (!drawerShell) {
    drawerShell = buildDrawerShell();
  }

  const drawerContentRefs = renderDrawerContent(
    state,
    drawerShell.refs.body,
    angebotSection,
    preservedUi.drawerScrollTop,
    {
      showExport: hasData,
      showDummy: !hasData,
      showWeekly: hasData,
    },
  );

  if (!appShell) {
    clearElement(root);
    const container = document.createElement('div');
    container.className = 'app';
    const contentWrap = document.createElement('div');
    contentWrap.className = 'container d-flex flex-column gap-3';
    contentWrap.append(header.element, observationsSection.element);

    container.append(
      contentWrap,
      drawerShell.element,
      weeklyTableViewBinding.element,
      classSettingsView.element,
      freeDaysSettingsView.element,
      timetableSettingsView.element,
      angebotOverlayView.element,
      angebotCatalogView.element,
      angebotCreateOverlay.element,
      angebotEditOverlay.element,
    );
    root.appendChild(container);

    bindDateEntry(header.refs.dateInput);
    const actions = drawerContentRefs?.actions;
    bindImportExport({
      exportButton: header.refs.exportButton,
      importButton: header.refs.importButton,
      fileInput: header.refs.importInput,
    });
    bindImportExport({
      exportButton: actions?.exportButton,
      importButton: actions?.importButton,
      fileInput: actions?.importInput,
    });
    const settingsActions = drawerContentRefs?.settings;
    bindDummyDataLoader({
      button: actions?.dummyDataButton,
      onLoaded: closeDrawer,
    });
    bindDummyDataLoader({
      button: header.refs.dummyDataButton,
      onLoaded: closeDrawer,
    });
    if (weeklyTableViewBinding && actions?.weeklyTableButton) {
      actions.weeklyTableButton.addEventListener('click', () => {
        weeklyTableViewBinding.open();
      });
    }
    if (classSettingsView && settingsActions?.classButton) {
      settingsActions.classButton.addEventListener('click', () => {
        closeDrawer();
        classSettingsView.open();
      });
    }
    if (freeDaysSettingsView && settingsActions?.freeDaysButton) {
      settingsActions.freeDaysButton.addEventListener('click', () => {
        closeDrawer();
        freeDaysSettingsView.open();
      });
    }
    if (timetableSettingsView && settingsActions?.timetableButton) {
      settingsActions.timetableButton.addEventListener('click', () => {
        closeDrawer();
        timetableSettingsView.open();
      });
    }
    angebotBinding = bindAngebot({
      selectedList: angebotSection.refs.selectedList,
      date: selectedDate,
      readOnly: isReadOnlyDay,
    });
    angebotCatalogBinding = bindAngebotCatalog({
      openButton: angebotSection.refs.openButton,
      overlay: angebotOverlayView.element,
      catalogOverlay: angebotCatalogView.element,
      createOverlay: angebotCreateOverlay.element,
      editOverlay: angebotEditOverlay.element,
      date: selectedDate,
      angebotGroups,
      selectedAngebote,
      catalog: angebotCatalog,
      topStats: angebotStats,
      savedFilters: savedAngebotFilters,
      readOnly: isReadOnlyDay,
    });
    observationsBinding = bindObservations({
      list: observationsSection.refs.list,
      overlay: observationsSection.refs.overlay,
      overlayPanel: observationsSection.refs.overlayPanel,
      overlayContent: observationsSection.refs.overlayContent,
      overlayTitle: observationsSection.refs.overlayTitle,
      closeButton: observationsSection.refs.closeButton,
      templatesOverlay: observationsSection.refs.templatesOverlay,
      editOverlay: observationsSection.refs.editOverlay,
      createOverlay: observationsSection.refs.createOverlay,
      date: selectedDate,
      observationGroups,
      savedFilters: savedObsFilters,
      readOnly: isReadOnlyDay,
    });

    bindDrawerSections(drawerContentRefs?.sections);

    appShell = {
      container,
      contentWrap,
      headerEl: header.element,
      angebotEl: angebotSection.element,
      observationsView: observationsSection,
    };
    return;
  }

  appShell.headerEl.replaceWith(header.element);
  appShell.headerEl = header.element;
  bindDateEntry(header.refs.dateInput);

  appShell.contentWrap.replaceChildren(appShell.headerEl, appShell.observationsView.element);

  appShell.observationsView.update({
    nextChildren: sortedChildren,
    nextObservations: observations,
    nextObservationStats: observationStats,
    nextAbsentChildren: absentChildren,
    nextObservationCatalog: observationCatalog,
    nextObservationGroups: observationGroups,
    nextObservationPresets: observationPresets,
    nextSavedObsFilters: savedObsFilters,
    readOnly: isReadOnlyDay,
    freeDayInfo,
  });

  if (observationsBinding?.updateDate) {
    observationsBinding.updateDate(selectedDate);
  }
  if (observationsBinding?.updateReadOnly) {
    observationsBinding.updateReadOnly(isReadOnlyDay);
  }

  if (angebotCatalogBinding) {
    angebotCatalogBinding.update({
      date: selectedDate,
      selectedAngebote,
      catalog: angebotCatalog,
      topStats: angebotStats,
      angebotGroups,
      savedFilters: savedAngebotFilters,
      readOnly: isReadOnlyDay,
      openButton: angebotSection.refs.openButton,
    });
  }

  const actions = drawerContentRefs?.actions;
  bindImportExport({
    exportButton: header.refs.exportButton,
    importButton: header.refs.importButton,
    fileInput: header.refs.importInput,
  });
  bindImportExport({
    exportButton: actions?.exportButton,
    importButton: actions?.importButton,
    fileInput: actions?.importInput,
  });
  const settingsActions = drawerContentRefs?.settings;
  bindDummyDataLoader({
    button: actions?.dummyDataButton,
    onLoaded: closeDrawer,
  });
  bindDummyDataLoader({
    button: header.refs.dummyDataButton,
    onLoaded: closeDrawer,
  });
  if (weeklyTableViewBinding && actions?.weeklyTableButton) {
    actions.weeklyTableButton.addEventListener('click', () => {
      weeklyTableViewBinding.open();
    });
  }
  if (classSettingsView && settingsActions?.classButton) {
    settingsActions.classButton.addEventListener('click', () => {
      closeDrawer();
      classSettingsView.open();
    });
  }
  if (freeDaysSettingsView && settingsActions?.freeDaysButton) {
    settingsActions.freeDaysButton.addEventListener('click', () => {
      closeDrawer();
      freeDaysSettingsView.open();
    });
  }
  if (timetableSettingsView && settingsActions?.timetableButton) {
    settingsActions.timetableButton.addEventListener('click', () => {
      closeDrawer();
      timetableSettingsView.open();
    });
  }

  appShell.angebotEl = angebotSection.element;
  angebotBinding = bindAngebot({
    selectedList: angebotSection.refs.selectedList,
    date: selectedDate,
    readOnly: isReadOnlyDay,
  });
  bindDrawerSections(drawerContentRefs?.sections);
};
