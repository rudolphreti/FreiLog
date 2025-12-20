import { todayYmd } from '../utils/date.js';
import { clearElement } from './dom.js';
import {
  buildHeader,
  buildBackdrop,
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
  absentChildren: [],
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

let drawerOpen = false;
let drawerRefs = null;
let drawerShell = null;
let escapeListenerBound = false;
let drawerCloseBound = false;

const applyDrawerState = (open) => {
  drawerOpen = open;

  if (!drawerRefs) {
    return;
  }

  drawerRefs.drawer.classList.toggle('is-open', open);
  drawerRefs.backdrop.classList.toggle('is-visible', open);
  document.body.classList.toggle('drawer-open', open);
};

const bindDrawerEscape = () => {
  if (escapeListenerBound) {
    return;
  }

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && drawerOpen) {
      applyDrawerState(false);
    }
  });

  escapeListenerBound = true;
};

const renderDrawerContent = (state, drawerBody, attendanceSection, angebotSection) => {
  if (!drawerBody) {
    return null;
  }

  const scrollTop = drawerBody.scrollTop;
  const exportMode = state?.ui?.exportMode === 'all' ? 'all' : 'day';
  const drawerSections = state?.ui?.drawer?.sections || {};
  const content = buildDrawerContent({
    exportMode,
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
    db.records?.entriesByDate?.[selectedDate] ||
    createFallbackEntry(selectedDate);

  const childrenList = db.presetData?.childrenList || [];
  const angebotePresets = db.presetData?.angebote || [];
  const observationPresets = db.presetData?.observations || [];

  const absentChildren = Array.isArray(entry.absentChildren)
    ? entry.absentChildren
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
  const backdrop = buildBackdrop();
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

  container.append(
    header.element,
    backdrop,
    drawerShell.element,
    observationsSection.element,
  );
  root.appendChild(container);

  bindDateEntry(header.refs.dateInput);
  bindImportExport({
    exportModeButtons: drawerContentRefs?.exportModeButtons || [],
    exportButton: drawerContentRefs?.exportButton,
    importButton: drawerContentRefs?.importButton,
    deleteButton: drawerContentRefs?.deleteButton,
    resetButton: drawerContentRefs?.resetButton,
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
  observationsSection.refs.filterButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const value = button.dataset.value || 'ALL';
      setObservationsFilter(value);
    });
  });

  drawerRefs = {
    drawer: drawerShell.element,
    backdrop,
  };
  applyDrawerState(drawerOpen);
  bindDrawerEscape();

  header.refs.menuButton.addEventListener('click', () => {
    applyDrawerState(true);
  });
  if (!drawerCloseBound) {
    drawerShell.refs.closeButton.addEventListener('click', () => {
      applyDrawerState(false);
    });
    drawerCloseBound = true;
  }
  backdrop.addEventListener('click', () => {
    applyDrawerState(false);
  });

  if (drawerContentRefs?.sections) {
    Object.entries(drawerContentRefs.sections).forEach(([id, section]) => {
      section.refs.toggleButton.addEventListener('click', () => {
        const nextOpen = !section.isOpen();
        section.setOpen(nextOpen);
        setDrawerSectionState(id, nextOpen);
      });
    });
  }
};
