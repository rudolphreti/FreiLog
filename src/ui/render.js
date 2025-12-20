import { todayYmd } from '../utils/date.js';
import { clearElement } from './dom.js';
import {
  buildHeader,
  buildDrawerShell,
  buildDrawerContent,
  buildAbsentChildrenSection,
  buildAngebotSection,
  buildObservationsSection,
} from './components.js';
import { bindDateEntry } from '../features/dateEntry.js';
import { bindAbsentChildren } from '../features/absentChildren.js';
import { bindAngebot } from '../features/angebot.js';
import {
  applyInitialFilter,
  bindObservations,
  getInitialLetters,
} from '../features/observations.js';
import { bindImportExport } from '../features/importExport.js';
import { setDrawerSectionState, setObservationsFilter } from '../state/store.js';

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
        acc[item.child] = {
          tags,
          note: item.note || '',
        };
      }
      return acc;
    }, {});
  }

  if (typeof value === 'object') {
    return Object.entries(value).reduce((acc, [child, item]) => {
      const entry = item && typeof item === 'object' ? item : {};
      const preset = typeof entry.preset === 'string' ? entry.preset.trim() : '';
      const tags = Array.isArray(entry.tags) ? [...entry.tags] : [];
      if (preset && !tags.includes(preset)) {
        tags.push(preset);
      }
      acc[child] = {
        tags,
        note: typeof entry.note === 'string' ? entry.note : '',
      };
      return acc;
    }, {});
  }

  return {};
};

let drawerShell = null;

const renderDrawerContent = (state, drawerBody, attendanceSection, angebotSection) => {
  if (!drawerBody) {
    return null;
  }

  const scrollTop = drawerBody.scrollTop;
  const drawerSections = state?.ui?.drawer?.sections || {};
  const content = buildDrawerContent({
    drawerSections,
    attendanceSection: attendanceSection?.element,
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

  const angebotInputValue =
    root.querySelector('[data-role="angebot-input"]')?.value;
  const angebotPresetChecked =
    root.querySelector('[data-role="angebot-save-preset"]')?.checked;

  clearElement(root);

  const container = document.createElement('div');
  container.className = 'app';

  const selectedDate = state?.ui?.selectedDate || todayYmd();
  const db = state?.db || {};
  const entry =
    db.days?.[selectedDate] ||
    createFallbackEntry(selectedDate);

  const childrenList = db.children || [];
  const angebotePresets = db.angebote || [];
  const observationPresets = db.observationTemplates || [];

  const absentChildren = Array.isArray(entry.absentChildIds)
    ? entry.absentChildIds
    : [];

  const observations = normalizeObservations(entry.observations);
  const presentChildren = childrenList.filter(
    (child) => !absentChildren.includes(child),
  );

  const absentSection = buildAbsentChildrenSection({
    children: childrenList,
    absentChildren,
  });
  const header = buildHeader({ selectedDate });
  const selectedAngebote = Array.isArray(entry.angebote) ? entry.angebote : [];
  const angebotSection = buildAngebotSection({
    angebote: angebotePresets,
    selectedAngebote,
    newValue: angebotInputValue || '',
    savePresetChecked: angebotPresetChecked,
  });
  const initials = getInitialLetters(presentChildren);
  let selectedInitial =
    typeof state?.ui?.observationsFilter === 'string'
      ? state.ui.observationsFilter
      : 'ALL';
  if (selectedInitial && selectedInitial !== 'ALL') {
    selectedInitial = selectedInitial.toLocaleUpperCase();
  }
  if (selectedInitial !== 'ALL' && !initials.includes(selectedInitial)) {
    setObservationsFilter('ALL');
    selectedInitial = 'ALL';
  }
  const filteredChildren = applyInitialFilter(presentChildren, selectedInitial);
  const observationsSection = buildObservationsSection({
    children: filteredChildren,
    observations,
    presets: observationPresets,
    initials,
    selectedInitial,
  });

  if (!drawerShell) {
    drawerShell = buildDrawerShell();
  }

  const drawerContentRefs = renderDrawerContent(
    state,
    drawerShell.refs.body,
    absentSection,
    angebotSection,
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
  bindAbsentChildren({
    absentList: absentSection.refs.absentList,
    allList: absentSection.refs.allList,
    date: selectedDate,
  });
  bindAngebot({
    comboInput: angebotSection.refs.comboInput,
    addButton: angebotSection.refs.addButton,
    savePresetInput: angebotSection.refs.savePresetInput,
    selectedList: angebotSection.refs.selectedList,
    date: selectedDate,
  });
  bindObservations({
    list: observationsSection.refs.list,
    date: selectedDate,
  });

  const drawerButtons = drawerShell.refs.drawerButtons;
  if (drawerButtons?.actionsToggle) {
    drawerButtons.actionsToggle.addEventListener('click', () => {
      const isOpen = drawerContentRefs?.actionsCollapse?.classList.contains('show');
      setDrawerSectionState('actions', !isOpen);
    });
  }
  if (drawerButtons?.attendanceToggle) {
    drawerButtons.attendanceToggle.addEventListener('click', () => {
      const isOpen = drawerContentRefs?.attendanceCollapse?.classList.contains('show');
      setDrawerSectionState('attendance', !isOpen);
    });
  }
  if (drawerButtons?.angeboteToggle) {
    drawerButtons.angeboteToggle.addEventListener('click', () => {
      const isOpen = drawerContentRefs?.angeboteCollapse?.classList.contains('show');
      setDrawerSectionState('angebote', !isOpen);
    });
  }

  const filterButtons = observationsSection.refs.filterButtons || [];
  filterButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const value = button.dataset.initial || 'ALL';
      setObservationsFilter(value);
    });
  });
};
