import { todayYmd } from '../utils/date.js';
import { clearElement } from './dom.js';
import {
  buildHeader,
  buildAbsentChildrenSection,
  buildAngebotSection,
  buildObservationsSection,
} from './components.js';
import { bindDateEntry } from '../features/dateEntry.js';
import { bindAbsentChildren } from '../features/absentChildren.js';
import { bindAngebot } from '../features/angebot.js';
import { bindObservations } from '../features/observations.js';
import { bindImportExport } from '../features/importExport.js';

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
        acc[item.child] = {
          preset: item.preset || '',
          note: item.note || '',
        };
      }
      return acc;
    }, {});
  }

  if (typeof value === 'object') {
    return value;
  }

  return {};
};

export const renderApp = (root, state) => {
  if (!root) {
    return;
  }

  const searchValue = root.querySelector('[data-role="absent-search"]')?.value;
  const newAngebotValue = root.querySelector('[data-role="angebot-new"]')?.value;

  clearElement(root);

  const container = document.createElement('div');
  container.className = 'app';

  const selectedDate = state?.ui?.selectedDate || todayYmd();
  const exportMode = state?.ui?.exportMode === 'all' ? 'all' : 'day';
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

  const selectedAngebot = Array.isArray(entry.angebote)
    ? entry.angebote[0] || ''
    : entry.angebote || '';

  const observations = normalizeObservations(entry.observations);
  const presentChildren = childrenList.filter(
    (child) => !absentChildren.includes(child),
  );

  const header = buildHeader({ selectedDate, exportMode });
  const absentSection = buildAbsentChildrenSection({
    children: childrenList,
    absentChildren,
    searchValue: searchValue || '',
  });
  const angebotSection = buildAngebotSection({
    angebote: angebotePresets,
    selectedAngebot,
    newValue: newAngebotValue || '',
  });
  const observationsSection = buildObservationsSection({
    children: presentChildren,
    observations,
    presets: observationPresets,
  });

  container.append(
    header.element,
    absentSection.element,
    angebotSection.element,
    observationsSection.element,
  );
  root.appendChild(container);

  bindDateEntry(header.refs.dateInput);
  bindImportExport({
    exportModeButtons: header.refs.exportModeButtons,
    exportButton: header.refs.exportButton,
    importButton: header.refs.importButton,
    deleteButton: header.refs.deleteButton,
    resetButton: header.refs.resetButton,
    fileInput: header.refs.importInput,
  });
  bindAbsentChildren({
    searchInput: absentSection.refs.searchInput,
    list: absentSection.refs.list,
    date: selectedDate,
  });
  bindAngebot({
    comboInput: angebotSection.refs.comboInput,
    addInput: angebotSection.refs.addInput,
    addButton: angebotSection.refs.addButton,
    date: selectedDate,
  });
  bindObservations({
    list: observationsSection.refs.list,
    date: selectedDate,
  });
};
