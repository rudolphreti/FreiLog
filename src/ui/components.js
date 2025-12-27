import { createEl } from './dom.js';
import {
  DEFAULT_SAVED_OBSERVATION_FILTERS,
  normalizeSavedObservationFilters,
} from '../db/dbSchema.js';
import {
  OBSERVATION_GROUP_CODES,
  normalizeObservationKey,
  normalizeObservationGroups,
  normalizeObservationText,
} from '../utils/observationCatalog.js';
import { todayYmd } from '../utils/date.js';

export const buildHeader = ({ selectedDate, showInitialActions = false, freeDayInfo = null }) => {
  const header = createEl('header', {
    className: 'bg-white shadow-sm rounded-4 px-3 py-3 sticky-top',
  });

  const menuButton = createEl('button', {
    className: 'btn btn-outline-primary d-inline-flex align-items-center header-menu-btn',
    children: [
      createEl('span', { text: '☰' }),
      createEl('span', { className: 'visually-hidden', text: 'Menü öffnen' }),
    ],
    attrs: {
      type: 'button',
      'data-bs-toggle': 'offcanvas',
      'data-bs-target': '#mainDrawer',
      'aria-controls': 'mainDrawer',
    },
  });
  const dateInput = createEl('input', {
    className: 'form-control',
    attrs: { type: 'date', value: selectedDate || todayYmd(), 'aria-label': 'Datum' },
  });
  const dateGroup = createEl('div', {
    className: 'd-flex flex-wrap align-items-center gap-2 header-date',
    children: [dateInput],
  });
  if (freeDayInfo) {
    const label = freeDayInfo.label || 'Schulfrei';
    const badge = createEl('span', {
      className: 'free-day-pill',
      children: [
        createEl('span', { text: '🏖️' }),
        createEl('span', { text: `${label}` }),
      ],
    });
    dateGroup.append(badge);
  }

  const importButton = createEl('button', {
    className: 'btn btn-outline-secondary d-inline-flex align-items-center gap-2',
    attrs: { type: 'button' },
    children: [createEl('span', { text: '⬆️' }), createEl('span', { text: 'DB importieren...' })],
  });

  const dummyDataButton = createEl('button', {
    className: 'btn btn-outline-secondary d-inline-flex align-items-center gap-2',
    attrs: { type: 'button' },
    children: [createEl('span', { text: '🧪' }), createEl('span', { text: 'Dummy-Daten laden' })],
  });

  const importInput = createEl('input', {
    attrs: { type: 'file', accept: 'application/json' },
    className: 'd-none',
  });

  const actionNodes = [];
  if (showInitialActions) {
    actionNodes.push(importButton, dummyDataButton, importInput);
  }
  actionNodes.push(menuButton);

  const actionsGroup = createEl('div', {
    className: 'd-flex align-items-center gap-2 header-actions flex-wrap',
    children: actionNodes,
  });

  const headerContent = createEl('div', {
    className:
      'd-flex flex-row flex-wrap align-items-center justify-content-between gap-3 header-content',
    children: [dateGroup, actionsGroup],
  });

  header.append(headerContent);

  return {
    element: header,
    refs: {
      dateInput,
      menuButton,
      importButton: showInitialActions ? importButton : null,
      dummyDataButton: showInitialActions ? dummyDataButton : null,
      importInput: showInitialActions ? importInput : null,
    },
  };
};

export const buildDrawerShell = () => {
  const drawer = createEl('aside', {
    className: 'offcanvas offcanvas-start',
    attrs: { tabindex: '-1', id: 'mainDrawer', 'aria-labelledby': 'drawerTitle' },
  });

  const drawerHeader = createEl('div', { className: 'offcanvas-header' });
  const drawerTitle = createEl('h2', {
    className: 'offcanvas-title h5',
    attrs: { id: 'drawerTitle' },
    text: 'Menü',
  });
  const closeButton = createEl('button', {
    className: 'btn-close',
    attrs: {
      type: 'button',
      'aria-label': 'Menü schließen',
      'data-bs-dismiss': 'offcanvas',
    },
  });
  drawerHeader.append(drawerTitle, closeButton);

  const body = createEl('div', {
    className: 'offcanvas-body d-flex flex-column gap-3',
    dataset: { drawerScroll: '' },
  });

  drawer.append(drawerHeader, body);

  return {
    element: drawer,
    refs: {
      closeButton,
      body,
    },
  };
};

const buildAccordionItem = ({
  id,
  title,
  defaultOpen,
  contentNode,
  accordionId,
}) => {
  const item = createEl('div', { className: 'accordion-item' });
  const headerId = `${id}-heading`;
  const collapseId = `${id}-collapse`;

  const header = createEl('h2', { className: 'accordion-header', attrs: { id: headerId } });
  const button = createEl('button', {
    className: `accordion-button${defaultOpen ? '' : ' collapsed'}`,
    text: title,
    attrs: {
      type: 'button',
      'data-bs-toggle': 'collapse',
      'data-bs-target': `#${collapseId}`,
      'aria-expanded': defaultOpen ? 'true' : 'false',
      'aria-controls': collapseId,
    },
  });
  header.append(button);

  const collapse = createEl('div', {
    className: `accordion-collapse collapse${defaultOpen ? ' show' : ''}`,
    attrs: {
      id: collapseId,
      'aria-labelledby': headerId,
      'data-bs-parent': `#${accordionId}`,
    },
  });

  const body = createEl('div', { className: 'accordion-body', children: [contentNode] });
  collapse.append(body);

  item.append(header, collapse);

  return {
    element: item,
    refs: {
      toggleButton: button,
      collapse,
    },
  };
};

export const buildDrawerContent = ({
  drawerSections,
  angebotSection,
  showExport = false,
  showDummy = true,
  showWeekly = false,
}) => {
  const accordionId = 'drawerAccordion';
  const accordion = createEl('div', { className: 'accordion', attrs: { id: accordionId } });

  const actionsList = createEl('div', { className: 'd-flex flex-column gap-2' });
  const actionButton = (text, icon, attrs = {}) =>
    createEl('button', {
      className: 'btn btn-outline-primary d-inline-flex align-items-center gap-2',
      attrs: { type: 'button', ...attrs },
      children: [createEl('span', { text: icon }), createEl('span', { text })],
    });

  const weeklyTableButton = showWeekly ? actionButton('Wochentabelle...', '📅') : null;
  const exportButton = showExport ? actionButton('DB Exportieren...', '⬇️') : null;
  const importButton = actionButton('DB importieren...', '⬆️');
  const dummyDataButton = showDummy ? actionButton('Dummy-Daten laden', '🧪') : null;
  const importInput = createEl('input', {
    attrs: { type: 'file', accept: 'application/json' },
    className: 'd-none',
  });

  [
    weeklyTableButton,
    exportButton,
    importButton,
    dummyDataButton,
    importInput,
  ]
    .filter(Boolean)
    .forEach((node) => actionsList.append(node));

  const actionsSectionItem = buildAccordionItem({
    id: 'actions',
    title: 'Daten',
    defaultOpen: Boolean(drawerSections?.actions),
    contentNode: actionsList,
    accordionId,
  });

  const offersContent =
    angebotSection ||
    createEl('p', {
      className: 'text-muted mb-0',
      text: 'Platzhalter für spätere Funktionen.',
    });
  const offersSectionItem = buildAccordionItem({
    id: 'angebote',
    title: 'Angebote',
    defaultOpen: Boolean(drawerSections?.angebote),
    contentNode: offersContent,
    accordionId,
  });

  const settingsContent = createEl('div', { className: 'd-flex flex-column gap-2' });
  const classButton = actionButton('Meine Klasse', '🎒', {
    'data-role': 'class-settings',
  });
  const freeDaysButton = actionButton('Freie Tage', '🏖️', {
    'data-role': 'free-days-settings',
  });
  settingsContent.append(classButton, freeDaysButton);

  const settingsSectionItem = buildAccordionItem({
    id: 'einstellungen',
    title: 'Einstellungen',
    defaultOpen: Boolean(drawerSections?.einstellungen),
    contentNode: settingsContent,
    accordionId,
  });

  accordion.append(
    actionsSectionItem.element,
    offersSectionItem.element,
    settingsSectionItem.element,
  );

  return {
    nodes: [accordion],
    refs: {
      actions: {
        weeklyTableButton,
        exportButton,
        importButton,
        dummyDataButton,
        importInput,
      },
      settings: {
        classButton,
        freeDaysButton,
      },
      sections: {
        actions: actionsSectionItem,
        angebote: offersSectionItem,
        einstellungen: settingsSectionItem,
      },
    },
  };
};

const buildPill = ({ label, removeLabel, removeRole, value }) => {
  const labelSpan = createEl('span', { text: label });
  const removeButton = createEl('button', {
    className: 'btn btn-link btn-sm text-white p-0 ms-2',
    text: '✕',
    attrs: { type: 'button', 'aria-label': removeLabel },
    dataset: { role: removeRole, value },
  });
  return createEl('span', {
    className: 'badge rounded-pill text-bg-primary d-inline-flex align-items-center badge-pill',
    children: [labelSpan, removeButton],
    dataset: { value },
  });
};

const buildObservationCatalogGroupMap = (catalog) => {
  const entries = Array.isArray(catalog) ? catalog : [];
  const groups = new Map();

  entries.forEach((entry) => {
    const text =
      typeof entry === 'string'
        ? entry.trim()
        : typeof entry?.text === 'string'
          ? entry.text.trim()
          : '';
    if (!text) {
      return;
    }
    const normalizedGroups = normalizeObservationGroups(entry?.groups || []);
    groups.set(normalizeObservationKey(text), normalizedGroups);
  });

  return groups;
};

const getOrderedObservationGroups = (groups) => {
  const normalized = normalizeObservationGroups(groups);
  if (!normalized.length) {
    return [];
  }
  if (!normalized.includes('SCHWARZ')) {
    return normalized;
  }
  return ['SCHWARZ', ...normalized.filter((group) => group !== 'SCHWARZ')];
};

const buildObservationGroupDots = (groups, observationGroups) => {
  const ordered = getOrderedObservationGroups(groups);
  if (!ordered.length) {
    return null;
  }

  const maxDots = 3;
  const showOverflow = ordered.length > maxDots;
  const visible = showOverflow ? ordered.slice(0, maxDots - 1) : ordered;

  const wrapper = createEl('span', { className: 'observation-group-dots' });

  visible.forEach((group) => {
    const color =
      observationGroups && observationGroups[group]?.color
        ? observationGroups[group].color
        : '#6c757d';
    wrapper.appendChild(
      createEl('span', {
        className: 'observation-group-dot',
        attrs: { style: `--group-color: ${color};`, 'aria-hidden': 'true' },
      }),
    );
  });

  if (showOverflow) {
    wrapper.appendChild(
      createEl('span', {
        className: 'observation-group-dot observation-group-dot--overflow',
        text: '+',
        attrs: { 'aria-hidden': 'true' },
      }),
    );
  }

  return wrapper;
};

export const buildAngebotSection = ({
  angebote,
  selectedAngebote,
  newValue,
  readOnly = false,
}) => {
  const activeAngebote = Array.isArray(selectedAngebote)
    ? selectedAngebote
    : [];
  const datalistId = 'angebote-list';
  const comboInput = createEl('input', {
    className: 'form-control',
    attrs: {
      type: 'text',
      list: datalistId,
      placeholder: 'Angebot auswählen...',
    },
    dataset: { role: 'angebot-input' },
  });
  comboInput.value = newValue || '';

  const datalist = createEl('datalist', { attrs: { id: datalistId } });
  angebote.forEach((item) => {
    datalist.appendChild(createEl('option', { attrs: { value: item } }));
  });

  const addButton = createEl('button', {
    className: 'btn btn-outline-secondary btn-sm px-2',
    text: '+',
    attrs: { type: 'button', 'aria-label': 'Hinzufügen' },
  });

  const selectedTitle = createEl('h4', {
    className: 'h6 text-muted mt-3 mb-2',
    text: 'Heute ausgewählt',
  });
  const selectedList = createEl('div', {
    className: 'd-flex flex-wrap gap-2',
    dataset: { role: 'angebot-list' },
  });
  activeAngebote.forEach((angebot) => {
    const pill = buildPill({
      label: angebot,
      removeLabel: `${angebot} entfernen`,
      removeRole: 'angebot-remove',
      value: angebot,
    });
    pill.dataset.angebot = angebot;
    selectedList.appendChild(pill);
  });

  const comboRow = createEl('div', {
    className: 'd-flex align-items-center gap-2',
    children: [comboInput, addButton, datalist],
  });

  comboInput.disabled = readOnly;
  addButton.disabled = readOnly;

  const content = createEl('div', {
    className: 'd-flex flex-column gap-3',
    children: [comboRow, selectedTitle, selectedList],
  });

  return {
    element: content,
    refs: {
      comboInput,
      addButton,
      selectedList,
    },
  };
};

const buildPillList = ({
  items,
  getLabel,
  getRemoveLabel,
  removeRole,
  getGroups,
  observationGroups,
}) => {
  const list = createEl('div', { className: 'd-flex flex-wrap gap-2' });
  items.forEach((item) => {
    const label = getLabel(item);
    const groups = getGroups ? getGroups(item) : [];
    const groupDots = buildObservationGroupDots(groups, observationGroups);
    const hasBlackGroup = normalizeObservationGroups(groups).includes('SCHWARZ');
    const pill = createEl('span', {
      className:
        `badge rounded-pill text-bg-secondary d-inline-flex align-items-center tag-badge observation-pill${
          hasBlackGroup ? ' observation-group-outline' : ''
        }`,
      dataset: { value: label },
      children: [
        groupDots,
        createEl('span', { text: label }),
        createEl('button', {
          className: 'btn btn-link btn-sm text-white p-0 ms-2',
          text: '✕',
          attrs: { type: 'button', 'aria-label': getRemoveLabel(label) },
          dataset: { role: removeRole, value: label },
        }),
      ],
    });
    list.appendChild(pill);
  });

  return list;
};

const buildTopList = (items, getGroups, observationGroups) => {
  const list = createEl('div', { className: 'd-flex flex-wrap gap-2 small observation-top-list' });
  items.forEach(({ label, count }) => {
    const groups = getGroups ? getGroups(label) : [];
    const groupDots = buildObservationGroupDots(groups, observationGroups);
    const hasBlackGroup = normalizeObservationGroups(groups).includes('SCHWARZ');
    const button = createEl('button', {
      className:
        `btn btn-outline-secondary btn-sm observation-chip observation-top-button d-inline-flex align-items-center gap-2${
          hasBlackGroup ? ' observation-group-outline' : ''
        }`,
      attrs: { type: 'button' },
      dataset: { role: 'observation-top-add', value: label },
      children: [
        createEl('span', { className: 'observation-top-plus', text: '+' }),
        groupDots,
        createEl('span', { text: label }),
        createEl('span', {
          className: 'badge text-bg-light border observation-top-count',
          text: String(count),
        }),
      ],
    });
    list.appendChild(button);
  });

  return list;
};

const buildTopItems = (stats, catalog) => {
  if (!stats || typeof stats !== 'object') {
    return [];
  }

  const normalizedCounts = new Map();
  Object.entries(stats).forEach(([label, count]) => {
    const key = normalizeObservationKey(label);
    if (!key) {
      return;
    }
    const safeCount = Number.isFinite(count) ? count : Number(count) || 0;
    if (safeCount <= 0) {
      return;
    }
    normalizedCounts.set(key, (normalizedCounts.get(key) || 0) + safeCount);
  });

  const entries = Array.isArray(catalog) ? catalog : [];
  const seen = new Set();
  const items = [];

  entries.forEach((entry) => {
    const text =
      typeof entry === 'string'
        ? normalizeObservationText(entry)
        : normalizeObservationText(entry?.text);
    if (!text) {
      return;
    }
    const key = normalizeObservationKey(text);
    if (!key || seen.has(key)) {
      return;
    }
    seen.add(key);
    const count = normalizedCounts.get(key) || 0;
    if (count > 0) {
      items.push({ label: text, count });
    }
  });

  return items
    .sort((a, b) => {
      if (b.count !== a.count) {
        return b.count - a.count;
      }
      return a.label.localeCompare(b.label, 'de');
    })
    .slice(0, 10);
};

export const buildInitialFilterBar = ({ initials, selectedInitial }) => {
  const wrapper = createEl('div', { className: 'd-flex flex-wrap gap-2' });
  const buttons = [];
  const current = selectedInitial === 'ALL' ? 'ALL' : selectedInitial;

  const addButton = (label, value) => {
    const isActive = current === value;
    const button = createEl('button', {
      className: `btn btn-outline-secondary${isActive ? ' active' : ''}`,
      text: label,
      attrs: { type: 'button', 'aria-pressed': isActive ? 'true' : 'false' },
      dataset: { role: 'observation-filter', value },
    });
    buttons.push(button);
    wrapper.appendChild(button);
  };

  addButton('Alle', 'ALL');

  const letterList = Array.isArray(initials) ? initials : [];
  letterList.forEach((letter) => {
    addButton(letter, letter);
  });

  return { element: wrapper, buttons };
};

const buildObservationTemplateEntries = (templates, catalog) => {
  const normalized = Array.isArray(templates) ? templates : [];
  const catalogEntries = Array.isArray(catalog) ? catalog : [];
  const catalogGroups = new Map();

  catalogEntries.forEach((entry) => {
    const text = typeof entry?.text === 'string' ? entry.text.trim() : '';
    if (!text) {
      return;
    }
    catalogGroups.set(
      normalizeObservationKey(text),
      normalizeObservationGroups(entry?.groups || []),
    );
  });

  return normalized
    .filter((item) => typeof item === 'string' && item.trim())
    .map((item) => {
      const text = item.trim();
      return {
        text,
        groups: catalogGroups.get(normalizeObservationKey(text)) || [],
      };
    });
};

const buildTemplateGroups = (templates) => {
  const normalized = Array.isArray(templates) ? templates : [];
  const entries = normalized
    .map((item) => {
      if (typeof item === 'string') {
        const text = item.trim();
        return text ? { text, groups: [] } : null;
      }
      if (item && typeof item === 'object') {
        const text = typeof item.text === 'string' ? item.text.trim() : '';
        if (!text) {
          return null;
        }
        return {
          text,
          groups: normalizeObservationGroups(item.groups),
        };
      }
      return null;
    })
    .filter(Boolean);
  const sorted = [...entries].sort((a, b) =>
    a.text.localeCompare(b.text, 'de', { sensitivity: 'base' }),
  );

  const groups = new Map();
  sorted.forEach((entry) => {
    const initial = entry.text[0].toLocaleUpperCase();
    if (!groups.has(initial)) {
      groups.set(initial, []);
    }
    groups.get(initial).push(entry);
  });

  return {
    groups,
    initials: Array.from(groups.keys())
      .filter((letter) => /^[A-Z]$/i.test(letter))
      .sort((a, b) => a.localeCompare(b, 'de')),
  };
};

const buildObservationTemplatesOverlay = ({
  templates,
  observationCatalog,
  observationGroups,
  savedFilters,
}) => {
  const templateEntries = buildObservationTemplateEntries(
    templates,
    observationCatalog,
  );
  const { groups, initials } = buildTemplateGroups(templateEntries);
  const hasTemplates = groups.size > 0;
  const normalizedSavedFilters = normalizeSavedObservationFilters(
    savedFilters || DEFAULT_SAVED_OBSERVATION_FILTERS,
  );
  const normalizedSelectedGroups = normalizeObservationGroups(
    normalizedSavedFilters.selectedGroups,
  );
  const overlay = createEl('div', {
    className: 'observation-templates-overlay',
    dataset: {
      role: 'observation-templates-overlay',
      templateFilter: normalizedSavedFilters.selectedLetter || 'ALL',
      templateQuery: '',
      templateGroups: normalizedSelectedGroups.join(','),
      templateGroupMode:
        normalizedSavedFilters.andOrMode === 'OR' ? 'OR' : 'AND',
      templateMulti: normalizedSavedFilters.multiGroups ? 'true' : 'false',
      templateShowAndOr: normalizedSavedFilters.showAndOr ? 'true' : 'false',
      templateShowAlphabet: normalizedSavedFilters.showAlphabet ? 'true' : 'false',
      templateSettingsOpen: 'false',
    },
    attrs: { 'aria-hidden': 'true' },
  });
  const overlayPanel = createEl('div', {
    className: 'observation-templates-overlay__panel',
    attrs: { role: 'dialog', 'aria-modal': 'true' },
  });
  const header = createEl('div', {
    className: 'observation-templates-overlay__header',
  });
  const title = createEl('h3', {
    className: 'h5 mb-0',
    text: 'Gespeicherte Beobachtungen',
  });
  const closeButton = createEl('button', {
    className: 'btn-close observation-templates-overlay__close',
    attrs: { type: 'button', 'aria-label': 'Schließen' },
    dataset: { role: 'observation-template-close' },
  });
  header.append(title, closeButton);

  const groupFilterBar = createEl('div', {
    className: 'observation-templates__group-dots',
  });

  const addGroupButton = (code) => {
    const color =
      observationGroups && observationGroups[code]?.color
        ? observationGroups[code].color
        : '#6c757d';
    const label =
      observationGroups && observationGroups[code]?.label
        ? observationGroups[code].label
        : code;
    const button = createEl('button', {
      className: 'observation-group-dot-btn',
      children: [
        createEl('span', {
          className: 'observation-group-dot',
          attrs: { 'aria-hidden': 'true' },
        }),
        createEl('span', {
          className: 'visually-hidden',
          text: `${label} (${code})`,
        }),
      ],
      attrs: {
        type: 'button',
        'aria-pressed': 'false',
        style: `--group-color: ${color};`,
        title: `${label} (${code})`,
      },
      dataset: { role: 'observation-template-group-filter', value: code },
    });
    groupFilterBar.appendChild(button);
  };

  OBSERVATION_GROUP_CODES.forEach((code) => addGroupButton(code));

  const groupModeToggle = createEl('div', {
    className: 'observation-templates__group-mode',
    attrs: { role: 'group', 'aria-label': 'Gruppenfilter Modus' },
    dataset: { role: 'observation-template-group-mode-toggle' },
  });

  const addGroupModeButton = (label, value, isActive = false) => {
    const button = createEl('button', {
      className: `observation-templates__mode-btn${isActive ? ' active' : ''}`,
      text: label,
      attrs: {
        type: 'button',
        'aria-pressed': isActive ? 'true' : 'false',
      },
      dataset: { role: 'observation-template-group-mode', value },
    });
    groupModeToggle.appendChild(button);
  };

  addGroupModeButton('UND', 'AND', normalizedSavedFilters.andOrMode !== 'OR');
  addGroupModeButton('ODER', 'OR', normalizedSavedFilters.andOrMode === 'OR');

  const groupControls = createEl('div', {
    className: 'observation-templates__group-set',
    children: [groupFilterBar, groupModeToggle],
  });

  const filterBar = createEl('div', {
    className: 'observation-templates__filters',
    dataset: { role: 'observation-template-letter-bar' },
  });

  const addFilterButton = (label, value, isActive = false) => {
    const button = createEl('button', {
      className: `btn btn-outline-secondary btn-sm observation-letter${
        isActive ? ' active' : ''
      }`,
      text: label,
      attrs: {
        type: 'button',
        'aria-pressed': isActive ? 'true' : 'false',
      },
      dataset: { role: 'observation-template-letter', value },
    });
    filterBar.appendChild(button);
  };

  addFilterButton('Alle', 'ALL', true);
  initials.forEach((letter) => addFilterButton(letter, letter));

  const searchInput = createEl('input', {
    className: 'form-control form-control-sm observation-templates__search',
    attrs: {
      type: 'search',
      placeholder: 'Suchen…',
      'aria-label': 'Gespeicherte Beobachtungen durchsuchen',
    },
    dataset: { role: 'observation-template-search' },
  });

  const settingsToggle = createEl('button', {
    className: 'observation-templates__settings-btn',
    attrs: {
      type: 'button',
      'aria-label': 'Erweiterte Filter',
      'aria-expanded': 'false',
    },
    dataset: { role: 'observation-template-settings-toggle' },
    text: '⚙',
  });

  const multiOption = createEl('label', {
    className: 'form-check form-switch observation-templates__setting-option',
    children: [
      createEl('span', { className: 'form-check-label', text: 'Mehrere Gruppen auswählen' }),
      createEl('input', {
        className: 'form-check-input',
        attrs: { type: 'checkbox' },
        dataset: { role: 'observation-template-multi-switch' },
      }),
    ],
  });

  const alphabetOption = createEl('label', {
    className: 'form-check form-switch observation-templates__setting-option',
    children: [
      createEl('span', { className: 'form-check-label', text: 'Buchstaben-Filter anzeigen' }),
      createEl('input', {
        className: 'form-check-input',
        attrs: { type: 'checkbox' },
        dataset: { role: 'observation-template-alphabet-switch' },
      }),
    ],
  });

  const settingsMode = createEl('div', {
    className:
      'observation-templates__setting-option observation-templates__setting-option--mode',
    dataset: { role: 'observation-template-group-mode-settings' },
    children: [
      createEl('span', { className: 'form-check-label', text: 'UND/ODER' }),
      createEl('div', {
        className: 'observation-templates__mode-inline',
        children: [
          createEl('button', {
            className: 'observation-templates__mode-btn',
            text: 'UND',
            attrs: { type: 'button', 'aria-pressed': 'false' },
            dataset: { role: 'observation-template-group-mode', value: 'AND' },
          }),
          createEl('button', {
            className: 'observation-templates__mode-btn',
            text: 'ODER',
            attrs: { type: 'button', 'aria-pressed': 'false' },
            dataset: { role: 'observation-template-group-mode', value: 'OR' },
          }),
        ],
      }),
    ],
  });

  const andOrVisibilityOption = createEl('label', {
    className: 'form-check form-switch observation-templates__setting-option',
    children: [
      createEl('span', { className: 'form-check-label', text: 'UND/ODER anzeigen' }),
      createEl('input', {
        className: 'form-check-input',
        attrs: { type: 'checkbox' },
        dataset: { role: 'observation-template-andor-switch' },
      }),
    ],
  });

  const settingsPanel = createEl('div', {
    className: 'observation-templates__settings-panel',
    dataset: { role: 'observation-template-settings-panel' },
    hidden: true,
    children: [multiOption, andOrVisibilityOption, settingsMode, alphabetOption],
  });

  const settings = createEl('div', {
    className: 'observation-templates__settings',
    children: [settingsToggle, settingsPanel],
  });

  const searchRow = createEl('div', {
    className: 'observation-templates__search-row',
    children: [searchInput],
  });

  const filtersShell = createEl('div', {
    className: 'observation-templates__filters-shell',
    children: [
      createEl('div', {
        className: 'observation-templates__filter-row',
        children: [groupControls, settings],
      }),
      filterBar,
      searchRow,
    ],
  });

  const list = createEl('div', {
    className: 'd-flex flex-column gap-3 observation-templates__list',
    dataset: { role: 'observation-template-list' },
  });
  list.hidden = !hasTemplates;

  groups.forEach((items, initial) => {
    const group = createEl('div', {
      className: 'observation-templates__group',
      dataset: { initial },
    });
    const heading = createEl('p', {
      className: 'text-muted small mb-1 fw-semibold',
      text: initial,
    });
    const buttons = createEl('div', {
      className: 'd-flex flex-wrap gap-2 observation-templates__group-buttons',
      dataset: { role: 'observation-template-group' },
    });
    items.forEach((item) => {
      const groupsValue = Array.isArray(item.groups) ? item.groups.join(',') : '';
      const groupDots = buildObservationGroupDots(item.groups, observationGroups);
      const hasBlackGroup = normalizeObservationGroups(item.groups).includes('SCHWARZ');
      const button = createEl('button', {
        className:
          `btn btn-outline-secondary observation-chip observation-template-button${
            hasBlackGroup ? ' observation-group-outline' : ''
          }`,
        attrs: { type: 'button' },
        dataset: {
          role: 'observation-template-add',
          value: item.text,
          initial,
          groups: groupsValue,
        },
        children: [groupDots, createEl('span', { text: item.text })],
      });
      buttons.appendChild(button);
    });
    group.append(heading, buttons);
    list.appendChild(group);
  });

  const empty = createEl('p', {
    className: 'text-muted small mb-0 observation-templates__empty',
    text: 'Keine gespeicherten Beobachtungen vorhanden.',
  });
  empty.hidden = hasTemplates;
  empty.dataset.role = 'observation-template-empty';

  const content = createEl('div', {
    className: 'mt-3 d-flex flex-column gap-3',
    children: [filtersShell, list, empty],
  });

  const scrollContent = createEl('div', {
    className: 'observation-templates-overlay__content',
    children: [content],
  });

  overlayPanel.append(header, scrollContent);
  overlay.appendChild(overlayPanel);

  return {
    element: overlay,
    refs: {
      list,
      filterBar,
      searchInput,
      empty,
      closeButton,
    },
  };
};

const getObservationCount = (observationsByChild, child) => {
  const items = observationsByChild?.[child];
  if (Array.isArray(items)) {
    return items.length;
  }
  return 0;
};

const rebuildChildButton = ({
  child,
  isAbsent,
  observationsByChild,
  readOnly = false,
}) => {
  const count = getObservationCount(observationsByChild, child);
  const badge = isAbsent
    ? createEl('span', {
        className: 'badge text-bg-light text-secondary observation-absent-badge',
        text: 'Abwesend',
      })
    : null;
  const countBadge =
    count > 0
      ? createEl('span', {
          className: 'badge text-bg-light text-secondary observation-count-badge',
          text: `${count}`,
        })
      : null;
  return createEl('button', {
    className:
      `btn observation-child-button${isAbsent ? ' is-absent' : ' btn-outline-primary'}`,
    attrs: { type: 'button', disabled: readOnly ? 'true' : null },
    dataset: {
      role: 'observation-child',
      child,
      absent: isAbsent ? 'true' : 'false',
      readonly: readOnly ? 'true' : 'false',
    },
    children: badge
      ? [
          createEl('span', { className: 'fw-semibold observation-child-label', text: child }),
          countBadge,
          badge,
        ].filter(Boolean)
      : [
          createEl('span', { className: 'fw-semibold observation-child-label', text: child }),
          countBadge,
        ].filter(Boolean),
  });
};

const rebuildTodayList = (items, getGroupsForLabel, observationGroups) =>
  buildPillList({
    items: Array.isArray(items) ? items : [],
    getLabel: (item) => item,
    getRemoveLabel: (label) => `${label} entfernen`,
    removeRole: 'observation-today-remove',
    getGroups: (item) => getGroupsForLabel(item),
    observationGroups,
  });

const rebuildTopList = (topItems, getGroupsForLabel, observationGroups) =>
  topItems.length
    ? buildTopList(topItems, getGroupsForLabel, observationGroups)
    : createEl('p', {
        className: 'text-muted small mb-0',
        text: 'Noch keine Daten',
      });

const createDetailPanel = ({
  child,
  isAbsent,
  topItems,
  observationGroups,
  getGroupsForLabel,
}) => {
  const topList = rebuildTopList(topItems, getGroupsForLabel, observationGroups);

  const todayTitle = createEl('p', {
    className: 'observation-section__title mb-0',
    text: 'Heutige Beobachtungen',
    dataset: { role: 'observation-today-title' },
  });

  const todayList = rebuildTodayList([], getGroupsForLabel, observationGroups);
  todayList.dataset.role = 'observation-today-list';

  const todaySection = createEl('div', {
    className: 'observation-section',
    children: [todayTitle, todayList],
  });

  topList.dataset.role = 'observation-top-list';

  const actionRow = createEl('div', {
    className: 'observation-action-grid',
  });

  const templatesButton = createEl('button', {
    className: 'observation-action-card observation-action-card--catalog observation-template-open',
    children: [
      createEl('span', {
        className: 'observation-action-icon',
        attrs: { 'aria-hidden': 'true' },
        text: '⌕',
      }),
      createEl('span', { className: 'observation-action-label', text: 'Beobachtungen-Katalog' }),
    ],
    attrs: { type: 'button' },
    dataset: { role: 'observation-template-open' },
  });

  const createButton = createEl('button', {
    className: 'observation-action-card observation-action-card--create observation-create-open',
    children: [
      createEl('span', {
        className: 'observation-action-icon',
        attrs: { 'aria-hidden': 'true' },
        text: '+',
      }),
      createEl('span', { className: 'observation-action-label', text: 'Erstelle Beobachtung' }),
    ],
    attrs: { type: 'button' },
    dataset: { role: 'observation-create-open' },
  });

  actionRow.append(templatesButton, createButton);

  const feedback = createEl('p', {
    className: 'text-muted small mb-0',
    text: '',
    dataset: { role: 'observation-feedback' },
  });
  feedback.hidden = true;

  const addTitle = createEl('p', {
    className: 'observation-section__title mb-0',
    text: 'Beobachtungen hinzufügen',
  });

  const topTitle = createEl('p', {
    className: 'observation-section__subtitle mb-0',
    text: 'Top 10',
  });

  const addSection = createEl('div', {
    className: 'observation-section observation-section--add d-flex flex-column gap-2',
    children: [addTitle, topTitle, topList, actionRow],
  });

  const detail = createEl('div', {
    className: 'observation-detail d-flex flex-column gap-3 d-none',
    dataset: {
      child,
      templateFilter: 'ALL',
      templateQuery: '',
      absent: isAbsent ? 'true' : 'false',
    },
    children: [todaySection, addSection, feedback],
  });

  let absentNotice = null;
  if (isAbsent) {
    absentNotice = createEl('p', {
      className: 'text-muted small mb-0',
      text: 'Abwesend – Beobachtungen deaktiviert.',
      dataset: { role: 'observation-absent-notice' },
    });
    todaySection.hidden = true;
    addSection.hidden = true;
    feedback.hidden = true;
    detail.append(absentNotice);
  }

  return {
    detail,
    refs: {
      topList,
      todaySection,
      addSection,
      todayTitle,
      todayList,
      templatesButton,
      createButton,
      actionRow,
      feedback,
      absentNotice,
    },
  };
};

const buildObservationEditOverlay = ({ observationGroups }) => {
  const overlay = createEl('div', {
    className: 'observation-edit-overlay',
    dataset: { role: 'observation-edit-overlay' },
    attrs: { 'aria-hidden': 'true' },
  });
  const panel = createEl('div', {
    className: 'observation-edit-overlay__panel',
    attrs: { role: 'dialog', 'aria-modal': 'true' },
  });

  const header = createEl('div', {
    className: 'observation-edit-overlay__header',
  });
  const title = createEl('h3', {
    className: 'h5 mb-0',
    text: 'Beobachtung bearbeiten',
  });
  const headerActions = createEl('div', {
    className: 'd-flex flex-wrap gap-2',
    children: [
      createEl('button', {
        className: 'btn btn-primary',
        text: 'Speichern',
        attrs: { type: 'submit' },
        dataset: { role: 'observation-edit-save' },
      }),
      createEl('button', {
        className: 'btn btn-outline-secondary',
        text: 'Abbrechen',
        attrs: { type: 'button' },
        dataset: { role: 'observation-edit-cancel' },
      }),
    ],
  });
  header.append(title, headerActions);

  const inputLabel = createEl('label', {
    className: 'form-label text-muted small mb-0',
    text: 'Text',
  });
  const input = createEl('input', {
    className: 'form-control',
    attrs: {
      type: 'text',
      autocomplete: 'off',
    },
    dataset: { role: 'observation-edit-input' },
  });

  const groupsTitle = createEl('p', {
    className: 'text-muted small mb-0',
    text: 'Gruppen',
  });
  const groupButtons = createEl('div', {
    className: 'd-flex flex-wrap gap-2 observation-edit-groups',
    dataset: { role: 'observation-edit-groups' },
  });

  OBSERVATION_GROUP_CODES.forEach((code) => {
    const entry = observationGroups?.[code];
    const label = entry?.label || code;
    const color = entry?.color || '#6c757d';
    const button = createEl('button', {
      className: 'btn observation-edit-group-toggle',
      attrs: { type: 'button', style: `--group-color: ${color};` },
      dataset: { role: 'observation-edit-group', value: code },
      text: label,
    });
    groupButtons.appendChild(button);
  });

  const content = createEl('div', {
    className: 'observation-edit-overlay__content',
    children: [inputLabel, input, groupsTitle, groupButtons],
  });

  const form = createEl('form', {
    className: 'observation-edit-overlay__form',
    dataset: { role: 'observation-edit-form' },
    children: [header, content],
  });

  panel.appendChild(form);
  overlay.appendChild(panel);

  return {
    element: overlay,
  };
};

const buildObservationCreateOverlay = ({ observationGroups }) => {
  const overlay = createEl('div', {
    className: 'observation-create-overlay',
    dataset: { role: 'observation-create-overlay' },
    attrs: { 'aria-hidden': 'true' },
  });
  const panel = createEl('div', {
    className: 'observation-create-overlay__panel',
    attrs: { role: 'dialog', 'aria-modal': 'true' },
  });
  const header = createEl('div', {
    className: 'observation-create-overlay__header',
  });
  const title = createEl('h3', {
    className: 'h5 mb-0',
    text: 'Neue Beobachtung',
  });
  const closeButton = createEl('button', {
    className: 'btn-close observation-create-overlay__close',
    attrs: { type: 'button', 'aria-label': 'Schließen' },
    dataset: { role: 'observation-create-close' },
  });
  header.append(title, closeButton);

  const inputLabel = createEl('label', {
    className: 'form-label text-muted small mb-0',
    text: 'Beobachtung',
  });
  const input = createEl('input', {
    className: 'form-control',
    attrs: {
      type: 'text',
      placeholder: 'Neue Beobachtung…',
      autocomplete: 'off',
    },
    dataset: { role: 'observation-create-input' },
  });

  const groupsTitle = createEl('p', {
    className: 'text-muted small mb-0',
    text: 'Gruppen',
  });
  const groupButtons = createEl('div', {
    className: 'd-flex flex-wrap gap-2 observation-create-groups',
    dataset: { role: 'observation-create-groups' },
  });

  OBSERVATION_GROUP_CODES.forEach((code) => {
    const entry = observationGroups?.[code];
    const label = entry?.label || code;
    const color = entry?.color || '#6c757d';
    const button = createEl('button', {
      className: 'btn observation-create-group-toggle',
      attrs: { type: 'button', style: `--group-color: ${color};` },
      dataset: { role: 'observation-create-group', value: code },
      text: label,
    });
    groupButtons.appendChild(button);
  });

  const previewTitle = createEl('p', {
    className: 'text-muted small mb-0',
    text: 'Vorschau',
  });
  const previewDots = createEl('span', {
    className: 'observation-group-dots',
    dataset: { role: 'observation-create-preview-dots' },
  });
  const previewText = createEl('span', {
    dataset: { role: 'observation-create-preview-text' },
  });
  const previewPill = createEl('span', {
    className:
      'badge rounded-pill text-bg-secondary d-inline-flex align-items-center tag-badge observation-pill',
    dataset: { role: 'observation-create-preview-pill' },
    children: [previewDots, previewText],
  });
  const previewEmpty = createEl('p', {
    className: 'text-muted small mb-0',
    text: 'Vorschau erscheint hier.',
    dataset: { role: 'observation-create-preview-empty' },
  });
  previewPill.hidden = true;

  const actions = createEl('div', {
    className: 'd-flex flex-wrap gap-2',
    children: [
      createEl('button', {
        className: 'btn btn-primary',
        text: 'Speichern',
        attrs: { type: 'submit' },
        dataset: { role: 'observation-create-save' },
      }),
      createEl('button', {
        className: 'btn btn-outline-secondary',
        text: 'Abbrechen',
        attrs: { type: 'button' },
        dataset: { role: 'observation-create-cancel' },
      }),
    ],
  });

  const form = createEl('form', {
    className: 'd-flex flex-column gap-3',
    dataset: { role: 'observation-create-form' },
    children: [
      inputLabel,
      input,
      groupsTitle,
      groupButtons,
      previewTitle,
      previewPill,
      previewEmpty,
      actions,
    ],
  });

  const content = createEl('div', {
    className: 'observation-create-overlay__content',
    children: [form],
  });

  panel.append(header, content);
  overlay.appendChild(panel);

  return {
    element: overlay,
  };
};

export const buildObservationsSection = ({
  children,
  observations,
  presets,
  observationStats,
  absentChildren,
  observationCatalog,
  observationGroups,
  savedObsFilters,
  readOnly = false,
  freeDayInfo = null,
}) => {
  const section = createEl('section', {
    className: 'card shadow-sm border-0',
  });
  const body = createEl('div', { className: 'card-body d-flex flex-column gap-3' });
  const absentSet = new Set(absentChildren || []);
  const observationGroupMap = buildObservationCatalogGroupMap(observationCatalog);
  const getGroupsForLabel = (label) =>
    observationGroupMap.get(normalizeObservationKey(label)) || [];
  const normalizedSavedFilters = normalizeSavedObservationFilters(
    savedObsFilters || DEFAULT_SAVED_OBSERVATION_FILTERS,
  );
  let currentSavedFilters = normalizedSavedFilters;
  let isReadOnly = Boolean(readOnly);
  let currentFreeDayInfo = freeDayInfo;
  let readOnlyNotice = null;

  const list = createEl('div', {
    className: 'd-flex flex-wrap gap-2 observation-child-list',
  });
  children.forEach((child) => {
    const isAbsent = absentSet.has(child);
    list.appendChild(
      rebuildChildButton({
        child,
        isAbsent,
        observationsByChild: observations,
        readOnly: isReadOnly,
      }),
    );
  });

  if (readOnly) {
    const label = freeDayInfo?.label || 'Schulfrei';
    readOnlyNotice = createEl('div', {
      className: 'alert alert-success mb-0',
      text: `Keine Eingaben möglich – ${label}`,
    });
    body.append(readOnlyNotice);
  }

  const overlay = createEl('div', {
    className: 'observation-overlay',
    dataset: { role: 'observation-overlay' },
    attrs: { 'aria-hidden': 'true' },
  });
  const overlayPanel = createEl('div', {
    className: 'observation-overlay__panel',
    attrs: { role: 'dialog', 'aria-modal': 'true' },
  });
  const overlayHeader = createEl('div', {
    className: 'observation-overlay__header',
  });
  const overlayTitle = createEl('h3', {
    className: 'h5 mb-0',
    text: 'Kind',
    dataset: { role: 'observation-child-title' },
  });
  const closeButton = createEl('button', {
    className: 'btn-close observation-overlay__close',
    attrs: { type: 'button', 'aria-label': 'Schließen' },
    dataset: { role: 'observation-close' },
  });
  overlayHeader.append(overlayTitle, closeButton);

  const overlayContent = createEl('div', {
    className: 'observation-overlay__content',
    dataset: { role: 'observation-detail-scroll' },
  });
  const templatesOverlay = buildObservationTemplatesOverlay({
    templates: presets,
    observationCatalog,
    observationGroups,
    savedFilters: normalizedSavedFilters,
  });
  const editOverlay = buildObservationEditOverlay({ observationGroups });
  const createOverlay = buildObservationCreateOverlay({ observationGroups });

  const detailRefs = new Map();

  children.forEach((child) => {
    const data = observations[child] || {};
    const topItems = buildTopItems(observationStats?.[child], observationCatalog);
    const isAbsent = absentSet.has(child);
    const { detail, refs } = createDetailPanel({
      child,
      isAbsent,
      topItems,
      observationGroups,
      getGroupsForLabel,
    });
    const nextToday = rebuildTodayList(data, getGroupsForLabel, observationGroups);
    nextToday.dataset.role = 'observation-today-list';
    refs.todayList.replaceWith(nextToday);
    refs.todayList = nextToday;
    refs.topList.dataset.role = 'observation-top-list';
    detail.dataset.child = child;
    detailRefs.set(child, refs);
    detail.hidden = true;
    overlayContent.appendChild(detail);
  });

  overlayPanel.append(
    overlayHeader,
    overlayContent,
    templatesOverlay.element,
    editOverlay.element,
    createOverlay.element,
  );
    overlay.appendChild(overlayPanel);

    body.append(list, overlay);
  section.appendChild(body);

  const updateChildDetail = ({
    child,
    data,
    topItems,
    isAbsent,
    getGroupsForLabel,
    observationGroups,
  }) => {
    const detail = overlayContent.querySelector(`[data-child="${child}"]`);
    if (!detail) {
      const panel = createDetailPanel({
        child,
        isAbsent,
        topItems,
        observationGroups,
        getGroupsForLabel,
      });
      panel.detail.hidden = true;
      detailRefs.set(child, panel.refs);
      overlayContent.appendChild(panel.detail);
      return;
    }
    const refs = detailRefs.get(child);
    if (!refs) {
      return;
    }
    detail.dataset.absent = isAbsent ? 'true' : 'false';
    if (refs.absentNotice) {
      refs.absentNotice.remove();
    }

    const nextTop = rebuildTopList(topItems, getGroupsForLabel, observationGroups);
    nextTop.dataset.role = 'observation-top-list';
    refs.topList.replaceWith(nextTop);
    refs.topList = nextTop;

    const nextToday = rebuildTodayList(data, getGroupsForLabel, observationGroups);
    nextToday.dataset.role = 'observation-today-list';
    refs.todayList.replaceWith(nextToday);
    refs.todayList = nextToday;

    const isHidden = Boolean(isAbsent);
    refs.topList.hidden = isHidden;
    refs.todayTitle.hidden = isHidden;
    refs.todayList.hidden = isHidden;
    refs.actionRow.hidden = isHidden;
    refs.feedback.hidden = isHidden;
    refs.todaySection.hidden = isHidden;
    refs.addSection.hidden = isHidden;

    if (isAbsent) {
      const notice = createEl('p', {
        className: 'text-muted small mb-0',
        text: 'Abwesend – Beobachtungen deaktiviert.',
        dataset: { role: 'observation-absent-notice' },
      });
      detail.append(notice);
      refs.absentNotice = notice;
    } else if (refs.absentNotice) {
      refs.absentNotice.remove();
      refs.absentNotice = null;
    }
  };

  const refs = {
    list,
    overlay,
    overlayPanel,
    overlayContent,
    overlayTitle,
    closeButton,
    templatesOverlay: templatesOverlay.element,
    editOverlay: editOverlay.element,
    createOverlay: createOverlay.element,
  };

  const update = ({
    nextChildren,
    nextObservations,
    nextObservationStats,
    nextAbsentChildren,
    nextObservationCatalog,
    nextObservationGroups,
    nextObservationPresets,
    nextSavedObsFilters,
    readOnly: nextReadOnly = false,
    freeDayInfo: nextFreeDayInfo = null,
  }) => {
    if (nextSavedObsFilters) {
      currentSavedFilters = normalizeSavedObservationFilters(
        nextSavedObsFilters || DEFAULT_SAVED_OBSERVATION_FILTERS,
      );
    }
    const templateContent = refs.templatesOverlay.querySelector(
      '.observation-templates-overlay__content',
    );
    const pendingScrollValue = refs.templatesOverlay.dataset.pendingScrollTop;
    const pendingScrollTop = pendingScrollValue ? Number(pendingScrollValue) : null;
    const previousScrollTop =
      typeof pendingScrollTop === 'number' && Number.isFinite(pendingScrollTop)
        ? pendingScrollTop
        : templateContent
          ? templateContent.scrollTop
          : 0;
    delete refs.templatesOverlay.dataset.pendingScrollTop;

    const absentSetNext = new Set(nextAbsentChildren || []);
    const observationGroupMapNext = buildObservationCatalogGroupMap(nextObservationCatalog);
    const getGroupsForLabelNext = (label) =>
      observationGroupMapNext.get(normalizeObservationKey(label)) || [];

    const shouldBeReadOnly = Boolean(nextReadOnly);
    const nextLabel = nextFreeDayInfo?.label || 'Schulfrei';
    if (shouldBeReadOnly && !readOnlyNotice) {
      readOnlyNotice = createEl('div', {
        className: 'alert alert-success mb-0',
        text: `Keine Eingaben möglich – ${nextLabel}`,
      });
      body.insertBefore(readOnlyNotice, list);
    } else if (!shouldBeReadOnly && readOnlyNotice) {
      readOnlyNotice.remove();
      readOnlyNotice = null;
    } else if (shouldBeReadOnly && readOnlyNotice) {
      readOnlyNotice.textContent = `Keine Eingaben möglich – ${nextLabel}`;
    }
    isReadOnly = shouldBeReadOnly;
    currentFreeDayInfo = nextFreeDayInfo;

    list.replaceChildren(
      ...nextChildren.map((child) =>
        rebuildChildButton({
          child,
          isAbsent: absentSetNext.has(child),
          observationsByChild: nextObservations,
          readOnly: isReadOnly,
        }),
      ),
    );

    nextChildren.forEach((child) => {
      const data = nextObservations[child] || {};
      const topItems = buildTopItems(nextObservationStats?.[child], nextObservationCatalog);
      updateChildDetail({
        child,
        data,
        topItems,
        isAbsent: absentSetNext.has(child),
        getGroupsForLabel: getGroupsForLabelNext,
        observationGroups: nextObservationGroups,
      });
    });

    const isTemplateOpen =
      overlayPanel.classList.contains('is-template-open') ||
      refs.templatesOverlay?.dataset.isOpen === 'true';

    if (!isTemplateOpen && Array.isArray(nextObservationPresets)) {
      const refreshed = buildObservationTemplatesOverlay({
        templates: nextObservationPresets,
        observationCatalog: nextObservationCatalog,
        observationGroups: nextObservationGroups,
        savedFilters: currentSavedFilters,
      });
      if (refreshed?.element) {
        const nextPanel = refreshed.element.querySelector(
          '.observation-templates-overlay__panel',
        );
        const currentPanel = refs.templatesOverlay.querySelector(
          '.observation-templates-overlay__panel',
        );
        const nextHeader = nextPanel?.querySelector(
          '.observation-templates-overlay__header',
        );
        const currentHeader = currentPanel?.querySelector(
          '.observation-templates-overlay__header',
        );
        if (currentHeader && nextHeader) {
          currentHeader.replaceChildren(...nextHeader.children);
        }
        const nextContent = nextPanel?.querySelector(
          '.observation-templates-overlay__content',
        );
        const currentContent = currentPanel?.querySelector(
          '.observation-templates-overlay__content',
        );
        if (currentContent && nextContent) {
          const preservedScrollTop = currentContent.scrollTop;
          currentContent.replaceChildren(...nextContent.children);
          currentContent.scrollTop = preservedScrollTop;
        }
        const nextFilter =
          refreshed.element.dataset.templateFilter || refs.templatesOverlay.dataset.templateFilter;
        const nextQuery =
          refreshed.element.dataset.templateQuery || refs.templatesOverlay.dataset.templateQuery;
        const nextGroups =
          refreshed.element.dataset.templateGroups || refs.templatesOverlay.dataset.templateGroups;
        const nextGroupMode =
          refreshed.element.dataset.templateGroupMode ||
          refs.templatesOverlay.dataset.templateGroupMode;
        const nextMulti =
          refreshed.element.dataset.templateMulti || refs.templatesOverlay.dataset.templateMulti;
        const nextShowAlphabet =
          refreshed.element.dataset.templateShowAlphabet ||
          refs.templatesOverlay.dataset.templateShowAlphabet;
        const nextSettingsOpen =
          refreshed.element.dataset.templateSettingsOpen ||
          refs.templatesOverlay.dataset.templateSettingsOpen;
        Object.assign(refs.templatesOverlay.dataset, {
          templateFilter: nextFilter,
          templateQuery: nextQuery,
          templateGroups: nextGroups,
          templateGroupMode: nextGroupMode,
          templateMulti: nextMulti,
          templateShowAlphabet: nextShowAlphabet,
          templateSettingsOpen: nextSettingsOpen,
        });
      }
    } else if (isTemplateOpen) {
      // Debug logging to trace unexpected rebuilds that could reset scroll.
      // eslint-disable-next-line no-console
      console.debug('freilog: template-overlay/update-skip', {
        isTemplateOpen,
        preservedFilter: refs.templatesOverlay.dataset.templateFilter,
      });
    }

    if (templateContent) {
      templateContent.scrollTop = previousScrollTop;
      requestAnimationFrame(() => {
        templateContent.scrollTop = previousScrollTop;
      });
    }
  };

  return {
    element: section,
    refs,
    update,
  };
};
