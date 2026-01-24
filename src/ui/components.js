import { createEl } from './dom.js';
import {
  DEFAULT_SAVED_ANGEBOT_FILTERS,
  DEFAULT_SAVED_OBSERVATION_FILTERS,
  normalizeSavedAngebotFilters,
  normalizeSavedObservationFilters,
} from '../db/dbSchema.js';
import {
  OBSERVATION_GROUP_CODES,
  normalizeObservationKey,
  normalizeObservationGroups,
  normalizeObservationText,
} from '../utils/observationCatalog.js';
import {
  hasObservationNotes,
  normalizeObservationNoteList,
} from '../utils/observationNotes.js';
import { ANGEBOT_GROUP_CODES, normalizeAngebotKey } from '../utils/angebotCatalog.js';
import { ANGEBOT_NOTE_LIMIT } from '../utils/angebotNotes.js';
import { todayYmd } from '../utils/date.js';
import { UI_LABELS } from './labels.js';

export const buildHeader = ({
  selectedDate,
  showInitialActions = false,
  showExport = false,
  freeDayInfo = null,
}) => {
  const header = createEl('header', {
    className: 'bg-white shadow-sm rounded-4 px-3 py-3 sticky-top app-header',
  });

  const exportButton = createEl('button', {
    className: 'btn btn-outline-primary d-inline-flex align-items-center header-menu-btn',
    children: [
      createEl('span', { text: '⬇️' }),
      createEl('span', { className: 'visually-hidden', text: 'Exportieren' }),
    ],
    attrs: {
      type: 'button',
    },
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
  const prevDateButton = createEl('button', {
    className: 'btn btn-outline-primary header-date-nav-btn',
    attrs: { type: 'button', 'aria-label': 'Poprzedni dzień' },
    children: [createEl('span', { text: '«' })],
  });
  const dateInput = createEl('input', {
    className: 'form-control header-date-input',
    attrs: { type: 'date', value: selectedDate || todayYmd(), 'aria-label': 'Datum' },
  });
  const nextDateButton = createEl('button', {
    className: 'btn btn-outline-primary header-date-nav-btn',
    attrs: { type: 'button', 'aria-label': 'Następny dzień' },
    children: [createEl('span', { text: '»' })],
  });
  const dateGroup = createEl('div', {
    className: 'd-flex flex-wrap align-items-center gap-2 header-date',
    children: [prevDateButton, dateInput, nextDateButton],
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

  const actionsGroup = createEl('div', {
    className: 'd-flex align-items-center gap-2 header-actions flex-wrap',
    children: actionNodes,
  });

  const menuContainer = createEl('div', {
    className: 'header-menu-anchor',
    children: [showExport ? exportButton : null, menuButton].filter(Boolean),
  });

  const headerContent = createEl('div', {
    className:
      'd-flex flex-row flex-wrap align-items-center justify-content-between gap-3 header-content',
    children: [dateGroup, actionsGroup],
  });

  header.append(headerContent, menuContainer);

  return {
    element: header,
    refs: {
      dateInput,
      prevDateButton,
      nextDateButton,
      menuButton,
      exportButton: showExport ? exportButton : null,
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

export const buildDrawerContent = ({
  showExport = false,
  showDummy = true,
  showWeekly = false,
}) => {
  const actionsList = createEl('div', { className: 'd-flex flex-column gap-2' });
  const actionButton = (text, icon, attrs = {}) =>
    createEl('button', {
      className: 'btn btn-outline-primary d-inline-flex align-items-center gap-2',
      attrs: { type: 'button', ...attrs },
      children: [createEl('span', { text: icon }), createEl('span', { text })],
    });

  const weeklyTableButton = showWeekly ? actionButton(`${UI_LABELS.weeklyTable}...`, '📅') : null;
  const exportButton = showExport ? actionButton('DB Exportieren...', '⬇️') : null;
  const importButton = actionButton('DB importieren...', '⬆️');
  const dummyDataButton = showDummy ? actionButton('Dummy-Daten laden...', '🧪') : null;
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

  const settingsContent = createEl('div', { className: 'd-flex flex-column gap-2' });
  const angebotManageButton = actionButton(`${UI_LABELS.angebotManage}...`, '🛠️', {
    'data-role': 'angebot-manage-open',
  });
  const classButton = actionButton(`${UI_LABELS.classSettings}...`, '🎒', {
    'data-role': 'class-settings',
  });
  const freeDaysButton = actionButton(`${UI_LABELS.freeDays}...`, '🏖️', {
    'data-role': 'free-days-settings',
  });
  const timetableButton = actionButton(`${UI_LABELS.timetable}...`, '🗓️', {
    'data-role': 'timetable-settings',
  });
  const observationCatalogButton = actionButton('Beobachtungen...', '👀', {
    'data-role': 'observation-catalog-settings',
  });
  const geldsammlungenButton = actionButton(`${UI_LABELS.geldsammlungen}...`, '💶', {
    'data-role': 'geldsammlungen-settings',
  });
  settingsContent.append(
    observationCatalogButton,
    angebotManageButton,
    classButton,
    freeDaysButton,
    timetableButton,
    geldsammlungenButton,
  );

  const buildSection = (title, contentNode) => {
    const titleEl = createEl('h3', {
      className: 'h6 text-uppercase text-muted mb-1',
      text: title,
    });
    const body = createEl('div', {
      className: 'd-flex flex-column gap-2',
      children: [contentNode],
    });
    return createEl('section', {
      className: 'd-flex flex-column gap-2',
      children: [titleEl, body],
    });
  };

  const actionsSection = buildSection('Daten', actionsList);
  const settingsSection = buildSection('Einstellungen', settingsContent);

  return {
    nodes: [actionsSection, settingsSection],
    refs: {
      actions: {
        weeklyTableButton,
        exportButton,
        importButton,
        dummyDataButton,
        importInput,
      },
      settings: {
        angebotManageButton,
        classButton,
        freeDaysButton,
        timetableButton,
        observationCatalogButton,
        geldsammlungenButton,
      },
      sections: {
        actions: null,
        angebote: null,
        einstellungen: null,
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
  angebotNote = '',
  weekTheme = '',
  weekThemeWeekLabel = '',
  newValue,
  readOnly = false,
  freizeitModules = [],
  angebotModules = {},
}) => {
  const activeAngebote = Array.isArray(selectedAngebote) ? selectedAngebote : [];
  const safeModules = Array.isArray(freizeitModules) ? freizeitModules : [];
  const safeAssignments = angebotModules && typeof angebotModules === 'object' ? angebotModules : {};
  const normalizedWeekTheme = typeof weekTheme === 'string' ? weekTheme.trim() : '';
  const themeLabel = createEl('p', {
    className: 'angebot-week-theme__label text-muted small mb-1',
    text: UI_LABELS.themaDerWoche,
  });
  const themeValue = createEl('p', {
    className: 'angebot-week-theme__value mb-0',
    text: normalizedWeekTheme || 'Kein Thema der Woche festgelegt.',
  });
  if (!normalizedWeekTheme) {
    themeValue.classList.add('text-muted');
  }
  const weekMeta =
    typeof weekThemeWeekLabel === 'string' && weekThemeWeekLabel.trim()
      ? createEl('p', {
          className: 'angebot-week-theme__meta text-muted small mb-0',
          text: weekThemeWeekLabel.trim(),
        })
      : null;
  const weekThemeContent = createEl('div', {
    className: 'angebot-week-theme',
    children: weekMeta ? [themeLabel, themeValue, weekMeta] : [themeLabel, themeValue],
  });

  const openButton = createEl('button', {
    className: 'btn btn-outline-primary d-inline-flex align-items-center gap-2',
    attrs: { type: 'button' },
    dataset: { role: 'angebot-open' },
    children: [
      createEl('span', { text: '📋' }),
      createEl('span', { text: `${UI_LABELS.angebotToday}...` }),
    ],
  });

  const infoTitle = createEl('p', {
    className: 'text-muted small mb-1',
    text: 'Heute ausgewählt',
  });

  const modulesContainer = createEl('div', {
    className: 'd-flex flex-column gap-3',
    dataset: { role: 'angebot-list' },
  });

  // If there are modules, display offers grouped by module
  if (safeModules.length > 0) {
    safeModules.forEach((module) => {
      const moduleOffers = Array.isArray(safeAssignments[module.id]) ? safeAssignments[module.id] : [];
      if (moduleOffers.length === 0) {
        return;
      }

      // Module header
      const moduleHeader = createEl('div', {
        className: 'd-flex flex-column gap-2',
      });
      const moduleTitle = createEl('p', {
        className: 'text-muted small mb-0 fw-semibold',
        text: module.periodLabel || module.descriptor || `Modul ${module.index || ''}`,
      });
      moduleHeader.appendChild(moduleTitle);

      // Offers for this module
      const moduleOffersList = createEl('div', {
        className: 'd-flex flex-wrap gap-2',
      });
      moduleOffers.forEach((angebot) => {
        const pill = buildPill({
          label: angebot,
          removeLabel: `${angebot} entfernen`,
          removeRole: 'angebot-remove',
          value: angebot,
        });
        pill.dataset.moduleId = module.id;
        moduleOffersList.appendChild(pill);
      });
      moduleHeader.appendChild(moduleOffersList);
      modulesContainer.appendChild(moduleHeader);
    });
  } else {
    // Fallback: if no modules, display all offers in a flat list
    activeAngebote.forEach((angebot) => {
      const pill = buildPill({
        label: angebot,
        removeLabel: `${angebot} entfernen`,
        removeRole: 'angebot-remove',
        value: angebot,
      });
      modulesContainer.appendChild(pill);
    });
  }

  const content = createEl('div', {
    className: 'd-flex flex-column gap-3',
    children: [weekThemeContent, openButton, infoTitle, modulesContainer],
  });

  if (readOnly) {
    openButton.disabled = true;
  }

  const normalizedNote = typeof angebotNote === 'string' ? angebotNote : '';
  const hasNote = normalizedNote.trim().length > 0;
  const noteLabel = createEl('p', {
    className: 'text-muted small mb-1',
    text: 'Notizen',
  });
  const noteText = createEl('p', {
    className: 'angebot-note-text mb-0',
    text: normalizedNote,
  });
  const noteSection = createEl('div', {
    className: 'd-flex flex-column gap-1',
    children: [noteLabel, noteText],
  });
  noteSection.hidden = !hasNote;
  content.appendChild(noteSection);

  return {
    element: content,
    refs: {
      selectedList: modulesContainer,
      openButton,
    },
  };
};

export const buildAngebotOverlay = ({ angebotGroups }) => {
  const overlay = createEl('div', {
    className: 'observation-overlay angebot-overlay',
    dataset: { role: 'angebot-overlay' },
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
    text: UI_LABELS.angebotToday,
  });
  const closeButton = createEl('button', {
    className: 'btn-close observation-overlay__close',
    attrs: { type: 'button', 'aria-label': 'Schließen' },
    dataset: { role: 'angebot-close' },
  });
  overlayHeader.append(overlayTitle, closeButton);

  const overlayContent = createEl('div', {
    className: 'observation-overlay__content',
  });

  const todayTitle = createEl('p', {
    className: 'observation-section__title mb-0',
    text: UI_LABELS.angebotToday,
  });
  const modulesNav = createEl('ul', {
    className: 'nav nav-tabs angebot-modules-nav',
    dataset: { role: 'angebot-modules-nav' },
  });
  const modulesContent = createEl('div', {
    className: 'tab-content angebot-modules-content',
    dataset: { role: 'angebot-modules-content' },
  });
  const modulesEmpty = createEl('p', {
    className: 'text-muted small mb-0',
    dataset: { role: 'angebot-modules-empty' },
    text: 'Keine Freizeit-Module für heute.',
  });
  const todaySection = createEl('div', {
    className: 'observation-section',
    children: [todayTitle, modulesNav, modulesContent, modulesEmpty],
  });

  const addTitle = createEl('p', {
    className: 'observation-section__title mb-0',
    text: UI_LABELS.angebotAdd,
  });
  const topTitle = createEl('p', {
    className: 'observation-section__subtitle mb-0',
    text: 'Top 10',
  });
  const topList = createEl('div', {
    className: 'd-flex flex-wrap gap-2 small observation-top-list',
    dataset: { role: 'angebot-top-list' },
  });

  const catalogButton = createEl('button', {
    className:
      'observation-action-card observation-action-card--catalog observation-template-open',
    children: [
      createEl('span', {
        className: 'observation-action-icon',
        attrs: { 'aria-hidden': 'true' },
        text: '⌕',
      }),
      createEl('span', { className: 'observation-action-label', text: UI_LABELS.angebotCatalog }),
    ],
    attrs: { type: 'button' },
    dataset: { role: 'angebot-catalog-open' },
  });

  const createButton = createEl('button', {
    className: 'observation-action-card observation-action-card--create observation-create-open',
    children: [
      createEl('span', {
        className: 'observation-action-icon',
        attrs: { 'aria-hidden': 'true' },
        text: '+',
      }),
      createEl('span', { className: 'observation-action-label', text: UI_LABELS.angebotCreate }),
    ],
    attrs: { type: 'button' },
    dataset: { role: 'angebot-create-open' },
  });

  const actionRow = createEl('div', { className: 'observation-action-grid' });
  actionRow.append(catalogButton, createButton);

  const addSection = createEl('div', {
    className: 'observation-section observation-section--add d-flex flex-column gap-2',
    children: [addTitle, topTitle, topList, actionRow],
  });

  const noteLabel = createEl('label', {
    className: 'form-label mb-0',
    text: 'Notizen',
  });
  const noteInput = createEl('textarea', {
    className: 'form-control',
    attrs: {
      rows: '3',
      placeholder: 'Notizen',
      'aria-label': 'Notizen',
      maxlength: String(ANGEBOT_NOTE_LIMIT),
    },
    dataset: { role: 'angebot-note-input' },
  });
  const noteSection = createEl('div', {
    className: 'observation-section observation-section--notes d-flex flex-column gap-2',
    children: [noteLabel, noteInput],
  });

  overlayContent.append(todaySection, addSection, noteSection);
  overlayPanel.append(overlayHeader, overlayContent);
  overlay.appendChild(overlayPanel);

  return {
    element: overlay,
    refs: {
      overlayPanel,
      modulesNav,
      modulesContent,
      modulesEmpty,
      topList,
      noteInput,
      noteSection,
      catalogButton,
      createButton,
      closeButton,
    },
  };
};

export const buildAngebotCatalogOverlay = ({
  angebotGroups,
  savedFilters,
  title = UI_LABELS.angebotCatalog,
  role = 'angebot-catalog-overlay',
  closeRole = 'angebot-catalog-close',
  searchAriaLabel = `${UI_LABELS.angebotCatalog} durchsuchen`,
  showCreateButton = false,
  createButtonLabel = UI_LABELS.angebotCreate,
  createButtonRole = 'angebot-create-open',
  manageTabs = false,
  weekThemeLabel = UI_LABELS.themaDerWoche,
}) => {
  const normalizedSavedFilters = normalizeSavedAngebotFilters(
    savedFilters || DEFAULT_SAVED_ANGEBOT_FILTERS,
  );
  const normalizedSelectedGroups = normalizeObservationGroups(
    normalizedSavedFilters.selectedGroups,
  ).filter((group) => group !== 'SCHWARZ');

  const weekThemeDatalistId = manageTabs ? `${role}-week-theme-options` : '';
  const overlayDataset = {
    role,
    angebotFilter: normalizedSavedFilters.selectedLetter || 'ALL',
    angebotQuery: '',
    angebotGroups: normalizedSelectedGroups.join(','),
    angebotGroupMode: normalizedSavedFilters.andOrMode === 'OR' ? 'OR' : 'AND',
    angebotMulti: normalizedSavedFilters.multiGroups ? 'true' : 'false',
    angebotShowAndOr: normalizedSavedFilters.showAndOr ? 'true' : 'false',
    angebotShowAlphabet: normalizedSavedFilters.showAlphabet ? 'true' : 'false',
    angebotSettingsOpen: 'false',
  };
  if (manageTabs) {
    overlayDataset.manageTab = 'catalog';
    overlayDataset.weekThemeDatalistId = weekThemeDatalistId;
  }

  const overlay = createEl('div', {
    className: 'angebot-catalog-overlay observation-templates-overlay',
    dataset: overlayDataset,
    attrs: { 'aria-hidden': 'true' },
  });

  const panel = createEl('div', {
    className: 'observation-templates-overlay__panel',
    attrs: { role: 'dialog', 'aria-modal': 'true' },
  });
  const header = createEl('div', {
    className: 'observation-templates-overlay__header',
  });
  const titleEl = createEl('h3', {
    className: 'h5 mb-0',
    text: title,
  });
  const closeButton = createEl('button', {
    className: 'btn-close observation-templates-overlay__close',
    attrs: { type: 'button', 'aria-label': 'Schließen' },
    dataset: { role: closeRole },
  });
  const headerActions = createEl('div', {
    className: 'd-flex align-items-center gap-2',
  });
  if (showCreateButton) {
    headerActions.append(
      createEl('button', {
        className: 'btn btn-outline-primary btn-sm d-inline-flex align-items-center gap-2',
        attrs: { type: 'button' },
        dataset: { role: createButtonRole },
        children: [createEl('span', { text: '＋' }), createEl('span', { text: createButtonLabel })],
      }),
    );
  }
  headerActions.append(closeButton);
  header.append(titleEl, headerActions);

  const groupFilterBar = createEl('div', {
    className: 'observation-templates__group-dots',
  });

  const addGroupButton = (code) => {
    const color =
      angebotGroups && angebotGroups[code]?.color
        ? angebotGroups[code].color
        : '#6c757d';
    const label =
      angebotGroups && angebotGroups[code]?.label ? angebotGroups[code].label : code;
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
      dataset: { role: 'angebot-group-filter', value: code },
    });
    groupFilterBar.appendChild(button);
  };

  ANGEBOT_GROUP_CODES.forEach((code) => addGroupButton(code));

  const groupModeToggle = createEl('div', {
    className: 'observation-templates__group-mode',
    attrs: { role: 'group', 'aria-label': 'Gruppenfilter Modus' },
    dataset: { role: 'angebot-group-mode-toggle' },
  });

  const addGroupModeButton = (label, value, isActive = false) => {
    const button = createEl('button', {
      className: `observation-templates__mode-btn${isActive ? ' active' : ''}`,
      text: label,
      attrs: {
        type: 'button',
        'aria-pressed': isActive ? 'true' : 'false',
      },
      dataset: { role: 'angebot-group-mode', value },
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
    dataset: { role: 'angebot-letter-bar' },
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
      dataset: { role: 'angebot-letter', value },
    });
    filterBar.appendChild(button);
  };

  addFilterButton('Alle', 'ALL', normalizedSavedFilters.selectedLetter === 'ALL');

  const searchInput = createEl('input', {
    className: 'form-control form-control-sm observation-templates__search',
    attrs: {
      type: 'search',
      placeholder: 'Suchen...',
      autocomplete: 'off',
      'aria-label': searchAriaLabel,
    },
    dataset: { role: 'angebot-search' },
  });

  const settingsToggle = createEl('button', {
    className: 'btn btn-link observation-templates__settings-btn',
    attrs: { type: 'button', 'aria-label': 'Einstellungen' },
    dataset: { role: 'angebot-settings-toggle' },
    children: [createEl('span', { text: '⚙️' })],
  });

  const multiSwitch = createEl('label', {
    className: 'form-check form-switch observation-templates__setting-option',
    children: [
      createEl('span', { className: 'form-check-label', text: 'Mehrere Gruppen auswählen' }),
      createEl('input', {
        className: 'form-check-input',
        attrs: { type: 'checkbox', role: 'switch', id: 'angebot-multi-switch' },
        dataset: { role: 'angebot-multi-switch' },
      }),
    ],
  });

  const andOrSwitch = createEl('label', {
    className: 'form-check form-switch observation-templates__setting-option',
    children: [
      createEl('span', { className: 'form-check-label', text: 'UND/ODER anzeigen' }),
      createEl('input', {
        className: 'form-check-input',
        attrs: { type: 'checkbox', role: 'switch', id: 'angebot-andor-switch' },
        dataset: { role: 'angebot-andor-switch' },
      }),
    ],
  });

  const alphabetSwitch = createEl('label', {
    className: 'form-check form-switch observation-templates__setting-option',
    children: [
      createEl('span', { className: 'form-check-label', text: 'Buchstaben-Filter anzeigen' }),
      createEl('input', {
        className: 'form-check-input',
        attrs: { type: 'checkbox', role: 'switch', id: 'angebot-alphabet-switch' },
        dataset: { role: 'angebot-alphabet-switch' },
      }),
    ],
  });

  const settingsPanel = createEl('div', {
    className: 'observation-templates__settings-panel',
    dataset: { role: 'angebot-settings-panel' },
    children: [multiSwitch, andOrSwitch, alphabetSwitch],
  });
  settingsPanel.hidden = true;

  const settings = createEl('div', {
    className: 'observation-templates__settings',
    children: [settingsToggle, settingsPanel],
  });

  const filterRow = createEl('div', {
    className: 'observation-templates__filters-shell',
    children: [
      createEl('div', {
        className: 'observation-templates__filter-row',
        children: [groupControls, settings],
      }),
      filterBar,
      createEl('div', {
        className: 'observation-templates__search-row',
        children: [searchInput],
      }),
    ],
  });

  const catalogList = createEl('div', {
    className: 'd-flex flex-column gap-3 observation-templates__list',
    dataset: { role: 'angebot-catalog-list' },
  });

  const catalogPaneContent = createEl('div', {
    className: 'mt-3 d-flex flex-column gap-3',
    children: [filterRow, catalogList],
  });

  const buildManageTabsContent = () => {
    const tabsNav = createEl('ul', {
      className: 'nav nav-tabs angebot-manage-tabs',
      attrs: { role: 'tablist' },
      dataset: { role: 'angebot-manage-tabs-nav' },
    });
    const tabContent = createEl('div', {
      className: 'tab-content angebot-manage-tabs-content',
    });

    const addTab = (tabId, label, isActive = false) => {
      const tabButton = createEl('button', {
        className: `nav-link${isActive ? ' active' : ''}`,
        text: label,
        attrs: {
          type: 'button',
          role: 'tab',
          'aria-selected': isActive ? 'true' : 'false',
        },
        dataset: { role: 'angebot-manage-tab', tab: tabId },
      });
      const tabItem = createEl('li', {
        className: 'nav-item',
        attrs: { role: 'presentation' },
        children: [tabButton],
      });
      tabsNav.append(tabItem);
      return tabButton;
    };

    addTab('catalog', 'Katalog', true);
    addTab('week-theme', weekThemeLabel, false);

    const catalogPane = createEl('div', {
      className: 'tab-pane fade show active',
      attrs: { role: 'tabpanel' },
      dataset: { role: 'angebot-manage-tab-pane', tab: 'catalog' },
      children: [catalogPaneContent],
    });

    const yearSelect = createEl('select', {
      className: 'form-select form-select-sm',
      dataset: { role: 'angebot-week-theme-year-select' },
    });
    const yearRow = createEl('div', {
      className: 'angebot-week-theme__year-row d-flex align-items-center gap-2 flex-wrap',
      dataset: { role: 'angebot-week-theme-year-row' },
      children: [
        createEl('label', {
          className: 'form-label mb-0 small text-muted',
          text: 'Schuljahr',
        }),
        yearSelect,
      ],
    });
    const emptyState = createEl('div', {
      className: 'alert alert-light border d-none mb-0',
      dataset: { role: 'angebot-week-theme-empty' },
      text: 'Keine Schulwochen im aktuellen Zeitraum gefunden.',
    });
    const weekList = createEl('div', {
      className: 'angebot-week-theme__list d-flex flex-column gap-2',
      dataset: { role: 'angebot-week-theme-list' },
    });
    const hint = createEl('p', {
      className: 'text-muted small mb-0',
      text: 'Wenn Montag bis Freitag schulfrei sind, ist keine Zuweisung möglich.',
    });
    const weekThemeDatalist = createEl('datalist', {
      attrs: { id: weekThemeDatalistId },
      dataset: { role: 'angebot-week-theme-datalist' },
    });
    const weekThemePaneContent = createEl('div', {
      className: 'mt-3 d-flex flex-column gap-3',
      children: [yearRow, emptyState, weekList, hint, weekThemeDatalist],
    });
    const weekThemePane = createEl('div', {
      className: 'tab-pane fade',
      attrs: { role: 'tabpanel' },
      dataset: { role: 'angebot-manage-tab-pane', tab: 'week-theme' },
      children: [weekThemePaneContent],
    });

    tabContent.append(catalogPane, weekThemePane);

    return [tabsNav, tabContent];
  };

  const content = createEl('div', {
    className: 'observation-templates-overlay__content',
    children: manageTabs ? buildManageTabsContent() : [catalogPaneContent],
  });

  panel.append(header, content);
  overlay.appendChild(panel);

  return {
    element: overlay,
    refs: {
      closeButton,
      content,
      catalogList,
      searchInput,
      settingsPanel,
      settingsToggle,
      letterBar: filterBar,
      groupDots: groupFilterBar,
      groupModeToggle,
    },
  };
};

export const buildAngebotDetailOverlay = ({ angebotGroups }) => {
  const overlay = createEl('div', {
    className: 'angebot-detail-overlay observation-create-overlay',
    dataset: { role: 'angebot-detail-overlay' },
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
    text: 'Angebot',
  });
  const closeButton = createEl('button', {
    className: 'btn-close observation-create-overlay__close',
    attrs: { type: 'button', 'aria-label': 'Schließen' },
    dataset: { role: 'angebot-detail-close' },
  });
  header.append(title, closeButton);

  const previewDots = createEl('span', {
    className: 'observation-group-dots',
    dataset: { role: 'angebot-detail-dots' },
  });
  const previewText = createEl('span', {
    dataset: { role: 'angebot-detail-text' },
  });
  const previewPill = createEl('span', {
    className:
      'badge rounded-pill text-bg-secondary d-inline-flex align-items-center tag-badge observation-pill',
    children: [previewDots, previewText],
  });

  const input = createEl('input', {
    className: 'form-control',
    attrs: { type: 'text', placeholder: 'Angebotstitel...' },
    dataset: { role: 'angebot-detail-input' },
  });

  const inputLabel = createEl('label', {
    className: 'form-label text-muted small mb-0',
    text: 'Angebot',
  });

  const groupsTitle = createEl('p', {
    className: 'text-muted small mb-0',
    text: 'Gruppen',
  });

  const groupButtons = createEl('div', {
    className: 'd-flex flex-wrap gap-2 observation-create-groups',
    dataset: { role: 'angebot-detail-groups' },
  });

  ANGEBOT_GROUP_CODES.forEach((code) => {
    const entry = angebotGroups?.[code];
    const label = entry?.label || code;
    const color = entry?.color || '#6c757d';
    const button = createEl('button', {
      className: 'btn observation-create-group-toggle',
      attrs: { type: 'button', style: `--group-color: ${color};` },
      dataset: { role: 'angebot-detail-group', value: code },
      text: label,
    });
    groupButtons.appendChild(button);
  });

  const actions = createEl('div', {
    className: 'd-flex flex-wrap gap-2',
    children: [
      createEl('button', {
        className: 'btn btn-primary',
        text: 'Speichern',
        attrs: { type: 'submit' },
        dataset: { role: 'angebot-detail-save' },
      }),
      createEl('button', {
        className: 'btn btn-outline-secondary',
        text: 'Abbrechen',
        attrs: { type: 'button' },
        dataset: { role: 'angebot-detail-cancel' },
      }),
      createEl('button', {
        className: 'btn btn-danger',
        text: 'Löschen',
        attrs: { type: 'button' },
        dataset: { role: 'angebot-detail-delete' },
      }),
    ],
  });

  const form = createEl('form', {
    className: 'd-flex flex-column gap-3',
    dataset: { role: 'angebot-detail-form' },
    children: [previewPill, inputLabel, input, groupsTitle, groupButtons, actions],
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

export const buildAngebotDeleteConfirm = () => {
  const overlay = createEl('div', {
    className: 'class-settings-confirm angebot-delete-confirm d-none',
    dataset: { role: 'angebot-delete-confirm-overlay' },
    attrs: {
      role: 'dialog',
      'aria-modal': 'true',
      'aria-labelledby': 'angebot-delete-confirm-title',
      'aria-describedby': 'angebot-delete-confirm-message',
      'aria-hidden': 'true',
      tabIndex: '-1',
    },
  });
  const panel = createEl('div', {
    className: 'class-settings-confirm__panel',
  });
  const title = createEl('h3', {
    className: 'h5 mb-2',
    attrs: { id: 'angebot-delete-confirm-title' },
    text: 'Angebot löschen?',
  });
  const message = createEl('p', {
    className: 'text-muted mb-3',
    attrs: { id: 'angebot-delete-confirm-message' },
    text: '',
    dataset: { role: 'angebot-delete-confirm-message' },
  });
  const inputLabel = createEl('label', {
    className: 'form-label text-muted small mb-0',
    text: 'Bestätigung',
    attrs: { for: 'angebot-delete-confirm-input' },
  });
  const input = createEl('input', {
    className: 'form-control',
    attrs: {
      id: 'angebot-delete-confirm-input',
      type: 'text',
      autocomplete: 'off',
      placeholder: 'ja',
    },
    dataset: { role: 'angebot-delete-confirm-input' },
  });
  const actions = createEl('div', {
    className: 'class-settings-confirm__actions',
    children: [
      createEl('button', {
        className: 'btn btn-danger',
        text: 'Angebot löschen',
        attrs: { type: 'button' },
        dataset: { role: 'angebot-delete-confirm' },
      }),
      createEl('button', {
        className: 'btn btn-outline-secondary',
        text: 'Abbrechen',
        attrs: { type: 'button' },
        dataset: { role: 'angebot-delete-cancel' },
      }),
    ],
  });
  panel.append(title, message, inputLabel, input, actions);
  overlay.appendChild(panel);
  return { element: overlay };
};

export const buildAngebotCreateOverlay = ({ angebotGroups }) => {
  const overlay = createEl('div', {
    className: 'angebot-create-overlay observation-create-overlay',
    dataset: { role: 'angebot-create-overlay' },
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
    text: UI_LABELS.angebotCreate,
  });
  const closeButton = createEl('button', {
    className: 'btn-close observation-create-overlay__close',
    attrs: { type: 'button', 'aria-label': 'Schließen' },
    dataset: { role: 'angebot-create-close' },
  });
  header.append(title, closeButton);

  const inputLabel = createEl('label', {
    className: 'form-label text-muted small mb-0',
    text: 'Angebot',
  });
  const input = createEl('input', {
    className: 'form-control',
    attrs: {
      type: 'text',
      placeholder: `${UI_LABELS.angebotCreate}…`,
      autocomplete: 'off',
    },
    dataset: { role: 'angebot-create-input' },
  });

  const groupsTitle = createEl('p', {
    className: 'text-muted small mb-0',
    text: 'Gruppen',
  });
  const groupButtons = createEl('div', {
    className: 'd-flex flex-wrap gap-2 observation-create-groups',
    dataset: { role: 'angebot-create-groups' },
  });

  ANGEBOT_GROUP_CODES.forEach((code) => {
    const entry = angebotGroups?.[code];
    const label = entry?.label || code;
    const color = entry?.color || '#6c757d';
    const button = createEl('button', {
      className: 'btn observation-create-group-toggle',
      attrs: { type: 'button', style: `--group-color: ${color};` },
      dataset: { role: 'angebot-create-group', value: code },
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
    dataset: { role: 'angebot-create-preview-dots' },
  });
  const previewText = createEl('span', {
    dataset: { role: 'angebot-create-preview-text' },
  });
  const previewPill = createEl('span', {
    className:
      'badge rounded-pill text-bg-secondary d-inline-flex align-items-center tag-badge observation-pill',
    dataset: { role: 'angebot-create-preview-pill' },
    children: [previewDots, previewText],
  });
  const previewEmpty = createEl('p', {
    className: 'text-muted small mb-0',
    text: 'Vorschau erscheint hier.',
    dataset: { role: 'angebot-create-preview-empty' },
  });
  previewPill.hidden = true;

  const actions = createEl('div', {
    className: 'd-flex flex-wrap gap-2',
    children: [
      createEl('button', {
        className: 'btn btn-primary',
        text: 'Speichern',
        attrs: { type: 'submit' },
        dataset: { role: 'angebot-create-save' },
      }),
      createEl('button', {
        className: 'btn btn-outline-secondary',
        text: 'Abbrechen',
        attrs: { type: 'button' },
        dataset: { role: 'angebot-create-cancel' },
      }),
    ],
  });

  const form = createEl('form', {
    className: 'd-flex flex-column gap-3',
    dataset: { role: 'angebot-create-form' },
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

export const buildAngebotEditOverlay = ({ angebotGroups }) => {
  const overlay = createEl('div', {
    className: 'angebot-edit-overlay observation-edit-overlay angebot-edit-overlay--global',
    dataset: { role: 'angebot-edit-overlay' },
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
    text: 'Angebot bearbeiten',
  });
  const headerActions = createEl('div', {
    className: 'd-flex flex-wrap gap-2',
    children: [
      createEl('button', {
        className: 'btn btn-primary',
        text: 'Speichern',
        attrs: { type: 'submit' },
        dataset: { role: 'angebot-edit-save' },
      }),
      createEl('button', {
        className: 'btn btn-outline-secondary',
        text: 'Abbrechen',
        attrs: { type: 'button' },
        dataset: { role: 'angebot-edit-cancel' },
      }),
    ],
  });
  const closeButton = createEl('button', {
    className: 'btn-close observation-edit-overlay__close',
    attrs: { type: 'button', 'aria-label': 'Schließen' },
    dataset: { role: 'angebot-edit-close' },
  });
  header.append(title, headerActions, closeButton);

  const input = createEl('input', {
    className: 'form-control',
    attrs: { type: 'text', placeholder: 'Angebotstitel...' },
    dataset: { role: 'angebot-edit-input' },
  });

  const inputLabel = createEl('label', {
    className: 'form-label text-muted small mb-0',
    text: 'Angebot',
  });

  const groupsTitle = createEl('p', {
    className: 'text-muted small mb-0',
    text: 'Gruppen',
  });

  const groupButtons = createEl('div', {
    className: 'd-flex flex-wrap gap-2 observation-create-groups',
    dataset: { role: 'angebot-edit-groups' },
  });

  ANGEBOT_GROUP_CODES.forEach((code) => {
    const entry = angebotGroups?.[code];
    const label = entry?.label || code;
    const color = entry?.color || '#6c757d';
    const button = createEl('button', {
      className: 'btn observation-create-group-toggle',
      attrs: { type: 'button', style: `--group-color: ${color};` },
      dataset: { role: 'angebot-edit-group', value: code },
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
    dataset: { role: 'angebot-edit-form' },
    children: [header, content],
  });

  panel.appendChild(form);
  overlay.appendChild(panel);

  return { element: overlay };
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

const buildTopItems = (stats, catalog, options = {}) => {
  const { excludeKeys = new Set(), limit = 10 } = options;
  const normalizedExclude =
    excludeKeys instanceof Set
      ? excludeKeys
      : new Set(
          (Array.isArray(excludeKeys) ? excludeKeys : [])
            .map((key) => normalizeObservationKey(key))
            .filter(Boolean),
        );
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
    .filter(({ label }) => !normalizedExclude.has(normalizeObservationKey(label)))
    .slice(0, Number.isFinite(limit) && limit > 0 ? limit : 10);
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
    const text =
      typeof entry === 'string'
        ? entry.trim()
        : typeof entry?.text === 'string'
          ? entry.text.trim()
          : '';
    if (!text) {
      return;
    }
    catalogGroups.set(
      normalizeObservationKey(text),
      normalizeObservationGroups(entry?.groups || []),
    );
  });

  return normalized
    .map((item) => {
      if (typeof item === 'string') {
        const text = item.trim();
        if (!text) {
          return null;
        }
        return {
          text,
          groups: catalogGroups.get(normalizeObservationKey(text)) || [],
        };
      }
      if (item && typeof item === 'object') {
        const text = typeof item.text === 'string' ? item.text.trim() : '';
        if (!text) {
          return null;
        }
        const normalizedGroups = normalizeObservationGroups(item.groups || []);
        const mergedGroups = normalizeObservationGroups([
          ...(catalogGroups.get(normalizeObservationKey(text)) || []),
          ...normalizedGroups,
        ]);
        return {
          text,
          groups: mergedGroups,
        };
      }
      return null;
    })
    .filter(Boolean);
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

export const buildObservationTemplatesOverlay = ({
  templates,
  observationCatalog,
  observationGroups,
  savedFilters,
  title = UI_LABELS.observationCatalog,
  role = 'observation-templates-overlay',
  className = 'observation-templates-overlay',
  closeRole = 'observation-template-close',
  showCreateButton = false,
  createButtonLabel = UI_LABELS.observationCreate,
  createButtonRole = 'observation-create-open',
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
    className,
    dataset: {
      role,
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
  const titleEl = createEl('h3', {
    className: 'h5 mb-0',
    text: title,
  });
  const closeButton = createEl('button', {
    className: 'btn-close observation-templates-overlay__close',
    attrs: { type: 'button', 'aria-label': 'Schließen' },
    dataset: { role: closeRole },
  });
  const headerActions = createEl('div', {
    className: 'd-flex align-items-center gap-2',
  });
  if (showCreateButton) {
    headerActions.append(
      createEl('button', {
        className: 'btn btn-outline-primary btn-sm d-inline-flex align-items-center gap-2',
        attrs: { type: 'button' },
        dataset: { role: createButtonRole },
        children: [
          createEl('span', { text: '＋' }),
          createEl('span', { text: createButtonLabel }),
        ],
      }),
    );
  }
  headerActions.append(closeButton);
  header.append(titleEl, headerActions);

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
      'aria-label': `${UI_LABELS.observationCatalog} durchsuchen`,
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

export const buildObservationAssignOverlay = ({ readOnly = false } = {}) => {
  const overlay = createEl('div', {
    className: 'observation-templates-overlay observation-assign-overlay',
    dataset: { role: 'observation-assign-overlay' },
    attrs: { 'aria-hidden': 'true' },
  });
  const overlayPanel = createEl('div', {
    className: 'observation-templates-overlay__panel',
    attrs: { role: 'dialog', 'aria-modal': 'true' },
  });
  const header = createEl('div', {
    className: 'observation-templates-overlay__header',
  });
  const titleEl = createEl('h3', {
    className: 'h5 mb-0',
    text: 'Kinder zuweisen',
  });
  const closeButton = createEl('button', {
    className: 'btn-close observation-templates-overlay__close',
    attrs: { type: 'button', 'aria-label': 'Schließen' },
    dataset: { role: 'observation-assign-close' },
  });
  header.append(titleEl, closeButton);

  const observationLabel = createEl('p', {
    className: 'text-muted small mb-0',
    dataset: { role: 'observation-assign-observation' },
  });
  const noteOpenButton = createEl('button', {
    className: 'btn btn-outline-secondary observation-assign-note-open align-self-start',
    text: 'Notiz...',
    attrs: { type: 'button', disabled: readOnly ? 'true' : null },
    dataset: { role: 'observation-assign-note-open' },
  });
  const list = createEl('div', {
    className: 'd-flex flex-wrap gap-2 observation-assign-list',
    dataset: { role: 'observation-assign-list' },
  });
  const content = createEl('div', {
    className: 'mt-3 d-flex flex-column gap-3',
    children: [noteOpenButton, observationLabel, list],
  });
  const scrollContent = createEl('div', {
    className: 'observation-templates-overlay__content',
    children: [content],
  });

  const noteOverlay = createEl('div', {
    className: 'observation-assign-note-overlay',
    dataset: { role: 'observation-assign-note-overlay' },
    attrs: { 'aria-hidden': 'true' },
  });
  const notePanel = createEl('div', {
    className: 'observation-assign-note-overlay__panel',
    attrs: { role: 'dialog', 'aria-modal': 'true' },
  });
  const noteHeader = createEl('div', {
    className: 'observation-assign-note-overlay__header',
  });
  const noteTitle = createEl('h4', {
    className: 'h6 mb-0',
    text: 'Notiz zuweisen',
  });
  const noteCloseButton = createEl('button', {
    className: 'btn-close observation-templates-overlay__close',
    attrs: { type: 'button', 'aria-label': 'Schließen' },
    dataset: { role: 'observation-assign-note-close' },
  });
  noteHeader.append(noteTitle, noteCloseButton);
  const noteList = createEl('div', {
    className: 'd-flex flex-wrap gap-2 observation-assign-note-list',
    dataset: { role: 'observation-assign-note-list' },
  });
  const noteInput = createEl('textarea', {
    className: 'form-control',
    attrs: {
      rows: '4',
      placeholder: 'Notiz',
      'aria-label': 'Notiz für ausgewählte Kinder',
    },
    dataset: { role: 'observation-assign-note-input' },
  });
  noteInput.disabled = readOnly;
  const noteSaveButton = createEl('button', {
    className: 'btn btn-primary observation-assign-note-save align-self-start',
    text: 'Speichern',
    attrs: { type: 'button', disabled: readOnly ? 'true' : null },
    dataset: { role: 'observation-assign-note-save' },
  });
  const noteBody = createEl('div', {
    className: 'd-flex flex-column gap-3 mt-3',
    children: [noteList, noteInput, noteSaveButton],
  });
  notePanel.append(noteHeader, noteBody);
  noteOverlay.appendChild(notePanel);

  overlayPanel.append(header, scrollContent, noteOverlay);
  overlay.appendChild(overlayPanel);

  return {
    element: overlay,
    refs: {
      list,
      closeButton,
      observationLabel,
      noteOpenButton,
      noteOverlay,
      noteList,
      noteInput,
      noteSaveButton,
      noteCloseButton,
    },
  };
};

export const buildObservationCatalogOverlay = ({
  observationCatalog,
  observationGroups,
  savedFilters,
}) =>
  buildObservationTemplatesOverlay({
    templates: observationCatalog,
    observationCatalog,
    observationGroups,
    savedFilters,
    role: 'observation-catalog-overlay',
    className: 'observation-templates-overlay observation-catalog-overlay',
    closeRole: 'observation-catalog-close',
    showCreateButton: true,
    createButtonLabel: UI_LABELS.observationCreate,
    createButtonRole: 'observation-catalog-create-open',
  });

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
  notes,
  readOnly = false,
}) => {
  const count = getObservationCount(observationsByChild, child);
  const hasNote = hasObservationNotes(notes);
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
  const noteIcon = hasNote
    ? createEl('span', {
        className: 'observation-note-icon',
        text: '📝',
        attrs: {
          title: 'Notizen vorhanden',
          'aria-label': 'Notizen vorhanden',
        },
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
          noteIcon,
          countBadge,
          badge,
        ].filter(Boolean)
      : [
          createEl('span', { className: 'fw-semibold observation-child-label', text: child }),
          noteIcon,
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

const buildSelectedObservationKeys = (items) => {
  const keys = new Set();
  if (!Array.isArray(items)) {
    return keys;
  }
  items.forEach((item) => {
    const key = normalizeObservationKey(item);
    if (key) {
      keys.add(key);
    }
  });
  return keys;
};

const rebuildTopList = (topItems, getGroupsForLabel, observationGroups, selectedSet = new Set()) => {
  const availableItems = topItems.filter(
    ({ label }) => !selectedSet.has(normalizeObservationKey(label)),
  );
  return availableItems.length
    ? buildTopList(availableItems, getGroupsForLabel, observationGroups)
    : createEl('p', {
        className: 'text-muted small mb-0',
        text: 'Noch keine Daten',
      });
};

const reindexObservationNoteInputs = (noteList) => {
  if (!noteList) {
    return;
  }
  noteList.querySelectorAll('[data-role="observation-note-input"]').forEach((input, index) => {
    input.dataset.noteIndex = String(index);
    input.setAttribute('aria-label', `Notiz ${index + 1}`);
    const item = input.closest('.observation-note-item');
    const deleteButton = item?.querySelector('[data-role="observation-note-delete"]');
    if (deleteButton instanceof HTMLButtonElement) {
      deleteButton.dataset.noteIndex = String(index);
      deleteButton.setAttribute('aria-label', `Notiz ${index + 1} löschen`);
    }
  });
};

const buildObservationNoteItem = (value, index, { disabled }) => {
  const deleteButton = createEl('button', {
    className: 'btn btn-outline-danger btn-sm observation-note-delete align-self-end',
    text: 'Löschen',
    attrs: {
      type: 'button',
      'aria-label': `Notiz ${index + 1} löschen`,
    },
    dataset: { role: 'observation-note-delete', noteIndex: String(index) },
  });
  deleteButton.disabled = disabled;
  const noteInput = createEl('textarea', {
    className: 'form-control observation-note-input',
    attrs: {
      rows: '3',
      placeholder: 'Notiz',
      'aria-label': `Notiz ${index + 1}`,
    },
    dataset: { role: 'observation-note-input', noteIndex: String(index) },
  });
  noteInput.value = value;
  noteInput.disabled = disabled;

  return createEl('div', {
    className: 'observation-note-item d-flex flex-column gap-2',
    children: [deleteButton, noteInput],
  });
};

const renderObservationNoteItems = (noteList, notes, disabled) => {
  if (!noteList) {
    return;
  }
  const normalized = normalizeObservationNoteList(notes);
  const values = normalized.length ? normalized : [''];
  const items = values.map((value, index) =>
    buildObservationNoteItem(value, index, { disabled }),
  );
  noteList.replaceChildren(...items);
  reindexObservationNoteInputs(noteList);
};

const syncObservationNoteItems = ({ detail, refs, notes, disabled }) => {
  if (!detail || !refs?.noteList || !refs?.noteAddButton) {
    return;
  }
  const activeElement = document.activeElement;
  const activeIndex =
    activeElement instanceof HTMLTextAreaElement &&
    activeElement.dataset.role === 'observation-note-input' &&
    refs.noteList.contains(activeElement)
      ? Number(activeElement.dataset.noteIndex)
      : null;

  const noteInputs = refs.noteList.querySelectorAll('[data-role="observation-note-input"]');
  const noteDeleteButtons = refs.noteList.querySelectorAll('[data-role="observation-note-delete"]');
  const isEditing = detail.dataset.noteEditing === 'true' && noteInputs.length > 0;

  if (!isEditing) {
    renderObservationNoteItems(refs.noteList, notes, disabled);
  } else {
    noteInputs.forEach((input) => {
      input.disabled = disabled;
    });
    noteDeleteButtons.forEach((button) => {
      if (button instanceof HTMLButtonElement) {
        button.disabled = disabled;
      }
    });
  }

  refs.noteAddButton.disabled = disabled;

  const shouldRestoreFocus = activeIndex !== null || detail.dataset.noteEditing === 'true';
  if (!shouldRestoreFocus || disabled) {
    return;
  }
  const preferredIndex = Number(detail.dataset.noteEditingIndex);
  const inputs = refs.noteList.querySelectorAll('[data-role="observation-note-input"]');
  const fallbackIndex =
    Number.isFinite(preferredIndex) && preferredIndex >= 0 ? preferredIndex : activeIndex ?? 0;
  const target = inputs[Math.min(fallbackIndex, inputs.length - 1)];
  if (!target) {
    return;
  }
  requestAnimationFrame(() => {
    target.focus();
  });
};

const buildObservationNoteDeleteConfirm = () => {
  const overlay = createEl('div', {
    className: 'class-settings-confirm angebot-delete-confirm d-none observation-note-delete-confirm',
    dataset: { role: 'observation-note-delete-confirm-overlay' },
    attrs: {
      role: 'dialog',
      'aria-modal': 'true',
      'aria-labelledby': 'observation-note-delete-confirm-title',
      'aria-describedby': 'observation-note-delete-confirm-message',
      'aria-hidden': 'true',
      tabIndex: '-1',
    },
  });
  const panel = createEl('div', {
    className: 'class-settings-confirm__panel',
  });
  const title = createEl('h3', {
    className: 'h5 mb-2',
    attrs: { id: 'observation-note-delete-confirm-title' },
    text: 'Notiz löschen?',
  });
  const message = createEl('p', {
    className: 'text-muted mb-3',
    attrs: { id: 'observation-note-delete-confirm-message' },
    text: '',
    dataset: { role: 'observation-note-delete-confirm-message' },
  });
  const actions = createEl('div', {
    className: 'class-settings-confirm__actions',
    children: [
      createEl('button', {
        className: 'btn btn-danger',
        text: 'Ja',
        attrs: { type: 'button' },
        dataset: { role: 'observation-note-delete-confirm' },
      }),
      createEl('button', {
        className: 'btn btn-outline-secondary',
        text: 'Abbrechen',
        attrs: { type: 'button' },
        dataset: { role: 'observation-note-delete-cancel' },
      }),
    ],
  });
  panel.append(title, message, actions);
  overlay.appendChild(panel);
  return {
    element: overlay,
    refs: {
      message,
      confirmButton: actions.querySelector('[data-role="observation-note-delete-confirm"]'),
      cancelButton: actions.querySelector('[data-role="observation-note-delete-cancel"]'),
    },
  };
};

const createDetailPanel = ({
  child,
  isAbsent,
  topItems = [],
  observationGroups,
  getGroupsForLabel,
  todayItems = [],
  notes = [],
  readOnly = false,
}) => {
  const selectedKeys = buildSelectedObservationKeys(todayItems);
  const topList = rebuildTopList(topItems, getGroupsForLabel, observationGroups, selectedKeys);

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
      createEl('span', { className: 'observation-action-label', text: UI_LABELS.observationCatalog }),
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
      createEl('span', { className: 'observation-action-label', text: UI_LABELS.observationCreate }),
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

  const noteLabel = createEl('label', {
    className: 'form-label mb-0',
    text: 'Notizen',
  });
  const noteList = createEl('div', {
    className: 'd-flex flex-column gap-2',
    dataset: { role: 'observation-note-list' },
  });
  const noteAddButton = createEl('button', {
    className: 'btn btn-outline-secondary observation-note-add align-self-start',
    text: '+',
    attrs: {
      type: 'button',
      'aria-label': 'Neue Notiz hinzufügen',
    },
    dataset: { role: 'observation-note-add' },
  });
  const noteDisabled = isAbsent || readOnly;
  renderObservationNoteItems(noteList, notes, noteDisabled);
  noteAddButton.disabled = noteDisabled;
  const noteSection = createEl('div', {
    className: 'observation-section observation-section--notes d-flex flex-column gap-2',
    children: [noteLabel, noteList, noteAddButton],
  });

  const detail = createEl('div', {
    className: 'observation-detail d-flex flex-column gap-3 d-none',
    dataset: {
      child,
      templateFilter: 'ALL',
      templateQuery: '',
      absent: isAbsent ? 'true' : 'false',
    },
    children: [todaySection, addSection, noteSection, feedback],
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
    noteSection.hidden = true;
    feedback.hidden = true;
    detail.append(absentNotice);
  }

  return {
    detail,
    refs: {
      topList,
      todaySection,
      addSection,
      noteSection,
      noteList,
      noteAddButton,
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

export const buildObservationEditOverlay = ({
  observationGroups,
  showDeleteButton = false,
  className = 'observation-edit-overlay',
}) => {
  const overlay = createEl('div', {
    className,
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
      ...(showDeleteButton
        ? [
            createEl('button', {
              className: 'btn btn-danger',
              text: 'Löschen',
              attrs: { type: 'button' },
              dataset: { role: 'observation-edit-delete' },
            }),
          ]
        : []),
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

export const buildObservationDeleteConfirm = () => {
  const overlay = createEl('div', {
    className: 'class-settings-confirm angebot-delete-confirm d-none',
    dataset: { role: 'observation-delete-confirm-overlay' },
    attrs: {
      role: 'dialog',
      'aria-modal': 'true',
      'aria-labelledby': 'observation-delete-confirm-title',
      'aria-describedby': 'observation-delete-confirm-message',
      'aria-hidden': 'true',
      tabIndex: '-1',
    },
  });
  const panel = createEl('div', {
    className: 'class-settings-confirm__panel',
  });
  const title = createEl('h3', {
    className: 'h5 mb-2',
    attrs: { id: 'observation-delete-confirm-title' },
    text: 'Beobachtung löschen?',
  });
  const message = createEl('p', {
    className: 'text-muted mb-3',
    attrs: { id: 'observation-delete-confirm-message' },
    text: '',
    dataset: { role: 'observation-delete-confirm-message' },
  });
  const inputLabel = createEl('label', {
    className: 'form-label text-muted small mb-0',
    text: 'Bestätigung',
    attrs: { for: 'observation-delete-confirm-input' },
  });
  const input = createEl('input', {
    className: 'form-control',
    attrs: {
      id: 'observation-delete-confirm-input',
      type: 'text',
      autocomplete: 'off',
      placeholder: 'ja',
    },
    dataset: { role: 'observation-delete-confirm-input' },
  });
  const actions = createEl('div', {
    className: 'class-settings-confirm__actions',
    children: [
      createEl('button', {
        className: 'btn btn-danger',
        text: 'Beobachtung löschen',
        attrs: { type: 'button' },
        dataset: { role: 'observation-delete-confirm' },
      }),
      createEl('button', {
        className: 'btn btn-outline-secondary',
        text: 'Abbrechen',
        attrs: { type: 'button' },
        dataset: { role: 'observation-delete-cancel' },
      }),
    ],
  });
  panel.append(title, message, inputLabel, input, actions);
  overlay.appendChild(panel);
  return { element: overlay };
};

export const buildObservationCreateOverlay = ({ observationGroups }) => {
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
    text: UI_LABELS.observationCreate,
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
      placeholder: `${UI_LABELS.observationCreate}…`,
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

const buildEntlassungBadge = (text, className = 'badge text-bg-light text-secondary') =>
  createEl('span', { className, text });

const buildEntlassungChildButton = ({
  child,
  isEntlassen,
  isAbsent,
  isAusnahme,
  readOnly,
  courseIcons = [],
}) => {
  const ausnahmeBadge = isAusnahme
    ? createEl('span', {
        className: 'badge text-bg-warning text-dark entlassung-ausnahme-badge',
        dataset: { role: 'entlassung-ausnahme-badge' },
        text: 'Ausnahme',
      })
    : null;
  const statusBadge = isEntlassen
    ? createEl('span', {
        className: 'badge text-bg-light text-secondary entlassung-badge',
        dataset: { role: 'entlassung-badge' },
        text: 'Entlassen',
      })
    : null;
  const absentBadge = isAbsent
    ? createEl('span', {
        className: 'badge text-bg-light text-secondary entlassung-absent-badge',
        text: 'Abwesend',
      })
    : null;
  const courseIconGroup =
    Array.isArray(courseIcons) && courseIcons.length
      ? createEl('span', {
          className: 'entlassung-course-icons',
          children: courseIcons.map((icon) =>
            createEl('span', { className: 'entlassung-course-icon', text: icon }),
          ),
        })
      : null;
  return createEl('button', {
    className:
      `btn btn-sm rounded-pill d-inline-flex align-items-center gap-2 entlassung-child-button ${
        isEntlassen ? 'btn-secondary' : 'btn-outline-secondary'
      }`,
    attrs: {
      type: 'button',
      disabled: readOnly || isAbsent ? 'true' : null,
      'aria-pressed': isEntlassen ? 'true' : 'false',
    },
    dataset: {
      role: 'entlassung-child',
      child,
      entlassen: isEntlassen ? 'true' : 'false',
      absent: isAbsent ? 'true' : 'false',
    },
    children: [
      createEl('span', { className: 'fw-semibold', text: child }),
      courseIconGroup,
      ausnahmeBadge,
      statusBadge,
      absentBadge,
    ].filter(Boolean),
  });
};

const buildEntlassungSlots = ({ slots, absentSet, statusSet, readOnly, courseIconsByChild }) => {
  if (!slots.length) {
    return [];
  }

  return slots.map((slot) => {
    const timeLabel = slot?.time || 'Ohne Uhrzeit';
    const children = Array.isArray(slot?.children) ? slot.children : [];
    const ausnahmeSet = new Set(Array.isArray(slot?.ausnahmeChildren) ? slot.ausnahmeChildren : []);
    const childList = createEl('div', { className: 'd-flex flex-wrap gap-2' });

    if (children.length) {
      children.forEach((child) => {
        const isAbsent = absentSet.has(child);
        const isEntlassen = statusSet.has(child) && !isAbsent;
        const isAusnahme = ausnahmeSet.has(child);
        const courseIcons =
          courseIconsByChild instanceof Map ? courseIconsByChild.get(child) : null;
        childList.appendChild(
          buildEntlassungChildButton({
            child,
            isEntlassen,
            isAbsent,
            isAusnahme,
            readOnly,
            courseIcons,
          }),
        );
      });
    } else {
      childList.appendChild(
        createEl('span', {
          className: 'text-muted small',
          text: 'Noch keine Kinder zugeordnet.',
        }),
      );
    }

    return createEl('div', {
      className: 'border rounded-3 p-2 d-flex flex-column gap-2 entlassung-slot',
      children: [
        createEl('div', {
          className: 'd-flex align-items-center gap-2',
          children: [
            createEl('span', { className: 'text-muted small', text: 'Uhrzeit' }),
            buildEntlassungBadge(timeLabel),
          ],
        }),
        childList,
      ],
    });
  });
};

export const buildMainTabsSection = ({
  angebotSection,
  observationsSection,
  entlassungSection,
}) => {
  const tabsId = 'main-tabs';
  const angebotTabId = 'main-angebot-tab';
  const observationsTabId = 'main-observations-tab';
  const entlassungTabId = 'main-entlassung-tab';
  const angebotPaneId = 'main-angebot-pane';
  const observationsPaneId = 'main-observations-pane';
  const entlassungPaneId = 'main-entlassung-pane';

  const tabList = createEl('ul', {
    className: 'nav nav-tabs',
    attrs: { id: tabsId, role: 'tablist' },
    children: [
      createEl('li', {
        className: 'nav-item',
        attrs: { role: 'presentation' },
        children: [
          createEl('button', {
            className: 'nav-link active',
            attrs: {
              id: observationsTabId,
              type: 'button',
              role: 'tab',
              'data-bs-toggle': 'tab',
              'data-bs-target': `#${observationsPaneId}`,
              'aria-controls': observationsPaneId,
              'aria-label': 'Beobachtungen und Abwesenheit',
              'aria-selected': 'true',
              title: 'Beobachtungen und Abwesenheit',
            },
            text: '👀',
          }),
        ],
      }),
      createEl('li', {
        className: 'nav-item',
        attrs: { role: 'presentation' },
        children: [
          createEl('button', {
            className: 'nav-link',
            attrs: {
              id: entlassungTabId,
              type: 'button',
              role: 'tab',
              'data-bs-toggle': 'tab',
              'data-bs-target': `#${entlassungPaneId}`,
              'aria-controls': entlassungPaneId,
              'aria-label': 'Entlassung',
              'aria-selected': 'false',
              title: 'Entlassung',
            },
            text: '🚶',
          }),
        ],
      }),
      createEl('li', {
        className: 'nav-item',
        attrs: { role: 'presentation' },
        children: [
          createEl('button', {
            className: 'nav-link',
            attrs: {
              id: angebotTabId,
              type: 'button',
              role: 'tab',
              'data-bs-toggle': 'tab',
              'data-bs-target': `#${angebotPaneId}`,
              'aria-controls': angebotPaneId,
              'aria-label': `${UI_LABELS.angebotToday}`,
              'aria-selected': 'false',
              title: UI_LABELS.angebotToday,
            },
            text: '📋',
          }),
        ],
      }),
    ],
  });

  const angebotPane = createEl('div', {
    className: 'tab-pane fade pt-3',
    attrs: {
      id: angebotPaneId,
      role: 'tabpanel',
      'aria-labelledby': angebotTabId,
    },
    children: [angebotSection],
  });
  const tabContent = createEl('div', {
    className: 'tab-content',
    children: [
      createEl('div', {
        className: 'tab-pane fade show active pt-3',
        attrs: {
          id: observationsPaneId,
          role: 'tabpanel',
          'aria-labelledby': observationsTabId,
        },
        children: [observationsSection],
      }),
      createEl('div', {
        className: 'tab-pane fade pt-3',
        attrs: {
          id: entlassungPaneId,
          role: 'tabpanel',
          'aria-labelledby': entlassungTabId,
        },
        children: [entlassungSection],
      }),
      angebotPane,
    ],
  });

  return {
    element: createEl('div', {
      className: 'd-flex flex-column gap-2',
      children: [tabList, tabContent],
    }),
    refs: {
      angebotPane,
    },
  };
};

export const buildEntlassungSection = ({
  entlassungLabel,
  slots,
  absentChildren,
  statusSet,
  courseIconsByChild,
  children = [],
  ausnahmenForDate = [],
  allowedTimes = [],
  sonderTimes = [],
  readOnly = false,
  freeDayInfo = null,
}) => {
  const section = createEl('section', {
    className: 'card shadow-sm border-0 entlassung-panel',
    dataset: { readonly: readOnly ? 'true' : 'false' },
  });
  const body = createEl('div', { className: 'card-body d-flex flex-column gap-3' });
  const labelBadge = createEl('span', {
    className: 'badge text-bg-light border text-secondary align-self-start',
    text: entlassungLabel,
  });
  const header = createEl('div', {
    className: 'd-flex flex-column gap-1',
    children: [
      createEl('div', { className: 'h6 mb-0', text: 'Entlassung' }),
      labelBadge,
    ],
  });
  const slotsWrapper = createEl('div', { className: 'd-flex flex-column gap-2' });
  const notice = createEl('div', { className: 'alert mb-0', hidden: true });

  const ausnahmenTitle = createEl('div', { className: 'fw-semibold', text: 'Ausnahmen' });
  const ausnahmenAddButton = createEl('button', {
    className: 'btn btn-outline-primary btn-sm',
    attrs: { type: 'button', 'data-role': 'entlassung-ausnahme-add' },
    text: '+ Ausnahme',
  });
  const ausnahmenHeader = createEl('div', {
    className: 'd-flex justify-content-between align-items-center gap-2',
    children: [ausnahmenTitle, ausnahmenAddButton],
  });
  const ausnahmenEmpty = createEl('div', {
    className: 'text-muted small',
    dataset: { role: 'entlassung-ausnahme-empty' },
    text: 'Keine Ausnahmen für dieses Datum.',
  });
  const ausnahmenList = createEl('div', {
    className: 'd-flex flex-column gap-2',
    dataset: { role: 'entlassung-ausnahme-list' },
  });
  const ausnahmenError = createEl('div', {
    className: 'text-danger small d-none',
    dataset: { role: 'entlassung-ausnahme-error' },
  });
  const ausnahmenSonderToggle = createEl('input', {
    className: 'form-check-input',
    attrs: {
      type: 'checkbox',
      role: 'switch',
      id: 'entlassung-ausnahme-sonder-toggle',
      'data-role': 'entlassung-ausnahme-sonder-toggle',
    },
  });
  const ausnahmenSonderToggleLabel = createEl('label', {
    className: 'form-check-label',
    attrs: { for: 'entlassung-ausnahme-sonder-toggle' },
    text: 'Sonderentlassung',
  });
  const ausnahmenSonderSwitch = createEl('div', {
    className: 'form-check form-switch',
    children: [ausnahmenSonderToggle, ausnahmenSonderToggleLabel],
  });
  const ausnahmenChildSelect = createEl('select', {
    className: 'form-select form-select-sm',
    attrs: { 'data-role': 'entlassung-ausnahme-child', 'aria-label': 'Kind auswählen' },
  });
  const ausnahmenTimeSelect = createEl('select', {
    className: 'form-select form-select-sm',
    attrs: { 'data-role': 'entlassung-ausnahme-time', 'aria-label': 'Entlassungszeit auswählen' },
  });
  const ausnahmenAllowedHint = createEl('div', {
    className: 'text-muted small d-none',
    dataset: { role: 'entlassung-ausnahme-allowed-hint' },
    text: 'Keine definierten Uhrzeiten verfügbar. Nutze eine Sonderentlassung.',
  });
  const ausnahmenRegularLabel = createEl('div', {
    className: 'small text-muted',
    dataset: { role: 'entlassung-ausnahme-regular-label' },
    text: 'Entlassungszeit (laut Einstellungen)',
  });
  const ausnahmenSonderSelect = createEl('select', {
    className: 'form-select form-select-sm d-none',
    attrs: {
      'data-role': 'entlassung-ausnahme-sonder-time',
      'aria-label': 'Sonderentlassung auswählen',
    },
  });
  const ausnahmenSonderLabel = createEl('div', {
    className: 'small text-muted d-none',
    dataset: { role: 'entlassung-ausnahme-sonder-label' },
    text: 'Sonderentlassung (08:00–17:30)',
  });
  const ausnahmenActions = createEl('div', {
    className: 'd-flex flex-wrap gap-2 justify-content-end',
  });
  const ausnahmenCancelButton = createEl('button', {
    className: 'btn btn-outline-secondary btn-sm',
    attrs: { type: 'button', 'data-role': 'entlassung-ausnahme-cancel' },
    text: 'Abbrechen',
  });
  const ausnahmenSubmitButton = createEl('button', {
    className: 'btn btn-primary btn-sm',
    attrs: { type: 'submit', 'data-role': 'entlassung-ausnahme-submit' },
    text: 'Ausnahme speichern',
  });
  ausnahmenActions.append(ausnahmenCancelButton, ausnahmenSubmitButton);
  const ausnahmenForm = createEl('form', {
    className: 'border rounded-3 p-2 d-flex flex-column gap-2 entlassung-ausnahme-form d-none',
    dataset: { role: 'entlassung-ausnahme-form' },
    children: [
      ausnahmenSonderSwitch,
      createEl('div', { className: 'small text-muted', text: 'Kind auswählen' }),
      ausnahmenChildSelect,
      ausnahmenRegularLabel,
      ausnahmenTimeSelect,
      ausnahmenAllowedHint,
      ausnahmenSonderLabel,
      ausnahmenSonderSelect,
      ausnahmenError,
      ausnahmenActions,
    ],
  });
  const ausnahmenSection = createEl('div', {
    className: 'd-flex flex-column gap-2 entlassung-ausnahmen',
    children: [ausnahmenHeader, ausnahmenList, ausnahmenEmpty, ausnahmenForm],
  });

  body.append(header, notice, ausnahmenSection, slotsWrapper);
  section.appendChild(body);

  const update = ({
    nextLabel,
    nextSlots,
    nextAbsentChildren,
    nextStatusSet,
    nextCourseIconsByChild,
    nextChildren = [],
    nextAusnahmenForDate = [],
    nextAllowedTimes = [],
    nextSonderTimes = [],
    nextReadOnly = false,
    nextFreeDayInfo = null,
  }) => {
    section.dataset.readonly = nextReadOnly ? 'true' : 'false';
    labelBadge.textContent = nextLabel || entlassungLabel;
    const safeSlots = Array.isArray(nextSlots) ? nextSlots : [];
    const absentSet = new Set(nextAbsentChildren || []);
    const status = nextStatusSet instanceof Set ? nextStatusSet : new Set();
    const courseIcons =
      nextCourseIconsByChild instanceof Map ? nextCourseIconsByChild : courseIconsByChild;
    const safeChildren = Array.isArray(nextChildren) ? nextChildren : [];
    const safeAusnahmen = Array.isArray(nextAusnahmenForDate) ? nextAusnahmenForDate : [];
    const safeAllowedTimes = Array.isArray(nextAllowedTimes) ? nextAllowedTimes : [];
    const safeSonderTimes = Array.isArray(nextSonderTimes) ? nextSonderTimes : [];

    const dayLabel = nextFreeDayInfo?.label || 'Schulfrei';
    if (nextReadOnly) {
      notice.hidden = false;
      notice.className = 'alert alert-success mb-0';
      notice.textContent = `Keine Kontrolle möglich – ${dayLabel}`;
    } else {
      notice.hidden = true;
    }

    ausnahmenAddButton.disabled = nextReadOnly;

    const updateSelectOptions = (select, options, placeholder) => {
      const previousValue = select.value;
      const optionNodes = [
        createEl('option', { attrs: { value: '' }, text: placeholder }),
        ...options.map((value) => createEl('option', { attrs: { value }, text: value })),
      ];
      select.replaceChildren(...optionNodes);
      if (previousValue && options.includes(previousValue)) {
        select.value = previousValue;
      }
    };

    updateSelectOptions(ausnahmenChildSelect, safeChildren, 'Kind auswählen');
    updateSelectOptions(ausnahmenTimeSelect, safeAllowedTimes, 'Uhrzeit auswählen');
    updateSelectOptions(ausnahmenSonderSelect, safeSonderTimes, 'Sonderzeit auswählen');

    const hasAllowedTimes = safeAllowedTimes.length > 0;
    const isSonderMode = ausnahmenSonderToggle.checked;
    ausnahmenAllowedHint.classList.toggle('d-none', hasAllowedTimes || isSonderMode);

    [
      ausnahmenChildSelect,
      ausnahmenSonderToggle,
      ausnahmenCancelButton,
      ausnahmenSubmitButton,
    ].forEach((control) => {
      control.disabled = nextReadOnly;
    });
    ausnahmenTimeSelect.disabled = nextReadOnly || isSonderMode || !hasAllowedTimes;
    ausnahmenSonderSelect.disabled = nextReadOnly || !isSonderMode;

    const ausnahmeItems = safeAusnahmen.map((entry) => {
      const time = entry?.time || '—';
      const child = entry?.child || '—';
      const badge = createEl('span', {
        className: 'badge text-bg-warning text-dark',
        text: 'Ausnahme',
      });
      const label = createEl('div', {
        className: 'd-flex flex-wrap align-items-center gap-2',
        children: [
          badge,
          createEl('span', { className: 'fw-semibold', text: child }),
          createEl('span', { className: 'text-muted small', text: time }),
        ],
      });
      const removeButton = createEl('button', {
        className: 'btn btn-outline-danger btn-sm',
        attrs: {
          type: 'button',
          'data-role': 'entlassung-ausnahme-remove',
          'data-child': child,
        },
        text: 'Entfernen',
      });
      removeButton.disabled = nextReadOnly;
      return createEl('div', {
        className: 'border rounded-3 p-2 d-flex flex-column flex-sm-row gap-2 justify-content-between align-items-start align-items-sm-center',
        children: [label, removeButton],
      });
    });
    ausnahmenList.replaceChildren(...ausnahmeItems);
    ausnahmenEmpty.classList.toggle('d-none', ausnahmeItems.length > 0);

    slotsWrapper.replaceChildren(
      ...buildEntlassungSlots({
        slots: safeSlots,
        absentSet,
        statusSet: status,
        readOnly: nextReadOnly,
        courseIconsByChild: courseIcons,
      }),
    );
  };

  update({
    nextLabel: entlassungLabel,
    nextSlots: slots,
    nextAbsentChildren: absentChildren,
    nextStatusSet: statusSet,
    nextCourseIconsByChild: courseIconsByChild,
    nextChildren: children,
    nextAusnahmenForDate: ausnahmenForDate,
    nextAllowedTimes: allowedTimes,
    nextSonderTimes: sonderTimes,
    nextReadOnly: readOnly,
    nextFreeDayInfo: freeDayInfo,
  });

  return {
    element: section,
    update,
    refs: {
      ausnahmenAddButton,
      ausnahmenForm,
      ausnahmenChildSelect,
      ausnahmenTimeSelect,
      ausnahmenSonderToggle,
      ausnahmenSonderSelect,
      ausnahmenError,
      ausnahmenRegularLabel,
      ausnahmenSonderLabel,
      ausnahmenAllowedHint,
      ausnahmenCancelButton,
      ausnahmenSubmitButton,
    },
  };
};

export const buildObservationsSection = ({
  children,
  observations,
  observationNotes,
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

  const multiObservationButton = createEl('button', {
    className:
      'btn btn-outline-primary d-inline-flex align-items-center gap-2 observation-multi-button',
    attrs: { type: 'button', disabled: isReadOnly ? 'true' : null },
    dataset: { role: 'observation-multi-open' },
    children: [createEl('span', { text: '👀→👥' })],
  });

  const list = createEl('div', {
    className: 'd-flex flex-wrap gap-2 observation-child-list',
  });
  children.forEach((child) => {
    const isAbsent = absentSet.has(child);
    const notes = normalizeObservationNoteList(observationNotes?.[child]);
    list.appendChild(
      rebuildChildButton({
        child,
        isAbsent,
        observationsByChild: observations,
        notes,
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
  const multiTemplatesOverlay = buildObservationTemplatesOverlay({
    templates: observationCatalog,
    observationCatalog,
    observationGroups,
    savedFilters: normalizedSavedFilters,
    role: 'observation-multi-catalog-overlay',
    className: 'observation-templates-overlay observation-multi-catalog-overlay',
    closeRole: 'observation-multi-catalog-close',
  });
  const assignOverlay = buildObservationAssignOverlay({ readOnly: isReadOnly });
  const editOverlay = buildObservationEditOverlay({ observationGroups });
  const createOverlay = buildObservationCreateOverlay({ observationGroups });
  const noteDeleteConfirmOverlay = buildObservationNoteDeleteConfirm();

  const detailRefs = new Map();

  children.forEach((child) => {
    const data = observations[child] || {};
    const notes = normalizeObservationNoteList(observationNotes?.[child]);
    const selectedKeys = buildSelectedObservationKeys(data);
    const topItems = buildTopItems(observationStats?.[child], observationCatalog, {
      excludeKeys: selectedKeys,
    });
    const isAbsent = absentSet.has(child);
    const { detail, refs } = createDetailPanel({
      child,
      isAbsent,
      topItems,
      observationGroups,
      getGroupsForLabel,
      todayItems: data,
      notes,
      readOnly: isReadOnly,
    });
    syncObservationNoteItems({
      detail,
      refs,
      notes,
      disabled: isAbsent || isReadOnly,
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
    noteDeleteConfirmOverlay.element,
  );
  overlay.appendChild(overlayPanel);

  body.append(
    multiObservationButton,
    list,
    overlay,
    multiTemplatesOverlay.element,
    assignOverlay.element,
  );
  section.appendChild(body);

  const updateChildDetail = ({
    child,
    data,
    topItems,
    isAbsent,
    getGroupsForLabel,
    observationGroups,
    notes,
    readOnly: nextReadOnly,
  }) => {
    const detail = overlayContent.querySelector(`[data-child="${child}"]`);
    const noteDisabled = isAbsent || Boolean(nextReadOnly);
    if (!detail) {
      const panel = createDetailPanel({
        child,
        isAbsent,
        topItems,
        observationGroups,
        getGroupsForLabel,
        todayItems: data,
        notes,
        readOnly: nextReadOnly,
      });
      syncObservationNoteItems({
        detail: panel.detail,
        refs: panel.refs,
        notes,
        disabled: noteDisabled,
      });
      const nextToday = rebuildTodayList(data, getGroupsForLabel, observationGroups);
      nextToday.dataset.role = 'observation-today-list';
      panel.refs.todayList.replaceWith(nextToday);
      panel.refs.todayList = nextToday;
      panel.refs.topList.dataset.role = 'observation-top-list';
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

    const selectedKeys = buildSelectedObservationKeys(data);
    const nextTop = rebuildTopList(topItems, getGroupsForLabel, observationGroups, selectedKeys);
    nextTop.dataset.role = 'observation-top-list';
    refs.topList.replaceWith(nextTop);
    refs.topList = nextTop;

    const nextToday = rebuildTodayList(data, getGroupsForLabel, observationGroups);
    nextToday.dataset.role = 'observation-today-list';
    refs.todayList.replaceWith(nextToday);
    refs.todayList = nextToday;

    const activeElement = document.activeElement;
    const hadNoteFocus =
      activeElement instanceof HTMLTextAreaElement &&
      activeElement.dataset.role === 'observation-note-input' &&
      refs.noteList?.contains(activeElement);
    const isHidden = Boolean(isAbsent);
    refs.topList.hidden = isHidden;
    refs.todayTitle.hidden = isHidden;
    refs.todayList.hidden = isHidden;
    refs.actionRow.hidden = isHidden;
    refs.feedback.hidden = isHidden;
    refs.todaySection.hidden = isHidden;
    refs.addSection.hidden = isHidden;
    refs.noteSection.hidden = isHidden;

    syncObservationNoteItems({
      detail,
      refs,
      notes,
      disabled: noteDisabled,
    });

    const shouldRestoreFocus = hadNoteFocus || detail.dataset.noteEditing === 'true';
    if (shouldRestoreFocus && !noteDisabled) {
      reindexObservationNoteInputs(refs.noteList);
    }

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
    multiObservationButton,
    list,
    overlay,
    overlayPanel,
    overlayContent,
    overlayTitle,
    closeButton,
    templatesOverlay: templatesOverlay.element,
    multiTemplatesOverlay: multiTemplatesOverlay.element,
    assignOverlay: assignOverlay.element,
    editOverlay: editOverlay.element,
    createOverlay: createOverlay.element,
    noteDeleteConfirmOverlay: noteDeleteConfirmOverlay.element,
  };

  const update = ({
    nextChildren,
    nextObservations,
    nextObservationNotes,
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
      body.insertBefore(readOnlyNotice, multiObservationButton);
    } else if (!shouldBeReadOnly && readOnlyNotice) {
      readOnlyNotice.remove();
      readOnlyNotice = null;
    } else if (shouldBeReadOnly && readOnlyNotice) {
      readOnlyNotice.textContent = `Keine Eingaben möglich – ${nextLabel}`;
    }
    isReadOnly = shouldBeReadOnly;
    currentFreeDayInfo = nextFreeDayInfo;
    multiObservationButton.disabled = isReadOnly;
    const assignNoteOpenButton = refs.assignOverlay.querySelector(
      '[data-role="observation-assign-note-open"]',
    );
    if (assignNoteOpenButton instanceof HTMLButtonElement) {
      assignNoteOpenButton.disabled = isReadOnly;
    }
    const assignNoteInput = refs.assignOverlay.querySelector(
      '[data-role="observation-assign-note-input"]',
    );
    if (assignNoteInput instanceof HTMLTextAreaElement) {
      assignNoteInput.disabled = isReadOnly;
    }
    const assignNoteSaveButton = refs.assignOverlay.querySelector(
      '[data-role="observation-assign-note-save"]',
    );
    if (assignNoteSaveButton instanceof HTMLButtonElement) {
      assignNoteSaveButton.disabled = isReadOnly;
    }
    const noteDeleteConfirmButton = refs.noteDeleteConfirmOverlay.querySelector(
      '[data-role="observation-note-delete-confirm"]',
    );
    if (noteDeleteConfirmButton instanceof HTMLButtonElement) {
      noteDeleteConfirmButton.disabled = isReadOnly;
    }

    list.replaceChildren(
      ...nextChildren.map((child) =>
        rebuildChildButton({
          child,
          isAbsent: absentSetNext.has(child),
          observationsByChild: nextObservations,
          notes: normalizeObservationNoteList(nextObservationNotes?.[child]),
          readOnly: isReadOnly,
        }),
      ),
    );

    nextChildren.forEach((child) => {
      const data = nextObservations[child] || {};
      const notes = normalizeObservationNoteList(nextObservationNotes?.[child]);
      const selectedKeys = buildSelectedObservationKeys(data);
      const topItems = buildTopItems(nextObservationStats?.[child], nextObservationCatalog, {
        excludeKeys: selectedKeys,
      });
      updateChildDetail({
        child,
        data,
        topItems,
        isAbsent: absentSetNext.has(child),
        getGroupsForLabel: getGroupsForLabelNext,
        observationGroups: nextObservationGroups,
        notes,
        readOnly: isReadOnly,
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

    const isMultiTemplateOpen = refs.multiTemplatesOverlay?.dataset.isOpen === 'true';
    if (!isMultiTemplateOpen && Array.isArray(nextObservationCatalog)) {
      const refreshed = buildObservationTemplatesOverlay({
        templates: nextObservationCatalog,
        observationCatalog: nextObservationCatalog,
        observationGroups: nextObservationGroups,
        savedFilters: currentSavedFilters,
        role: 'observation-multi-catalog-overlay',
        className: 'observation-templates-overlay observation-multi-catalog-overlay',
        closeRole: 'observation-multi-catalog-close',
      });
      if (refreshed?.element) {
        const nextPanel = refreshed.element.querySelector(
          '.observation-templates-overlay__panel',
        );
        const currentPanel = refs.multiTemplatesOverlay.querySelector(
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
          refreshed.element.dataset.templateFilter ||
          refs.multiTemplatesOverlay.dataset.templateFilter;
        const nextQuery =
          refreshed.element.dataset.templateQuery ||
          refs.multiTemplatesOverlay.dataset.templateQuery;
        const nextGroups =
          refreshed.element.dataset.templateGroups ||
          refs.multiTemplatesOverlay.dataset.templateGroups;
        const nextGroupMode =
          refreshed.element.dataset.templateGroupMode ||
          refs.multiTemplatesOverlay.dataset.templateGroupMode;
        const nextMulti =
          refreshed.element.dataset.templateMulti ||
          refs.multiTemplatesOverlay.dataset.templateMulti;
        const nextShowAlphabet =
          refreshed.element.dataset.templateShowAlphabet ||
          refs.multiTemplatesOverlay.dataset.templateShowAlphabet;
        const nextSettingsOpen =
          refreshed.element.dataset.templateSettingsOpen ||
          refs.multiTemplatesOverlay.dataset.templateSettingsOpen;
        Object.assign(refs.multiTemplatesOverlay.dataset, {
          templateFilter: nextFilter,
          templateQuery: nextQuery,
          templateGroups: nextGroups,
          templateGroupMode: nextGroupMode,
          templateMulti: nextMulti,
          templateShowAlphabet: nextShowAlphabet,
          templateSettingsOpen: nextSettingsOpen,
        });
      }
    } else if (isMultiTemplateOpen) {
      // eslint-disable-next-line no-console
      console.debug('freilog: multi-template-overlay/update-skip', {
        isMultiTemplateOpen,
        preservedFilter: refs.multiTemplatesOverlay.dataset.templateFilter,
      });
    }

    if (templateContent) {
      templateContent.scrollTop = previousScrollTop;
      requestAnimationFrame(() => {
        templateContent.scrollTop = previousScrollTop;
      });
    }

    detailRefs.forEach((detailRef) => {
      const shouldDisable = detailRef?.noteSection?.hidden || isReadOnly;
      detailRef?.noteList
        ?.querySelectorAll('[data-role="observation-note-input"]')
        .forEach((input) => {
          input.disabled = Boolean(shouldDisable);
        });
      detailRef?.noteList
        ?.querySelectorAll('[data-role="observation-note-delete"]')
        .forEach((button) => {
          if (button instanceof HTMLButtonElement) {
            button.disabled = Boolean(shouldDisable);
          }
        });
      if (detailRef?.noteAddButton) {
        detailRef.noteAddButton.disabled = Boolean(shouldDisable);
      }
    });
  };

  return {
    element: section,
    refs,
    update,
  };
};
