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
import { normalizeTopicEntries } from '../utils/topics.js';

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
        const tags = Array.isArray(item.tags) ? item.tags : [];
        const preset = typeof item.preset === 'string' ? item.preset.trim() : '';
        const list = preset && !tags.includes(preset) ? [...tags, preset] : tags;
        acc[item.child] = normalizeTopicEntries(list);
      }
      return acc;
    }, {});
  }

  if (typeof value === 'object') {
    return Object.entries(value).reduce((acc, [child, item]) => {
      acc[child] = normalizeTopicEntries(item);
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

  const preservedUi = getPreservedUiState(root);

  clearElement(root);

  const container = document.createElement('div');
  container.className = 'app';

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

  const header = buildHeader({ selectedDate });
  const selectedAngebote = Array.isArray(entry.angebote) ? entry.angebote : [];
  const angebotSection = buildAngebotSection({
    angebote: angebotePresets,
    selectedAngebote,
    newValue: preservedUi.angebotInputValue,
  });
  const observationsSection = buildObservationsSection({
    children: sortedChildren,
    observations,
    presets: observationPresets,
    observationStats,
    absentChildren,
  });

  if (!drawerShell) {
    drawerShell = buildDrawerShell();
  }

  const drawerContentRefs = renderDrawerContent(
    state,
    drawerShell.refs.body,
    angebotSection,
    preservedUi.drawerScrollTop,
  );

  const contentWrap = document.createElement('div');
  contentWrap.className = 'container d-flex flex-column gap-3';
  contentWrap.append(header.element, observationsSection.element);

  container.append(contentWrap, drawerShell.element);
  root.appendChild(container);

  bindDateEntry(header.refs.dateInput);
  bindImportExport({
    exportButton: drawerContentRefs?.exportButton,
    importButton: drawerContentRefs?.importButton,
    fileInput: drawerContentRefs?.importInput,
  });
  bindAngebot({
    comboInput: angebotSection.refs.comboInput,
    addButton: angebotSection.refs.addButton,
    selectedList: angebotSection.refs.selectedList,
    date: selectedDate,
  });
  bindObservations({
    list: observationsSection.refs.list,
    overlay: observationsSection.refs.overlay,
    overlayPanel: observationsSection.refs.overlayPanel,
    overlayContent: observationsSection.refs.overlayContent,
    overlayTitle: observationsSection.refs.overlayTitle,
    closeButton: observationsSection.refs.closeButton,
    templatesOverlay: observationsSection.refs.templatesOverlay,
    date: selectedDate,
  });

  bindDrawerSections(drawerContentRefs?.sections);
};
