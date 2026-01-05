import {
  addPreset,
  getAngebotCatalog,
  getEntry,
  updateAngebotCatalogEntry,
  updateEntry,
  upsertAngebotCatalogEntry,
} from '../db/dbRepository.js';
import { setSavedAngebotFilters } from '../state/store.js';
import {
  buildAngebotCatalogGroupMap,
  normalizeAngebotGroups,
  normalizeAngebotKey,
  normalizeAngebotText,
} from '../utils/angebotCatalog.js';
import { debounce } from '../utils/debounce.js';
import { focusTextInput } from '../utils/focus.js';
import { flattenModuleAssignments, normalizeModuleAssignments } from '../utils/angebotModules.js';

const LONG_PRESS_MS = 600;

const normalizeFilterQuery = (value) =>
  typeof value === 'string' ? value.trim().toLocaleLowerCase('de') : '';

const setFilterState = (overlay, nextState = {}) => {
  if (!overlay) {
    return;
  }
  const current = {
    filter: overlay.dataset.angebotFilter || 'ALL',
    query: overlay.dataset.angebotQuery || '',
    groups: overlay.dataset.angebotGroups || '',
    groupMode: overlay.dataset.angebotGroupMode || 'AND',
    multi: overlay.dataset.angebotMulti === 'true',
    showAndOr: overlay.dataset.angebotShowAndOr === 'true',
    showAlphabet: overlay.dataset.angebotShowAlphabet === 'true',
    settingsOpen: overlay.dataset.angebotSettingsOpen === 'true',
  };

  const merged = {
    ...current,
    ...nextState,
  };

  overlay.dataset.angebotFilter = merged.filter;
  overlay.dataset.angebotQuery = merged.query;
  overlay.dataset.angebotGroups = merged.groups;
  overlay.dataset.angebotGroupMode = merged.groupMode;
  overlay.dataset.angebotMulti = merged.multi ? 'true' : 'false';
  overlay.dataset.angebotShowAndOr = merged.showAndOr ? 'true' : 'false';
  overlay.dataset.angebotShowAlphabet = merged.showAlphabet ? 'true' : 'false';
  overlay.dataset.angebotSettingsOpen = merged.settingsOpen ? 'true' : 'false';
};

const getFilterState = (overlay) => {
  if (!overlay) {
    return {
      selectedGroups: [],
      groupMode: 'AND',
      selectedLetter: 'ALL',
      query: '',
      multiGroups: false,
      showAndOr: true,
      showAlphabet: false,
      settingsOpen: false,
    };
  }

  return {
    selectedGroups: normalizeAngebotGroups(
      typeof overlay.dataset.angebotGroups === 'string'
        ? overlay.dataset.angebotGroups.split(',')
        : [],
    ),
    groupMode: overlay.dataset.angebotGroupMode === 'OR' ? 'OR' : 'AND',
    selectedLetter:
      typeof overlay.dataset.angebotFilter === 'string' &&
      overlay.dataset.angebotFilter.trim()
        ? overlay.dataset.angebotFilter.trim()
        : 'ALL',
    query: overlay.dataset.angebotQuery || '',
    multiGroups: overlay.dataset.angebotMulti === 'true',
    showAndOr: overlay.dataset.angebotShowAndOr === 'true',
    showAlphabet: overlay.dataset.angebotShowAlphabet === 'true',
    settingsOpen: overlay.dataset.angebotSettingsOpen === 'true',
  };
};

const buildGroupDots = (groups, angebotGroups) => {
  const wrapper = document.createElement('span');
  wrapper.className = 'observation-group-dots';
  normalizeAngebotGroups(groups).forEach((group) => {
    const color =
      angebotGroups && angebotGroups[group]?.color
        ? angebotGroups[group].color
        : '#6c757d';
    const dot = document.createElement('span');
    dot.className = 'observation-group-dot';
    dot.setAttribute('aria-hidden', 'true');
    dot.style.setProperty('--group-color', color);
    wrapper.appendChild(dot);
  });
  return wrapper;
};

const renderModuleTabs = ({
  overlay,
  modules,
  assignments,
  groupMap,
  angebotGroups,
  readOnly,
  fallbackOffers = [],
}) => {
  const nav = overlay.querySelector('[data-role="angebot-modules-nav"]');
  const content = overlay.querySelector('[data-role="angebot-modules-content"]');
  const emptyState = overlay.querySelector('[data-role="angebot-modules-empty"]');
  const safeModules = Array.isArray(modules) ? modules : [];
  const assignmentMap = assignments && typeof assignments === 'object' ? assignments : {};
  const activeFromDataset = overlay.dataset.activeModule;
  const hasActive = safeModules.some((module) => module.id === activeFromDataset);
  const activeModuleId = hasActive
    ? activeFromDataset
    : safeModules[0]?.id || '';

  if (overlay && activeModuleId) {
    overlay.dataset.activeModule = activeModuleId;
  }

  if (!nav || !content) {
    return;
  }

  nav.replaceChildren();
  content.replaceChildren();

  if (emptyState) {
    emptyState.classList.toggle('d-none', Boolean(safeModules.length));
    emptyState.classList.toggle('is-hidden', Boolean(safeModules.length));
  }

  if (!safeModules.length) {
    const offers = Array.isArray(fallbackOffers) ? fallbackOffers : [];
    if (offers.length) {
      const list = document.createElement('div');
      list.className = 'd-flex flex-wrap gap-2';
      offers.forEach((label) => {
        const pill = document.createElement('span');
        pill.className =
          'badge rounded-pill text-bg-primary d-inline-flex align-items-center badge-pill';
        const dots = buildGroupDots(
          groupMap.get(normalizeAngebotKey(label)) || [],
          angebotGroups,
        );
        const text = document.createElement('span');
        text.textContent = label;
        const removeButton = document.createElement('button');
        removeButton.className = 'btn btn-link btn-sm text-white p-0 ms-2';
        removeButton.type = 'button';
        removeButton.dataset.role = 'angebot-today-remove';
        removeButton.dataset.value = label;
        removeButton.textContent = '✕';
        removeButton.ariaLabel = `${label} entfernen`;
        removeButton.disabled = readOnly;
        pill.append(dots, text);
        if (!readOnly) {
          pill.append(removeButton);
        }
        list.appendChild(pill);
      });
      content.append(list);
    }
    return;
  }

  safeModules.forEach((module, index) => {
    const moduleId = module.id || `module-${index}`;
    const isActive = moduleId === activeModuleId || (!activeModuleId && index === 0);
    const navItem = document.createElement('li');
    navItem.className = 'nav-item';
    const navButton = document.createElement('button');
    navButton.type = 'button';
    navButton.className = `nav-link${isActive ? ' active' : ''}`;
    navButton.dataset.role = 'angebot-module-tab';
    navButton.dataset.moduleId = moduleId;
    navButton.textContent = module.tabLabel || module.descriptor || `Modul ${index + 1}`;
    navItem.appendChild(navButton);
    nav.appendChild(navItem);

    const pane = document.createElement('div');
    pane.className = `tab-pane fade${isActive ? ' show active' : ''}`;
    pane.dataset.moduleId = moduleId;
    const list = document.createElement('div');
    list.className = 'd-flex flex-wrap gap-2';
    list.dataset.role = 'angebot-module-list';
    list.dataset.moduleId = moduleId;

    const offers = assignmentMap[moduleId] || [];
    if (!offers.length) {
      const empty = document.createElement('p');
      empty.className = 'text-muted small mb-0';
      empty.textContent = 'Noch keine Angebote für dieses Modul erfasst.';
      list.appendChild(empty);
    } else {
      offers.forEach((label) => {
        const pill = document.createElement('span');
        pill.className =
          'badge rounded-pill text-bg-primary d-inline-flex align-items-center badge-pill';
        const dots = buildGroupDots(
          groupMap.get(normalizeAngebotKey(label)) || [],
          angebotGroups,
        );
        const text = document.createElement('span');
        text.textContent = label;
        const removeButton = document.createElement('button');
        removeButton.className = 'btn btn-link btn-sm text-white p-0 ms-2';
        removeButton.type = 'button';
        removeButton.dataset.role = 'angebot-today-remove';
        removeButton.dataset.value = label;
        removeButton.dataset.moduleId = moduleId;
        removeButton.textContent = '✕';
        removeButton.ariaLabel = `${label} entfernen`;
        removeButton.disabled = readOnly;
        pill.append(dots, text);
        if (!readOnly) {
          pill.append(removeButton);
        }
        list.appendChild(pill);
      });
    }

    pane.appendChild(list);
    content.appendChild(pane);
  });
};

const renderTopList = ({ container, stats, groupMap, angebotGroups, selectedSet }) => {
  if (!container) {
    return;
  }
  const selectedKeys = selectedSet instanceof Set ? selectedSet : new Set();
  const entries = Object.entries(stats || {}).map(([label, count]) => ({
    label,
    count: Number(count) || 0,
  }));
  const sorted = entries
    .filter((item) => item.count > 0)
    .sort((a, b) => {
      if (b.count !== a.count) {
        return b.count - a.count;
      }
      return a.label.localeCompare(b.label, 'de', { sensitivity: 'base' });
    });

  const availableTopItems = sorted
    .filter(({ label }) => !selectedKeys.has(normalizeAngebotKey(label)))
    .slice(0, 10);

  container.replaceChildren();
  if (!availableTopItems.length) {
    const empty = document.createElement('p');
    empty.className = 'text-muted small mb-0';
    empty.textContent = 'Noch keine Daten';
    container.appendChild(empty);
    return;
  }

  availableTopItems.forEach(({ label, count }) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.role = 'angebot-top-add';
    button.dataset.value = label;
    button.className =
      'btn btn-outline-secondary btn-sm observation-chip observation-top-button d-inline-flex align-items-center gap-2';
    const plus = document.createElement('span');
    plus.className = 'observation-top-plus';
    plus.textContent = '+';
    const dots = buildGroupDots(
      groupMap.get(normalizeAngebotKey(label)) || [],
      angebotGroups,
    );
    const text = document.createElement('span');
    text.textContent = label;
    const badge = document.createElement('span');
    badge.className = 'badge text-bg-light border observation-top-count';
    badge.textContent = String(count);
    button.append(plus, dots, text, badge);
    container.appendChild(button);
  });
};

const renderCatalogList = ({
  container,
  catalog,
  groupMap,
  angebotGroups,
  selectedSet,
  filters,
}) => {
  if (!container) {
    return;
  }
  const { selectedGroups, groupMode, selectedLetter, query } = filters;
  const activeLetter = filters.showAlphabet ? selectedLetter : 'ALL';
  const normalizedQuery = normalizeFilterQuery(query);
  const items = (Array.isArray(catalog) ? catalog : []).filter((entry) => {
    const label =
      typeof entry === 'string'
        ? normalizeAngebotText(entry)
        : normalizeAngebotText(entry?.text);
    if (!label) {
      return false;
    }
    if (activeLetter !== 'ALL' && label[0]?.toLocaleUpperCase() !== activeLetter) {
      return false;
    }
    if (normalizedQuery && !label.toLocaleLowerCase('de').includes(normalizedQuery)) {
      return false;
    }
    if (!selectedGroups.length) {
      return true;
    }
    const groups = normalizeAngebotGroups(
      groupMap.get(normalizeAngebotKey(label)) || entry.groups || [],
    );
    if (!groups.length) {
      return false;
    }
    if (groupMode === 'OR') {
      return selectedGroups.some((group) => groups.includes(group));
    }
    return selectedGroups.every((group) => groups.includes(group));
  });

  const sorted = items
    .map((entry) => ({
      label:
        typeof entry === 'string'
          ? normalizeAngebotText(entry)
          : normalizeAngebotText(entry?.text),
      groups: normalizeAngebotGroups(entry?.groups),
    }))
    .filter((entry) => entry.label)
    .sort((a, b) => a.label.localeCompare(b.label, 'de', { sensitivity: 'base' }));

  container.replaceChildren();
  if (!sorted.length) {
    const empty = document.createElement('p');
    empty.className = 'text-muted small mb-0 observation-templates__empty';
    empty.textContent = 'Keine passenden Angebote gefunden.';
    container.appendChild(empty);
    return;
  }

  const shouldGroup = true;
  const groups = new Map();
  sorted.forEach((entry) => {
    const initial = entry.label[0]?.toLocaleUpperCase() || '';
    const bucket = shouldGroup ? initial : '__all__';
    if (!groups.has(bucket)) {
      groups.set(bucket, []);
    }
    groups.get(bucket).push(entry);
  });

  groups.forEach((entries, key) => {
    const groupWrapper = document.createElement('div');
    groupWrapper.className = 'observation-templates__group';
    if (shouldGroup && key !== '__all__') {
      const heading = document.createElement('p');
      heading.className = 'observation-templates__letter';
      heading.textContent = key;
      groupWrapper.appendChild(heading);
    }
    const buttonRow = document.createElement('div');
    buttonRow.className = 'd-flex flex-wrap gap-2 observation-templates__group-buttons';
    entries.forEach((entry) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.role = 'angebot-add';
      button.dataset.value = entry.label;
      button.dataset.groups = entry.groups.join(',');
      const groupDots = buildGroupDots(entry.groups, angebotGroups);
      const isSelected = selectedSet.has(normalizeAngebotKey(entry.label));
      button.className =
        'btn btn-outline-secondary observation-chip observation-template-button d-inline-flex align-items-center';
      button.classList.toggle('is-selected', isSelected);
      const text = document.createElement('span');
      text.textContent = entry.label;
      button.append(groupDots, text);
      if (isSelected) {
        const badge = document.createElement('span');
        badge.className = 'badge text-bg-light border observation-top-count';
        badge.textContent = 'Heute';
        button.appendChild(badge);
      }
      buttonRow.appendChild(button);
    });
    groupWrapper.appendChild(buttonRow);
    container.appendChild(groupWrapper);
  });
};

  const renderLetterButtons = (overlay, catalog) => {
    const letterBar = overlay.querySelector('[data-role="angebot-letter-bar"]');
    if (!letterBar) {
      return;
    }
  const { selectedLetter } = getFilterState(overlay);
  const letters = new Set();
  (Array.isArray(catalog) ? catalog : []).forEach((entry) => {
    const label =
      typeof entry === 'string'
        ? normalizeAngebotText(entry)
        : normalizeAngebotText(entry?.text);
    if (label) {
      letters.add(label[0].toLocaleUpperCase());
    }
  });
  const addButton = (label, value) => {
    const isActive = value === selectedLetter;
    const button = document.createElement('button');
    button.className = `btn btn-outline-secondary btn-sm observation-letter${
      isActive ? ' active' : ''
    }`;
    button.type = 'button';
    button.dataset.role = 'angebot-letter';
    button.dataset.value = value;
    button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    button.textContent = label;
    letterBar.appendChild(button);
  };
  letterBar.replaceChildren();
  addButton('Alle', 'ALL');
  Array.from(letters)
    .filter((letter) => /^[A-ZÄÖÜ]/i.test(letter))
    .sort((a, b) => a.localeCompare(b, 'de'))
    .forEach((letter) => addButton(letter, letter));
};

const syncGroupUi = (overlay, angebotGroups) => {
  const {
    selectedGroups,
    groupMode,
    selectedLetter,
    showAndOr,
    showAlphabet,
    multiGroups,
    settingsOpen,
  } = getFilterState(overlay);
  const groupButtons = overlay.querySelectorAll('[data-role="angebot-group-filter"]');
  groupButtons.forEach((button) => {
    const value = button.dataset.value;
    const isActive = value ? selectedGroups.includes(value) : false;
    button.classList.toggle('active', isActive);
    button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    const color =
      angebotGroups && value && angebotGroups[value]?.color
        ? angebotGroups[value].color
        : '#6c757d';
    button.style.setProperty('--group-color', color);
  });

  const modeButtons = overlay.querySelectorAll('[data-role="angebot-group-mode"]');
  modeButtons.forEach((button) => {
    const value = button.dataset.value === 'OR' ? 'OR' : 'AND';
    const isActive = value === groupMode;
    const isDisabled = !multiGroups;
    button.classList.toggle('active', isActive);
    button.classList.toggle('is-disabled', isDisabled);
    button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    button.setAttribute('aria-disabled', isDisabled ? 'true' : 'false');
    button.disabled = isDisabled;
  });

  const letterButtons = overlay.querySelectorAll('[data-role="angebot-letter"]');
  letterButtons.forEach((button) => {
    const value = button.dataset.value || 'ALL';
    const isActive = value === (selectedLetter || 'ALL');
    button.classList.toggle('active', isActive);
    button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
  });
  const letterBar = overlay.querySelector('[data-role="angebot-letter-bar"]');
  if (letterBar) {
    letterBar.classList.toggle('d-none', !showAlphabet);
    letterBar.classList.toggle('is-hidden', !showAlphabet);
  }

  const multiSwitch = overlay.querySelector('[data-role="angebot-multi-switch"]');
  const alphabetSwitch = overlay.querySelector('[data-role="angebot-alphabet-switch"]');
  const andOrSwitch = overlay.querySelector('[data-role="angebot-andor-switch"]');
  if (multiSwitch instanceof HTMLInputElement) {
    multiSwitch.checked = multiGroups;
  }
  if (alphabetSwitch instanceof HTMLInputElement) {
    alphabetSwitch.checked = showAlphabet;
  }
  if (andOrSwitch instanceof HTMLInputElement) {
    andOrSwitch.checked = showAndOr;
    andOrSwitch.disabled = !multiGroups;
  }
  const andOrSwitchWrapper = andOrSwitch?.closest('.observation-templates__setting-option');
  if (andOrSwitchWrapper instanceof HTMLElement) {
    andOrSwitchWrapper.hidden = !multiGroups;
    andOrSwitchWrapper.classList.toggle('is-hidden', !multiGroups);
  }

  const settingsPanel = overlay.querySelector('[data-role="angebot-settings-panel"]');
  if (settingsPanel) {
    settingsPanel.hidden = !settingsOpen;
  }
  const groupModeToggle = overlay.querySelector('[data-role="angebot-group-mode-toggle"]');
  if (groupModeToggle) {
    const shouldShowGroupMode = multiGroups && showAndOr;
    groupModeToggle.hidden = !shouldShowGroupMode;
    groupModeToggle.classList.toggle('is-hidden', !shouldShowGroupMode);
  }
  const settingsToggle = overlay.querySelector('[data-role="angebot-settings-toggle"]');
  if (settingsToggle) {
    settingsToggle.setAttribute('aria-expanded', settingsOpen ? 'true' : 'false');
    settingsToggle.classList.toggle('is-active', settingsOpen);
  }
};

const persistFilters = debounce((overlay) => {
  const state = getFilterState(overlay);
  setSavedAngebotFilters({
    selectedGroups: state.selectedGroups,
    selectedLetter: state.selectedLetter,
    andOrMode: state.groupMode,
    multiGroups: state.multiGroups,
    showAndOr: state.showAndOr,
    showAlphabet: state.showAlphabet,
  });
}, 200);

const normalizeCatalog = (catalog) =>
  Array.isArray(catalog) ? catalog : Array.isArray(getAngebotCatalog()) ? getAngebotCatalog() : [];

export const bindAngebotCatalog = ({
  openButton,
  overlay,
  catalogOverlay,
  createOverlay,
  editOverlay,
  date,
  angebotGroups,
  selectedAngebote,
  catalog,
  topStats,
  savedFilters,
  readOnly = false,
  modules = [],
  moduleAssignments = {},
}) => {
  if (!overlay || !catalogOverlay || !createOverlay || !editOverlay) {
    return null;
  }

  let currentDate = date;
  let currentCatalog = normalizeCatalog(catalog);
  let currentTopStats = topStats || {};
  let currentSelected = Array.isArray(selectedAngebote) ? selectedAngebote : [];
  let currentModules = Array.isArray(modules) ? modules : [];
  let currentAssignments = normalizeModuleAssignments(
    currentModules,
    moduleAssignments,
    currentSelected,
  );
  currentSelected = flattenModuleAssignments(currentAssignments, currentSelected);
  let isReadOnly = Boolean(readOnly);
  let editingOffer = null;
  let longPressTimer = null;
  let suppressClick = false;
  let openButtonRef = openButton || null;

  const getActiveModuleId = () => {
    const active = overlay.dataset.activeModule;
    if (currentModules.some((module) => module.id === active)) {
      return active;
    }
    return currentModules[0]?.id || '';
  };

  const setAssignments = (assignments, aggregatedFallback = currentSelected) => {
    currentAssignments = normalizeModuleAssignments(
      currentModules,
      assignments,
      aggregatedFallback,
    );
    currentSelected = flattenModuleAssignments(currentAssignments, aggregatedFallback);
  };

  const findModuleForOffer = (label) => {
    const targetKey = normalizeAngebotKey(label);
    if (!targetKey) {
      return '';
    }
    for (const module of currentModules) {
      const list = currentAssignments[module.id] || [];
      const hasOffer = list.some(
        (item) => normalizeAngebotKey(item) === targetKey,
      );
      if (hasOffer) {
        return module.id;
      }
    }
    return '';
  };

  const closeDrawerIfOpen = () => {
    const drawerEl = document.getElementById('mainDrawer');
    if (!drawerEl || !drawerEl.classList.contains('show')) {
      return;
    }
    const closeButton = drawerEl.querySelector('[data-bs-dismiss="offcanvas"]');
    if (closeButton instanceof HTMLElement) {
      closeButton.click();
    }
    drawerEl.classList.remove('show');
    drawerEl.setAttribute('aria-hidden', 'true');
    const backdrop = document.querySelector('.offcanvas-backdrop');
    backdrop?.parentElement?.removeChild(backdrop);
  };

  setFilterState(catalogOverlay, {
    filter: savedFilters?.selectedLetter || 'ALL',
    groups: normalizeAngebotGroups(savedFilters?.selectedGroups || []).join(','),
    groupMode: savedFilters?.andOrMode === 'OR' ? 'OR' : 'AND',
    multi: savedFilters?.multiGroups === true,
    showAndOr: savedFilters?.showAndOr !== false,
    showAlphabet: savedFilters?.showAlphabet === true,
  });

  const getGroupMap = () => buildAngebotCatalogGroupMap(currentCatalog);

  const setOpenButton = (button) => {
    if (openButtonRef && openButtonRef instanceof HTMLElement) {
      openButtonRef.removeEventListener('click', handleOpen);
    }
    openButtonRef = button || null;
    if (openButtonRef && openButtonRef instanceof HTMLElement) {
      openButtonRef.addEventListener('click', handleOpen);
    }
  };

  const getSelectedKeys = () => {
    const selectedList = flattenModuleAssignments(currentAssignments, currentSelected);
    return new Set(selectedList.map((item) => normalizeAngebotKey(item)).filter(Boolean));
  };

  const getSelectedKeysForActiveModule = () => {
    const activeModuleId = getActiveModuleId();
    if (!activeModuleId) {
      return new Set();
    }
    const moduleOffers = Array.isArray(currentAssignments[activeModuleId])
      ? currentAssignments[activeModuleId]
      : [];
    return new Set(moduleOffers.map((item) => normalizeAngebotKey(item)).filter(Boolean));
  };

  const render = () => {
    const groupMap = getGroupMap();
    const filters = getFilterState(catalogOverlay);
    const selectedList = flattenModuleAssignments(currentAssignments, currentSelected);
    const selectedKeys = new Set(
      selectedList.map((item) => normalizeAngebotKey(item)).filter(Boolean),
    );
    const activeModuleSelectedKeys = getSelectedKeysForActiveModule();
    const topList = overlay.querySelector('[data-role="angebot-top-list"]');
    renderModuleTabs({
      overlay,
      modules: currentModules,
      assignments: currentAssignments,
      groupMap,
      angebotGroups,
      readOnly: isReadOnly,
      fallbackOffers: selectedList,
    });
    renderTopList({
      container: topList,
      stats: currentTopStats,
      groupMap,
      angebotGroups,
      selectedSet: activeModuleSelectedKeys,
    });
    const catalogList = catalogOverlay.querySelector('[data-role="angebot-catalog-list"]');
    renderCatalogList({
      container: catalogList,
      catalog: currentCatalog,
      groupMap,
      angebotGroups,
      selectedSet: activeModuleSelectedKeys,
      filters,
    });
    renderLetterButtons(catalogOverlay, currentCatalog);
    const searchInput = catalogOverlay.querySelector('[data-role="angebot-search"]');
    if (searchInput instanceof HTMLInputElement) {
      searchInput.value = filters.query || '';
    }
    syncGroupUi(catalogOverlay, angebotGroups);
  };

  const openOverlay = () => {
    if (isReadOnly) {
      return;
    }
    closeDrawerIfOpen();
    overlay.classList.add('is-open');
    overlay.setAttribute('aria-hidden', 'false');
    document.body.classList.add('observation-overlay-open');
    render();
  };

  const closeOverlay = () => {
    overlay.classList.remove('is-open');
    overlay.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('observation-overlay-open');
    closeCreateOverlay();
    closeEditOverlay();
    catalogOverlay.classList.remove('is-open');
    catalogOverlay.setAttribute('aria-hidden', 'true');
  };

  const focusCatalogSearchInput = () => {
    const searchInput = catalogOverlay.querySelector('[data-role="angebot-search"]');
    if (!(searchInput instanceof HTMLInputElement) || searchInput.disabled || searchInput.readOnly) {
      return;
    }
    const caret = searchInput.value.length;
    requestAnimationFrame(() => {
      searchInput.focus({ preventScroll: true });
      searchInput.setSelectionRange(caret, caret);
    });
  };

  const openCatalogOverlay = () => {
    if (isReadOnly) {
      return;
    }
    closeDrawerIfOpen();
    catalogOverlay.classList.add('is-open');
    catalogOverlay.setAttribute('aria-hidden', 'false');
    render();
    focusCatalogSearchInput();
  };
  const closeCatalogOverlay = () => {
    catalogOverlay.classList.remove('is-open');
    catalogOverlay.setAttribute('aria-hidden', 'true');
  };

  const setCreateGroups = (groups) => {
    const normalized = normalizeAngebotGroups(groups);
    createOverlay.dataset.selectedGroups = normalized.join(',');
    const buttons = createOverlay.querySelectorAll('[data-role="angebot-create-group"]');
    buttons.forEach((button) => {
      const isActive = normalized.includes(button.dataset.value || '');
      button.classList.toggle('active', isActive);
      button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });
  };

  const getCreateGroups = () =>
    normalizeAngebotGroups(
      typeof createOverlay.dataset.selectedGroups === 'string'
        ? createOverlay.dataset.selectedGroups.split(',')
        : [],
    );

  const updateCreatePreview = () => {
    const input = createOverlay.querySelector('[data-role="angebot-create-input"]');
    const previewPill = createOverlay.querySelector('[data-role="angebot-create-preview-pill"]');
    const previewText = createOverlay.querySelector('[data-role="angebot-create-preview-text"]');
    const previewDots = createOverlay.querySelector('[data-role="angebot-create-preview-dots"]');
    const previewEmpty = createOverlay.querySelector('[data-role="angebot-create-preview-empty"]');
    if (!(input instanceof HTMLInputElement) || !(previewPill instanceof HTMLElement)) {
      return;
    }
    const text = normalizeAngebotText(input.value);
    const groups = getCreateGroups();
    const hasText = Boolean(text);
    previewPill.hidden = !hasText;
    if (previewEmpty instanceof HTMLElement) {
      previewEmpty.hidden = hasText;
    }
    if (!hasText) {
      if (previewText instanceof HTMLElement) {
        previewText.textContent = '';
      }
      if (previewDots instanceof HTMLElement) {
        previewDots.textContent = '';
      }
      return;
    }
    if (previewText instanceof HTMLElement) {
      previewText.textContent = text;
    }
    if (previewDots instanceof HTMLElement) {
      previewDots.replaceChildren(buildGroupDots(groups, angebotGroups));
    }
  };

  const openCreateOverlay = () => {
    if (isReadOnly) {
      return;
    }
    closeCatalogOverlay();
    createOverlay.classList.add('is-open');
    createOverlay.setAttribute('aria-hidden', 'false');
    setCreateGroups([]);
    const input = createOverlay.querySelector('[data-role="angebot-create-input"]');
    if (input instanceof HTMLInputElement) {
      input.tabIndex = 0;
    }
    focusTextInput(input, { resetValue: true, caret: 'end' });
    updateCreatePreview();
  };

  const closeCreateOverlay = () => {
    createOverlay.classList.remove('is-open');
    createOverlay.setAttribute('aria-hidden', 'true');
  };

  const setEditGroups = (groups) => {
    const normalized = normalizeAngebotGroups(groups);
    editOverlay.dataset.selectedGroups = normalized.join(',');
    const buttons = editOverlay.querySelectorAll('[data-role="angebot-edit-group"]');
    buttons.forEach((button) => {
      const isActive = normalized.includes(button.dataset.value || '');
      button.classList.toggle('active', isActive);
      button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });
  };

  const getEditGroups = () =>
    normalizeAngebotGroups(
      typeof editOverlay.dataset.selectedGroups === 'string'
        ? editOverlay.dataset.selectedGroups.split(',')
        : [],
    );

  const openEditOverlay = ({ text, groups }) => {
    if (!text) {
      return;
    }
    editingOffer = { text };
    editOverlay.classList.add('is-open');
    editOverlay.setAttribute('aria-hidden', 'false');
    setEditGroups(groups || []);
    const input = editOverlay.querySelector('[data-role="angebot-edit-input"]');
    if (input instanceof HTMLInputElement) {
      input.value = text;
      input.focus();
      input.select();
    }
  };

  const closeEditOverlay = () => {
    editingOffer = null;
    editOverlay.classList.remove('is-open');
    editOverlay.setAttribute('aria-hidden', 'true');
  };

  const addOfferForDate = (label, moduleId = '') => {
    const normalized = normalizeAngebotText(label);
    if (!normalized) {
      return;
    }
    const targetModule = moduleId || getActiveModuleId();
    const entry = getEntry(currentDate);
    const hasModules = Array.isArray(currentModules) && currentModules.length > 0;
    if (!hasModules) {
      const currentList = Array.isArray(entry.angebote) ? entry.angebote : [];
      if (currentList.includes(normalized)) {
        return;
      }
      const nextSelected = [...currentList, normalized];
      addPreset('angebote', normalized);
      upsertAngebotCatalogEntry(normalized);
      updateEntry(currentDate, { angebote: nextSelected });
      currentSelected = nextSelected;
      currentAssignments = {};
      render();
      return;
    }

    if (!targetModule) {
      return;
    }

    const baseAssignments =
      entry && entry.angebotModules && typeof entry.angebotModules === 'object'
        ? entry.angebotModules
        : currentAssignments;
    const existingModuleOffers = Array.isArray(baseAssignments?.[targetModule])
      ? baseAssignments[targetModule]
      : [];
    const normalizedKey = normalizeAngebotKey(normalized);
    const alreadyExists = existingModuleOffers.some(
      (item) => normalizeAngebotKey(item) === normalizedKey,
    );
    if (alreadyExists) {
      return;
    }
    const nextAssignments = {
      ...baseAssignments,
      [targetModule]: [...existingModuleOffers, normalized],
    };
    addPreset('angebote', normalized);
    upsertAngebotCatalogEntry(normalized);
    updateEntry(currentDate, { angebotModules: nextAssignments });
    setAssignments(nextAssignments);
    render();
  };

  const removeOfferForDate = (label, moduleId = '') => {
    const normalized = normalizeAngebotText(label);
    if (!normalized) {
      return;
    }
    const entry = getEntry(currentDate);
    const hasModules = Array.isArray(currentModules) && currentModules.length > 0;
    if (!hasModules) {
      const currentList = Array.isArray(entry.angebote) ? entry.angebote : [];
      const updated = currentList.filter((item) => normalizeAngebotText(item) !== normalized);
      updateEntry(currentDate, { angebote: updated });
      currentSelected = updated;
      currentAssignments = {};
      render();
      return;
    }

    const baseAssignments =
      entry && entry.angebotModules && typeof entry.angebotModules === 'object'
        ? entry.angebotModules
        : currentAssignments;
    const targetModule = moduleId || getActiveModuleId();

    if (!targetModule) {
      const stripped = {};
      currentModules.forEach((module) => {
        stripped[module.id] = (baseAssignments[module.id] || []).filter(
          (item) => normalizeAngebotText(item) !== normalized,
        );
      });
      updateEntry(currentDate, { angebotModules: stripped });
      setAssignments(stripped);
      render();
      return;
    }

    const updatedAssignments = { ...baseAssignments };
    updatedAssignments[targetModule] = (updatedAssignments[targetModule] || []).filter(
      (item) => normalizeAngebotText(item) !== normalized,
    );
    updateEntry(currentDate, { angebotModules: updatedAssignments });
    setAssignments(updatedAssignments);
    render();
  };

  const handleOpen = () => {
    openOverlay();
  };

  const handleOverlayClick = (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    const settingsPanel = catalogOverlay.querySelector('[data-role="angebot-settings-panel"]');
    const isSettingsToggle = target.closest('[data-role="angebot-settings-toggle"]');
    const { settingsOpen } = getFilterState(catalogOverlay);
    if (
      settingsOpen &&
      settingsPanel &&
      !isSettingsToggle &&
      !settingsPanel.contains(target)
    ) {
      setFilterState(catalogOverlay, { settingsOpen: false });
      syncGroupUi(catalogOverlay, angebotGroups);
    }
    const moduleTab = target.closest('[data-role="angebot-module-tab"]');
    if (moduleTab) {
      overlay.dataset.activeModule = moduleTab.dataset.moduleId || '';
      render();
      return;
    }
    if (target === overlay || target.closest('[data-role="angebot-close"]')) {
      closeOverlay();
      return;
    }
    if (target === catalogOverlay) {
      closeCatalogOverlay();
      return;
    }
    if (target.closest('[data-role="angebot-catalog-close"]')) {
      closeCatalogOverlay();
      return;
    }
    if (target.closest('[data-role="angebot-create-open"]')) {
      openCreateOverlay();
      return;
    }
    if (target.closest('[data-role="angebot-create-close"]')) {
      closeCreateOverlay();
      return;
    }
    if (target.closest('[data-role="angebot-edit-close"]')) {
      closeEditOverlay();
      return;
    }
    if (target.closest('[data-role="angebot-catalog-open"]')) {
      openCatalogOverlay();
      return;
    }
    const settingsToggle = target.closest('[data-role="angebot-settings-toggle"]');
    if (settingsToggle) {
      const current = getFilterState(catalogOverlay);
      setFilterState(catalogOverlay, { settingsOpen: !current.settingsOpen });
      syncGroupUi(catalogOverlay, angebotGroups);
      return;
    }
    const multiSwitch = target.closest('[data-role="angebot-multi-switch"]');
    if (multiSwitch instanceof HTMLInputElement) {
      setFilterState(catalogOverlay, { multi: multiSwitch.checked });
      syncGroupUi(catalogOverlay, angebotGroups);
      persistFilters(catalogOverlay);
      return;
    }
    const alphabetSwitch = target.closest('[data-role="angebot-alphabet-switch"]');
    if (alphabetSwitch instanceof HTMLInputElement) {
      setFilterState(catalogOverlay, { showAlphabet: alphabetSwitch.checked });
      syncGroupUi(catalogOverlay, angebotGroups);
      render();
      persistFilters(catalogOverlay);
      return;
    }
    const andOrSwitch = target.closest('[data-role="angebot-andor-switch"]');
    if (andOrSwitch instanceof HTMLInputElement) {
      setFilterState(catalogOverlay, { showAndOr: andOrSwitch.checked });
      syncGroupUi(catalogOverlay, angebotGroups);
      persistFilters(catalogOverlay);
      return;
    }
    const groupButton = target.closest('[data-role="angebot-group-filter"]');
    if (groupButton) {
      const value = groupButton.dataset.value;
      if (!value) {
        return;
      }
      const state = getFilterState(catalogOverlay);
      const selected = new Set(state.selectedGroups);
      if (selected.has(value)) {
        selected.delete(value);
      } else {
        if (!state.multiGroups) {
          selected.clear();
        }
        selected.add(value);
      }
      setFilterState(catalogOverlay, { groups: Array.from(selected).join(',') });
      syncGroupUi(catalogOverlay, angebotGroups);
      render();
      persistFilters(catalogOverlay);
      return;
    }
    const groupModeButton = target.closest('[data-role="angebot-group-mode"]');
    if (groupModeButton) {
      const { multiGroups } = getFilterState(catalogOverlay);
      if (!multiGroups) {
        return;
      }
      const value = groupModeButton.dataset.value === 'OR' ? 'OR' : 'AND';
      setFilterState(catalogOverlay, { groupMode: value });
      syncGroupUi(catalogOverlay, angebotGroups);
      render();
      persistFilters(catalogOverlay);
      return;
    }
    const letterButton = target.closest('[data-role="angebot-letter"]');
    if (letterButton) {
      const value = letterButton.dataset.value || 'ALL';
      setFilterState(catalogOverlay, { filter: value });
      syncGroupUi(catalogOverlay, angebotGroups);
      render();
      persistFilters(catalogOverlay);
      return;
    }
    const topButton = target.closest('[data-role="angebot-top-add"]');
    if (topButton) {
      if (isReadOnly) {
        return;
      }
      const value = topButton.dataset.value;
      if (value) {
        const moduleId = getActiveModuleId();
        addOfferForDate(value, moduleId);
      }
      return;
    }
    const todayRemove = target.closest('[data-role="angebot-today-remove"]');
    if (todayRemove) {
      if (isReadOnly) {
        return;
      }
      const value = todayRemove.dataset.value;
      if (value) {
        const moduleId =
          todayRemove.dataset.moduleId ||
          findModuleForOffer(value) ||
          getActiveModuleId();
        removeOfferForDate(value, moduleId);
      }
      return;
    }
    const catalogButton = target.closest('[data-role="angebot-add"]');
    if (catalogButton) {
      if (isReadOnly || suppressClick) {
        return;
      }
      const value = catalogButton.dataset.value;
      if (value) {
        const activeModuleSelectedKeys = getSelectedKeysForActiveModule();
        const key = normalizeAngebotKey(value);
        const activeModuleId = getActiveModuleId();
        if (activeModuleSelectedKeys.has(key)) {
          removeOfferForDate(value, activeModuleId);
          catalogButton.classList.remove('is-selected');
        } else {
          addOfferForDate(value, activeModuleId);
          catalogButton.classList.add('is-selected');
        }
      }
    }
  };

  const handlePointerDown = (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    const button = target.closest('[data-role="angebot-add"]');
    if (!button || isReadOnly) {
      return;
    }
    if (event.pointerType === 'mouse' && event.button !== 0) {
      return;
    }
    if (longPressTimer) {
      window.clearTimeout(longPressTimer);
      longPressTimer = null;
    }
    longPressTimer = window.setTimeout(() => {
      suppressClick = true;
      const text = button.dataset.value;
      const groups = normalizeAngebotGroups(button.dataset.groups?.split(','));
      if (text) {
        openEditOverlay({ text, groups });
      }
      longPressTimer = null;
    }, LONG_PRESS_MS);
  };

  const handlePointerUp = () => {
    if (longPressTimer) {
      window.clearTimeout(longPressTimer);
      longPressTimer = null;
    }
    if (suppressClick) {
      window.setTimeout(() => {
        suppressClick = false;
      }, 0);
    }
  };

  const handleSearchInput = (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) {
      return;
    }
    if (target.dataset.role !== 'angebot-search') {
      return;
    }
    setFilterState(catalogOverlay, { query: normalizeFilterQuery(target.value) });
    render();
  };

  const handleCreateSubmit = (event) => {
    if (!(event.target instanceof HTMLFormElement)) {
      return;
    }
    if (event.target.dataset.role !== 'angebot-create-form') {
      return;
    }
    event.preventDefault();
    if (isReadOnly) {
      closeCreateOverlay();
      return;
    }
    const input = event.target.querySelector('[data-role="angebot-create-input"]');
    if (!(input instanceof HTMLInputElement)) {
      return;
    }
    const normalized = normalizeAngebotText(input.value);
    if (!normalized) {
      return;
    }
    const activeModuleSelectedKeys = getSelectedKeysForActiveModule();
    if (activeModuleSelectedKeys.has(normalizeAngebotKey(normalized))) {
      closeCreateOverlay();
      return;
    }
    const groups = getCreateGroups();
    const resolved = upsertAngebotCatalogEntry(normalized, groups);
    if (resolved) {
      addOfferForDate(resolved, getActiveModuleId());
    }
    closeCreateOverlay();
  };

  const handleEditSubmit = (event) => {
    if (!(event.target instanceof HTMLFormElement)) {
      return;
    }
    if (event.target.dataset.role !== 'angebot-edit-form') {
      return;
    }
    event.preventDefault();
    if (!editingOffer) {
      closeEditOverlay();
      return;
    }
    const input = event.target.querySelector('[data-role="angebot-edit-input"]');
    if (!(input instanceof HTMLInputElement)) {
      return;
    }
    const normalized = normalizeAngebotText(input.value);
    if (!normalized) {
      return;
    }
    const groups = getEditGroups();
    updateAngebotCatalogEntry({
      currentText: editingOffer.text,
      nextText: normalized,
      groups,
    });
    closeEditOverlay();
  };

  const handleCreateClick = (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    const closeButton = target.closest('[data-role="angebot-create-close"]');
    if (closeButton) {
      closeCreateOverlay();
      return;
    }
    const groupButton = target.closest('[data-role="angebot-create-group"]');
    if (groupButton) {
      const value = groupButton.dataset.value;
      if (!value) {
        return;
      }
      const selected = new Set(getCreateGroups());
      if (selected.has(value)) {
        selected.delete(value);
      } else {
        selected.add(value);
      }
      setCreateGroups(Array.from(selected));
      updateCreatePreview();
      return;
    }
    const cancel = target.closest('[data-role="angebot-create-cancel"]');
    if (cancel) {
      closeCreateOverlay();
    }
  };

  const handleEditClick = (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    const groupButton = target.closest('[data-role="angebot-edit-group"]');
    if (groupButton) {
      const value = groupButton.dataset.value;
      if (!value) {
        return;
      }
      const selected = new Set(getEditGroups());
      if (selected.has(value)) {
        selected.delete(value);
      } else {
        selected.add(value);
      }
      setEditGroups(Array.from(selected));
    }
  };

  overlay.addEventListener('click', handleOverlayClick);
  catalogOverlay.addEventListener('click', handleOverlayClick);
  catalogOverlay.addEventListener('pointerdown', handlePointerDown);
  catalogOverlay.addEventListener('pointerup', handlePointerUp);
  catalogOverlay.addEventListener('pointercancel', handlePointerUp);
  catalogOverlay.addEventListener('input', handleSearchInput);
  createOverlay.addEventListener('input', (event) => {
    const target = event.target;
    if (target instanceof HTMLInputElement && target.dataset.role === 'angebot-create-input') {
      updateCreatePreview();
    }
  });
  createOverlay.addEventListener('click', handleCreateClick);
  createOverlay.addEventListener('submit', handleCreateSubmit);
  editOverlay.addEventListener('click', handleEditClick);
  editOverlay.addEventListener('submit', handleEditSubmit);
  setOpenButton(openButtonRef);

  return {
    update: ({
      date: nextDate,
      selectedAngebote: nextSelected,
      catalog: nextCatalog,
      topStats: nextStats,
      angebotGroups: nextGroups,
      savedFilters: nextSavedFilters,
      readOnly: nextReadOnly = false,
      openButton: nextOpenButton,
      modules: nextModules = currentModules,
      moduleAssignments: nextModuleAssignments = currentAssignments,
    }) => {
      currentDate = nextDate || currentDate;
      currentCatalog = normalizeCatalog(nextCatalog || currentCatalog);
      currentTopStats = nextStats || {};
      currentModules = Array.isArray(nextModules) ? nextModules : [];
      setAssignments(nextModuleAssignments, nextSelected || currentSelected);
      if (!currentModules.length) {
        overlay.dataset.activeModule = '';
      } else if (!currentModules.some((module) => module.id === overlay.dataset.activeModule)) {
        overlay.dataset.activeModule = currentModules[0].id;
      }
      isReadOnly = Boolean(nextReadOnly);
      angebotGroups = nextGroups || angebotGroups;
      if (nextSavedFilters) {
        setFilterState(catalogOverlay, {
          filter: nextSavedFilters.selectedLetter || catalogOverlay.dataset.angebotFilter || 'ALL',
          groups: normalizeAngebotGroups(nextSavedFilters.selectedGroups || []).join(','),
          groupMode: nextSavedFilters.andOrMode === 'OR' ? 'OR' : 'AND',
          multi: nextSavedFilters.multiGroups === true,
          showAndOr: nextSavedFilters.showAndOr !== false,
          showAlphabet: nextSavedFilters.showAlphabet === true,
        });
      }
      syncGroupUi(catalogOverlay, angebotGroups);
      render();
      if (nextOpenButton) {
        setOpenButton(nextOpenButton);
      }
      if (openButtonRef) {
        openButtonRef.disabled = isReadOnly;
      }
    },
  };
};
