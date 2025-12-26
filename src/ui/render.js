import { todayYmd } from '../utils/date.js';
import { clearElement } from './dom.js';
import {
  buildHeader,
  buildDrawerShell,
  buildDrawerContent,
  buildAngebotSection,
  buildObservationsSection,
} from './components.js';
import { bindDateEntry } from '../features/dateEntry.js';
import { bindAngebot } from '../features/angebot.js';
import { bindObservations } from '../features/observations.js';
import { bindImportExport } from '../features/importExport.js';
import { bindDrawerSections } from '../features/drawerSections.js';
import { createWeeklyTableView } from '../features/weeklyTable.js';
import { createClassSettingsView } from '../features/classSettings.js';

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

const renderDrawerContent = (
  state,
  drawerBody,
  angebotSection,
  preservedScrollTop,
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

  const absentChildren = getAbsentChildren(entry);
  const observations = normalizeObservations(entry.observations);
  const angebotePresets = db.angebote || [];
  const observationPresets = db.observationTemplates || [];
  const observationStats = db.observationStats || {};
  const observationCatalog = db.observationCatalog || [];
  const observationGroups = db.observationGroups || {};
  const savedObsFilters = state?.ui?.overlay?.savedObsFilters;
  const weeklyDays = db.days || {};

  const preservedUi = getPreservedUiState(root);

  const header = buildHeader({ selectedDate });
  const selectedAngebote = Array.isArray(entry.angebote) ? entry.angebote : [];
  const angebotSection = buildAngebotSection({
    angebote: angebotePresets,
    selectedAngebote,
    newValue: preservedUi.angebotInputValue,
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
    });
  if (!weeklyTableViewBinding) {
    weeklyTableViewBinding = createWeeklyTableView({
      days: weeklyDays,
      children: sortedChildren,
      observationCatalog,
      observationGroups,
    });
  } else {
    weeklyTableViewBinding.update({
      days: weeklyDays,
      children: sortedChildren,
      observationCatalog,
      observationGroups,
    });
  }
  if (!classSettingsView) {
    classSettingsView = createClassSettingsView({
      children: sortedChildren,
    });
  } else {
    classSettingsView.update({
      children: sortedChildren,
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
    );
    root.appendChild(container);

    bindDateEntry(header.refs.dateInput);
    const actions = drawerContentRefs?.actions;
    bindImportExport({
      exportButton: header.refs.exportButton,
    });
    bindImportExport({
      exportButton: actions?.exportButton,
      importButton: actions?.importButton,
      fileInput: actions?.importInput,
    });
    if (weeklyTableViewBinding && actions?.weeklyTableButton) {
      actions.weeklyTableButton.addEventListener('click', () => {
        weeklyTableViewBinding.open();
      });
    }
    const settingsActions = drawerContentRefs?.settings;
    if (classSettingsView && settingsActions?.classSettingsButton) {
      settingsActions.classSettingsButton.addEventListener('click', () => {
        classSettingsView.open();
      });
    }
    bindAngebot({
      comboInput: angebotSection.refs.comboInput,
      addButton: angebotSection.refs.addButton,
      selectedList: angebotSection.refs.selectedList,
      date: selectedDate,
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
  });

  if (observationsBinding?.updateDate) {
    observationsBinding.updateDate(selectedDate);
  }

  const actions = drawerContentRefs?.actions;
  bindImportExport({
    exportButton: header.refs.exportButton,
  });
  bindImportExport({
    exportButton: actions?.exportButton,
    importButton: actions?.importButton,
    fileInput: actions?.importInput,
  });
  if (weeklyTableViewBinding && actions?.weeklyTableButton) {
    actions.weeklyTableButton.addEventListener('click', () => {
      weeklyTableViewBinding.open();
    });
  }
  const settingsActions = drawerContentRefs?.settings;
  if (classSettingsView && settingsActions?.classSettingsButton) {
    settingsActions.classSettingsButton.addEventListener('click', () => {
      classSettingsView.open();
    });
  }

  appShell.angebotEl = angebotSection.element;
  bindAngebot({
    comboInput: angebotSection.refs.comboInput,
    addButton: angebotSection.refs.addButton,
    selectedList: angebotSection.refs.selectedList,
    date: selectedDate,
  });
  bindDrawerSections(drawerContentRefs?.sections);
};
