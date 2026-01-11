import {
  addPreset,
  getChildrenList,
  getEntry,
  getPresets,
  removeObservationCatalogEntry,
  upsertObservationCatalogEntry,
  updateObservationCatalogEntry,
  updateEntry,
} from '../db/dbRepository.js';
import { buildObservationTemplatesOverlay } from '../ui/components.js';
import { debounce } from '../utils/debounce.js';
import { normalizeObservationGroups } from '../utils/observationCatalog.js';
import { setSavedObservationFilters } from '../state/store.js';
import { formatDisplayDate } from '../utils/schoolWeeks.js';
import { focusTextInput } from '../utils/focus.js';

const normalizeObservationInput = (value) => {
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim().replace(/\s+/g, ' ');
};

const normalizeObservationKey = (value) =>
  normalizeObservationInput(value).toLocaleLowerCase();

const normalizeObservationList = (value) => {
  if (typeof value === 'string') {
    const trimmed = normalizeObservationInput(value);
    return trimmed ? [trimmed] : [];
  }

  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return normalizeObservationList(value.tags);
  }

  if (!Array.isArray(value)) {
    return [];
  }

  const unique = new Set();
  const result = [];
  value.forEach((item) => {
    if (typeof item !== 'string') {
      return;
    }
    const trimmed = normalizeObservationInput(item);
    if (!trimmed || unique.has(trimmed)) {
      return;
    }
    unique.add(trimmed);
    result.push(trimmed);
  });

  return result;
};

const LONG_PRESS_MS = 600;
let pendingTemplateRestore = null;

const getAbsentChildren = (entry) =>
  Array.isArray(entry?.absentChildIds) ? entry.absentChildIds : [];

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

const orderAbsentChildren = (absentSet) => {
  const children = getChildrenList();
  if (Array.isArray(children) && children.length) {
    return children.filter((child) => absentSet.has(child));
  }
  return Array.from(absentSet).sort((a, b) => a.localeCompare(b, 'de'));
};

const toggleAbsentChild = (date, child) => {
  if (!child) {
    return;
  }
  const entry = getEntry(date);
  const absentSet = new Set(getAbsentChildren(entry));
  if (absentSet.has(child)) {
    absentSet.delete(child);
  } else {
    absentSet.add(child);
  }
  updateEntry(date, { absentChildIds: orderAbsentChildren(absentSet) });
};

const isHtmlElement = (value) => value instanceof HTMLElement;
const isInputElement = (value) => value instanceof HTMLInputElement;
const isTextAreaElement = (value) => value instanceof HTMLTextAreaElement;
const isFormElement = (value) => value instanceof HTMLFormElement;
const getCardChild = (card) => card?.dataset?.child || null;
const getDetailChild = (element) => element?.closest('[data-child]')?.dataset?.child || null;
const syncNoteInputState = (panel) => {
  if (!panel) {
    return;
  }
  const noteInput = panel.querySelector('[data-role="observation-note-input"]');
  if (!isTextAreaElement(noteInput)) {
    return;
  }
  noteInput.disabled = panel.dataset.absent === 'true';
};

export const getInitialLetters = (children) => {
  if (!Array.isArray(children)) {
    return [];
  }

  const letters = new Set();
  children.forEach((child) => {
    if (typeof child !== 'string') {
      return;
    }
    const trimmed = child.trim();
    if (!trimmed) {
      return;
    }
    letters.add(trimmed[0].toLocaleUpperCase());
  });

  return Array.from(letters).sort((a, b) => a.localeCompare(b));
};

export const applyInitialFilter = (children, selectedInitial) => {
  if (!Array.isArray(children)) {
    return [];
  }

  if (
    typeof selectedInitial !== 'string' ||
    !selectedInitial.trim() ||
    selectedInitial === 'ALL'
  ) {
    return [...children];
  }

  const normalized = selectedInitial.trim().toLocaleUpperCase();

  return children.filter((child) => {
    if (typeof child !== 'string') {
      return false;
    }
    const trimmed = child.trim();
    if (!trimmed) {
      return false;
    }
    return trimmed[0].toLocaleUpperCase() === normalized;
  });
};

const getObservationTags = (entry, child) =>
  entry.observations && entry.observations[child]
    ? entry.observations[child]
    : [];

const addTagForChild = (date, child, value) => {
  const trimmed = normalizeObservationInput(value);
  if (!trimmed) {
    return;
  }

  updateEntry(date, {
    observations: {
      [child]: [trimmed],
    },
  });
};

const removeObservationForChild = (date, child, tag) => {
  const entry = getEntry(date);
  const updatedTags = normalizeObservationList(getObservationTags(entry, child)).filter(
    (item) => item !== tag,
  );

  updateEntry(date, {
    observations: {
      [child]: {
        items: updatedTags,
        replace: true,
      },
    },
  });
};

const getObservationPresets = () => getPresets('observations');

const findExistingPreset = (presets, value) => {
  const normalized = normalizeObservationKey(value);
  if (!normalized) {
    return null;
  }

  return presets.find(
    (preset) => normalizeObservationKey(preset) === normalized,
  );
};

const normalizeTemplateQuery = (value) =>
  typeof value === 'string' ? value.trim().toLocaleLowerCase() : '';

const normalizeTemplateGroups = (value) =>
  typeof value === 'string'
    ? value
        .split(',')
        .map((group) => group.trim().toLocaleUpperCase())
        .filter(Boolean)
    : [];

const getTemplateFlags = (container) => ({
  multiGroups: container?.dataset.templateMulti === 'true',
  showAndOr: container?.dataset.templateShowAndOr === 'true',
  showAlphabet: container?.dataset.templateShowAlphabet === 'true',
  settingsOpen: container?.dataset.templateSettingsOpen === 'true',
});

const persistTemplateFilters = (container) => {
  if (!container) {
    return;
  }
  const selectedGroups = normalizeTemplateGroups(container.dataset.templateGroups || '');
  const templateFilter = container.dataset.templateFilter || 'ALL';
  const { multiGroups, showAlphabet, showAndOr } = getTemplateFlags(container);
  const templateGroupMode =
    container.dataset.templateGroupMode === 'OR' ? 'OR' : 'AND';
  setSavedObservationFilters({
    multiGroups,
    showAndOr,
    showAlphabet,
    andOrMode: templateGroupMode,
    selectedGroups,
    selectedLetter: templateFilter || 'ALL',
  });
};

const updateTemplateControls = (container, { syncInput = false } = {}) => {
  if (!container) {
    return;
  }
  const selectedGroups = normalizeTemplateGroups(container.dataset.templateGroups || '');
  const selectedLetter = container.dataset.templateFilter || 'ALL';
  const { multiGroups, showAlphabet, showAndOr, settingsOpen } = getTemplateFlags(container);
  const groupMode = container.dataset.templateGroupMode === 'OR' ? 'OR' : 'AND';
  const showGroupModesInline = multiGroups && showAndOr;
  const showGroupModesInSettings = multiGroups && !showAndOr;

  const groupButtons = container.querySelectorAll(
    '[data-role="observation-template-group-filter"]',
  );
  groupButtons.forEach((button) => {
    const isActive = selectedGroups.includes(button.dataset.value || '');
    button.classList.toggle('active', isActive);
    button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
  });

  const groupModeButtons = container.querySelectorAll(
    '[data-role="observation-template-group-mode"]',
  );
  groupModeButtons.forEach((button) => {
    const isActive = button.dataset.value === groupMode;
    const isDisabled = !multiGroups;
    button.classList.toggle('active', isActive);
    button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    button.classList.toggle('is-disabled', isDisabled);
    button.disabled = isDisabled;
    button.setAttribute('aria-disabled', isDisabled ? 'true' : 'false');
  });
  const groupModeToggle = container.querySelector(
    '[data-role="observation-template-group-mode-toggle"]',
  );
  if (isHtmlElement(groupModeToggle)) {
    groupModeToggle.hidden = !showGroupModesInline;
    groupModeToggle.classList.toggle('is-hidden', !showGroupModesInline);
  }
  const settingsMode = container.querySelector(
    '[data-role="observation-template-group-mode-settings"]',
  );
  if (isHtmlElement(settingsMode)) {
    settingsMode.hidden = !showGroupModesInSettings;
  }

  const letterBar = container.querySelector('[data-role="observation-template-letter-bar"]');
  const letterButtons = container.querySelectorAll('[data-role="observation-template-letter"]');
  letterButtons.forEach((button) => {
    const isActive = button.dataset.value === selectedLetter;
    button.classList.toggle('active', isActive);
    button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
  });
  if (isHtmlElement(letterBar)) {
    letterBar.hidden = !showAlphabet;
    letterBar.classList.toggle('is-hidden', !showAlphabet);
  }

  const multiSwitch = container.querySelector('[data-role="observation-template-multi-switch"]');
  if (isInputElement(multiSwitch)) {
    multiSwitch.checked = multiGroups;
  }

  const alphabetSwitch = container.querySelector(
    '[data-role="observation-template-alphabet-switch"]',
  );
  if (isInputElement(alphabetSwitch)) {
    alphabetSwitch.checked = showAlphabet;
  }
  const andOrSwitch = container.querySelector(
    '[data-role="observation-template-andor-switch"]',
  );
  if (isInputElement(andOrSwitch)) {
    andOrSwitch.checked = showAndOr;
    andOrSwitch.disabled = !multiGroups;
  }
  const andOrSwitchWrapper = andOrSwitch?.closest('.observation-templates__setting-option');
  if (isHtmlElement(andOrSwitchWrapper)) {
    andOrSwitchWrapper.hidden = !multiGroups;
    andOrSwitchWrapper.classList.toggle('is-hidden', !multiGroups);
  }

  const settingsPanel = container.querySelector(
    '[data-role="observation-template-settings-panel"]',
  );
  if (isHtmlElement(settingsPanel)) {
    settingsPanel.hidden = !settingsOpen;
  }

  const settingsToggle = container.querySelector(
    '[data-role="observation-template-settings-toggle"]',
  );
  if (isHtmlElement(settingsToggle)) {
    settingsToggle.setAttribute('aria-expanded', settingsOpen ? 'true' : 'false');
    settingsToggle.classList.toggle('is-active', settingsOpen);
  }

  if (syncInput) {
    const searchInput = container.querySelector('[data-role="observation-template-search"]');
    if (isInputElement(searchInput)) {
      searchInput.value = container.dataset.templateQuery || '';
    }
  }
};

const updateTemplateButtonState = (button, isSelected) => {
  if (!isHtmlElement(button)) {
    return;
  }
  button.classList.toggle('is-selected', isSelected);
  button.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
};

const matchesTemplateGroups = ({ selectedGroups, buttonGroups, mode }) => {
  if (!selectedGroups.length) {
    return true;
  }
  if (!buttonGroups.length) {
    return false;
  }

  if (mode === 'OR') {
    return selectedGroups.some((group) => buttonGroups.includes(group));
  }

  return selectedGroups.every((group) => buttonGroups.includes(group));
};

const applyTemplateFilters = (container) => {
  const { showAlphabet } = getTemplateFlags(container);
  const selectedInitial =
    showAlphabet && container.dataset.templateFilter
      ? container.dataset.templateFilter
      : 'ALL';
  const normalizedQuery = normalizeTemplateQuery(container.dataset.templateQuery || '');
  const selectedGroups = normalizeTemplateGroups(
    container.dataset.templateGroups || '',
  );
  const groupMode =
    container.dataset.templateGroupMode === 'OR' ? 'OR' : 'AND';
  const templateButtons = container.querySelectorAll(
    '[data-role="observation-template-add"]',
  );
  const templateGroups = container.querySelectorAll(
    '[data-role="observation-template-group"]',
  );
  const emptyMessage = container.querySelector(
    '[data-role="observation-template-empty"]',
  );
  const hasTemplates = templateButtons.length > 0;

  if (!hasTemplates) {
    if (isHtmlElement(emptyMessage)) {
      emptyMessage.hidden = false;
      emptyMessage.textContent = 'Keine gespeicherten Beobachtungen vorhanden.';
    }
    return;
  }

  templateButtons.forEach((button) => {
    const initial = button.dataset.initial || '';
    const label = button.dataset.value || '';
    const buttonGroups = normalizeTemplateGroups(button.dataset.groups || '');
    const matchesInitial =
      selectedInitial === 'ALL' || initial === selectedInitial;
    const matchesQuery = normalizedQuery
      ? label.toLocaleLowerCase().includes(normalizedQuery)
      : true;
    const matchesGroups = matchesTemplateGroups({
      selectedGroups,
      buttonGroups,
      mode: groupMode,
    });
    button.hidden = !(matchesInitial && matchesQuery && matchesGroups);
  });

  let visibleCount = 0;
  templateGroups.forEach((group) => {
    const buttons = group.querySelectorAll(
      '[data-role="observation-template-add"]',
    );
    let hasVisible = false;
    buttons.forEach((button) => {
      if (!button.hidden) {
        hasVisible = true;
        visibleCount += 1;
      }
    });
    const groupWrapper = group.closest('[data-initial]');
    if (groupWrapper) {
      groupWrapper.hidden = !hasVisible;
    }
  });

  if (isHtmlElement(emptyMessage)) {
    emptyMessage.hidden = visibleCount > 0;
    emptyMessage.textContent =
      visibleCount > 0
        ? 'Keine gespeicherten Beobachtungen vorhanden.'
        : 'Keine passenden Beobachtungen gefunden.';
  }
};

const setTemplateFilter = (container, selected) => {
  const next =
    selected && selected !== 'ALL'
      ? selected.toLocaleUpperCase()
      : 'ALL';
  container.dataset.templateFilter = next;
  updateTemplateControls(container);
  applyTemplateFilters(container);
};

const setTemplateGroups = (container, groups) => {
  const normalized = Array.isArray(groups)
    ? groups
        .map((group) => (typeof group === 'string' ? group.trim() : ''))
        .filter(Boolean)
        .map((group) => group.toLocaleUpperCase())
    : [];
  const { multiGroups } = getTemplateFlags(container);
  const uniqueGroups = Array.from(new Set(normalized));
  const nextGroups = multiGroups ? uniqueGroups : uniqueGroups.slice(0, 1);
  container.dataset.templateGroups = nextGroups.join(',');
  updateTemplateControls(container);
  applyTemplateFilters(container);
};

const toggleTemplateGroup = (container, group) => {
  if (!group) {
    return;
  }
  const selected = new Set(normalizeTemplateGroups(container.dataset.templateGroups || ''));
  const normalized = group.trim().toLocaleUpperCase();
  const { multiGroups } = getTemplateFlags(container);
  if (multiGroups) {
    if (selected.has(normalized)) {
      selected.delete(normalized);
    } else {
      selected.add(normalized);
    }
  } else if (selected.has(normalized)) {
    selected.clear();
  } else {
    selected.clear();
    selected.add(normalized);
  }
  setTemplateGroups(container, Array.from(selected));
};

const setTemplateGroupMode = (container, mode) => {
  const next = mode === 'OR' ? 'OR' : 'AND';
  container.dataset.templateGroupMode = next;
  updateTemplateControls(container);
  applyTemplateFilters(container);
};

const setTemplateQuery = (container, query) => {
  container.dataset.templateQuery = typeof query === 'string' ? query : '';
  applyTemplateFilters(container);
};

const setTemplateMultiGroups = (container, enabled) => {
  container.dataset.templateMulti = enabled ? 'true' : 'false';
  if (!enabled) {
    const selected = normalizeTemplateGroups(container.dataset.templateGroups || '');
    const next = selected.length > 0 ? [selected[0]] : [];
    container.dataset.templateGroups = next.join(',');
    container.dataset.templateGroupMode = 'AND';
  }
  updateTemplateControls(container);
  applyTemplateFilters(container);
};

const setTemplateShowAlphabet = (container, enabled) => {
  container.dataset.templateShowAlphabet = enabled ? 'true' : 'false';
  updateTemplateControls(container);
  applyTemplateFilters(container);
};

const setTemplateShowAndOr = (container, enabled) => {
  container.dataset.templateShowAndOr = enabled ? 'true' : 'false';
  updateTemplateControls(container);
  applyTemplateFilters(container);
};

const setTemplateSettingsOpen = (container, isOpen) => {
  container.dataset.templateSettingsOpen = isOpen ? 'true' : 'false';
  updateTemplateControls(container);
};

const feedbackTimeouts = new WeakMap();

const getSelectedObservationKeys = (date, child) => {
  if (!child) {
    return new Set();
  }
  const entry = getEntry(date);
  const tags = normalizeObservationList(getObservationTags(entry, child));
  return new Set(
    tags
      .map((tag) => normalizeObservationKey(tag))
      .filter(Boolean),
  );
};

const updateTemplateSelectionState = (templatesOverlay, date, child) => {
  if (!templatesOverlay || !child) {
    return;
  }
  const selectedKeys = getSelectedObservationKeys(date, child);
  const buttons = templatesOverlay.querySelectorAll(
    '[data-role="observation-template-add"]',
  );
  buttons.forEach((button) => {
    const key = normalizeObservationKey(button.dataset.value || '');
    updateTemplateButtonState(button, key && selectedKeys.has(key));
  });
};

const getTemplateUiState = (templatesOverlay) => {
  if (!templatesOverlay) {
    return null;
  }
  return {
    templateFilter: templatesOverlay.dataset.templateFilter || 'ALL',
    templateQuery: templatesOverlay.dataset.templateQuery || '',
    templateGroups: templatesOverlay.dataset.templateGroups || '',
    templateGroupMode: templatesOverlay.dataset.templateGroupMode || 'AND',
    templateMulti: templatesOverlay.dataset.templateMulti === 'true',
    templateShowAndOr: templatesOverlay.dataset.templateShowAndOr === 'true',
    templateShowAlphabet: templatesOverlay.dataset.templateShowAlphabet === 'true',
    templateSettingsOpen: templatesOverlay.dataset.templateSettingsOpen === 'true',
  };
};

const restoreTemplateUiState = (templatesOverlay, state) => {
  if (!templatesOverlay) {
    return;
  }
  if (state) {
    templatesOverlay.dataset.templateFilter = state.templateFilter || 'ALL';
    templatesOverlay.dataset.templateQuery = state.templateQuery || '';
    const groupsValue = Array.isArray(state.templateGroups)
      ? state.templateGroups.join(',')
      : state.templateGroups || '';
    templatesOverlay.dataset.templateGroups = groupsValue;
    templatesOverlay.dataset.templateGroupMode =
      state.templateGroupMode === 'OR' ? 'OR' : 'AND';
    templatesOverlay.dataset.templateMulti = state.templateMulti ? 'true' : 'false';
    templatesOverlay.dataset.templateShowAndOr =
      state.templateShowAndOr === true ? 'true' : 'false';
    templatesOverlay.dataset.templateShowAlphabet =
      state.templateShowAlphabet === true ? 'true' : 'false';
    templatesOverlay.dataset.templateSettingsOpen =
      state.templateSettingsOpen === true ? 'true' : 'false';
  }

  updateTemplateControls(templatesOverlay, { syncInput: Boolean(state) });
  applyTemplateFilters(templatesOverlay);
};

const showFeedback = (card, message) => {
  const feedback = card.querySelector('[data-role="observation-feedback"]');
  if (!isHtmlElement(feedback)) {
    return;
  }

  feedback.textContent = message;
  feedback.hidden = false;

  const existingTimeout = feedbackTimeouts.get(feedback);
  if (existingTimeout) {
    window.clearTimeout(existingTimeout);
  }

  const timeoutId = window.setTimeout(() => {
    feedback.hidden = true;
  }, 1800);

  feedbackTimeouts.set(feedback, timeoutId);
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

const buildGroupDots = (groups, observationGroups) => {
  const ordered = getOrderedObservationGroups(groups);
  const maxDots = 3;
  const showOverflow = ordered.length > maxDots;
  const visible = showOverflow ? ordered.slice(0, maxDots - 1) : ordered;
  const wrapper = document.createDocumentFragment();

  visible.forEach((group) => {
    const dot = document.createElement('span');
    const color =
      observationGroups && observationGroups[group]?.color
        ? observationGroups[group].color
        : '#6c757d';
    dot.className = 'observation-group-dot';
    dot.style.setProperty('--group-color', color);
    dot.setAttribute('aria-hidden', 'true');
    wrapper.appendChild(dot);
  });

  if (showOverflow) {
    const overflow = document.createElement('span');
    overflow.className = 'observation-group-dot observation-group-dot--overflow';
    overflow.textContent = '+';
    overflow.setAttribute('aria-hidden', 'true');
    wrapper.appendChild(overflow);
  }

  return wrapper;
};

const parseChildFromHash = () => {
  if (!window.location.hash) {
    return null;
  }

  const normalized = window.location.hash.replace('#', '');
  const parts = normalized.split('/');
  if (parts.length < 2) {
    return null;
  }

  const [route, childId] = parts;
  if (route !== 'beobachtungen' || !childId) {
    return null;
  }

  try {
    return decodeURIComponent(childId);
  } catch (error) {
    return null;
  }
};

export const bindObservations = ({
  list,
  overlay,
  overlayPanel,
  overlayContent,
  overlayTitle,
  closeButton,
  templatesOverlay,
  editOverlay,
  createOverlay,
  date,
  observationGroups,
  savedFilters,
  readOnly = false,
}) => {
  if (
    !list ||
    !overlay ||
    !overlayPanel ||
    !overlayContent ||
    !overlayTitle ||
    !templatesOverlay ||
    !editOverlay ||
    !createOverlay
  ) {
    return;
  }

  let currentDate = date;
  const getDate = () => currentDate;
  const setOverlayTitle = (child) => {
    const dateLabel = formatDisplayDate(getDate());
    if (!overlayTitle) {
      return;
    }
    if (child && dateLabel) {
      overlayTitle.textContent = `${child} – ${dateLabel}`;
      return;
    }
    if (child) {
      overlayTitle.textContent = child;
      return;
    }
    overlayTitle.textContent = dateLabel;
  };

  let activeChild = null;
  let isOverlayOpen = false;
  let isTemplateOverlayOpen = false;
  let isCreateOverlayOpen = false;
  let isEditOverlayOpen = false;
  let isReadOnly = Boolean(readOnly);
  let editingObservation = null;
  const handleTemplateSearch = debounce((input) => {
    setTemplateQuery(templatesOverlay, input.value);
  }, 200);
  const persistObservationNote = debounce((child, value) => {
    if (!child) {
      return;
    }
    updateEntry(getDate(), {
      observationNotes: {
        [child]: value,
      },
    });
  }, 250);
  let longPressTimer = null;
  let suppressNextClick = false;
  let templateLongPressTimer = null;
  let suppressTemplateClick = false;
  const handleExternalOpen = (event) => {
    const child = event?.detail?.child;
    if (!child) {
      return;
    }
    const focusNote = event?.detail?.focusNote === true;
    const attemptOpen = (remaining = 8) => {
      if (!openOverlay(child, { updateHistory: false })) {
        if (remaining > 0) {
          window.setTimeout(() => attemptOpen(remaining - 1), 80);
        }
        return;
      }
      if (!focusNote) {
        return;
      }
      const safeChildSelector =
        typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
          ? CSS.escape(child)
          : child;
      const panel = overlayContent.querySelector(
        `[data-child="${safeChildSelector}"]`,
      );
      const noteInput = panel?.querySelector('[data-role="observation-note-input"]');
      if (isTextAreaElement(noteInput)) {
        noteInput.disabled = panel?.dataset?.absent === 'true';
        noteInput.removeAttribute('readonly');
        requestAnimationFrame(() => {
          if (!noteInput.disabled) {
            noteInput.focus();
            noteInput.click();
          }
        });
      }
    };
    attemptOpen();
  };

  if (templatesOverlay) {
    const savedTemplateState = savedFilters
      ? {
          templateFilter: savedFilters.selectedLetter || 'ALL',
          templateQuery: templatesOverlay.dataset.templateQuery || '',
          templateGroups: normalizeObservationGroups(savedFilters.selectedGroups || []).join(','),
          templateGroupMode: savedFilters.andOrMode === 'OR' ? 'OR' : 'AND',
          templateMulti: savedFilters.multiGroups === true,
          templateShowAndOr: savedFilters.showAndOr === true,
          templateShowAlphabet: savedFilters.showAlphabet === true,
          templateSettingsOpen: false,
        }
      : getTemplateUiState(templatesOverlay);
    restoreTemplateUiState(templatesOverlay, savedTemplateState);
  }

  const setOverlayState = (child) => {
    const detailPanels = overlayContent.querySelectorAll('[data-child]');
    let activePanel = null;
    detailPanels.forEach((panel) => {
      const isActive = panel.dataset.child === child;
      panel.hidden = !isActive;
      panel.classList.toggle('d-none', !isActive);
      if (isActive) {
        activePanel = panel;
      }
    });
    setOverlayTitle(activePanel ? child : '');
    overlayContent.scrollTop = 0;
    syncNoteInputState(activePanel);
    return activePanel;
  };

  const openOverlay = (child, { updateHistory = true } = {}) => {
    if (!child) {
      return false;
    }
    const activePanel = setOverlayState(child);
    if (!activePanel) {
      return false;
    }
    if (activePanel.dataset.absent === 'true') {
      return false;
    }
    activeChild = child;
    isOverlayOpen = true;
    overlay.classList.add('is-open');
    overlay.setAttribute('aria-hidden', 'false');
    document.body.classList.add('observation-overlay-open');
    if (updateHistory) {
      const encoded = encodeURIComponent(child);
      history.pushState(
        { observationChild: child },
        '',
        `#beobachtungen/${encoded}`,
      );
    }
    return true;
  };

  const closeOverlayInternal = () => {
    if (!isOverlayOpen) {
      return;
    }
    closeTemplateOverlay();
    closeCreateOverlay();
    isOverlayOpen = false;
    activeChild = null;
    overlay.classList.remove('is-open');
    overlay.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('observation-overlay-open');
  };

  const openTemplateOverlay = (child, { focusSearch = true } = {}) => {
    if (isReadOnly) {
      return;
    }
    if (!child) {
      return;
    }
    activeChild = child;
    isTemplateOverlayOpen = true;
    templatesOverlay.dataset.isOpen = 'true';
    templatesOverlay.classList.add('is-open');
    templatesOverlay.setAttribute('aria-hidden', 'false');
    overlayPanel.classList.add('is-template-open');
    restoreTemplateUiState(templatesOverlay, getTemplateUiState(templatesOverlay));
    updateTemplateSelectionState(templatesOverlay, getDate(), child);
    const searchInput = templatesOverlay.querySelector(
      '[data-role="observation-template-search"]',
    );
    if (focusSearch && isInputElement(searchInput)) {
      searchInput.focus();
    }
  };

  const closeTemplateOverlay = () => {
    if (!isTemplateOverlayOpen) {
      return;
    }
    closeEditOverlay();
    isTemplateOverlayOpen = false;
    templatesOverlay.dataset.isOpen = 'false';
    setTemplateSettingsOpen(templatesOverlay, false);
    templatesOverlay.classList.remove('is-open');
    templatesOverlay.setAttribute('aria-hidden', 'true');
    overlayPanel.classList.remove('is-template-open');
  };

  const setCreateGroups = (groups) => {
    const normalized = normalizeObservationGroups(groups);
    createOverlay.dataset.selectedGroups = normalized.join(',');
    const buttons = createOverlay.querySelectorAll(
      '[data-role="observation-create-group"]',
    );
    buttons.forEach((button) => {
      const isActive = normalized.includes(button.dataset.value || '');
      button.classList.toggle('active', isActive);
      button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });
  };

  const getCreateGroups = () =>
    normalizeObservationGroups(
      typeof createOverlay.dataset.selectedGroups === 'string'
        ? createOverlay.dataset.selectedGroups.split(',')
        : [],
    );

  const updateCreatePreview = () => {
    const input = createOverlay.querySelector(
      '[data-role="observation-create-input"]',
    );
    const previewPill = createOverlay.querySelector(
      '[data-role="observation-create-preview-pill"]',
    );
    const previewText = createOverlay.querySelector(
      '[data-role="observation-create-preview-text"]',
    );
    const previewDots = createOverlay.querySelector(
      '[data-role="observation-create-preview-dots"]',
    );
    const previewEmpty = createOverlay.querySelector(
      '[data-role="observation-create-preview-empty"]',
    );
    if (!isInputElement(input) || !isHtmlElement(previewPill)) {
      return;
    }

    const text = normalizeObservationInput(input.value);
    const groups = getCreateGroups();
    const hasText = Boolean(text);
    previewPill.hidden = !hasText;
    if (isHtmlElement(previewEmpty)) {
      previewEmpty.hidden = hasText;
    }
    if (!hasText) {
      if (isHtmlElement(previewText)) {
        previewText.textContent = '';
      }
      if (isHtmlElement(previewDots)) {
        previewDots.textContent = '';
      }
      previewPill.classList.remove('observation-group-outline');
      return;
    }

    if (isHtmlElement(previewText)) {
      previewText.textContent = text;
    }
    if (isHtmlElement(previewDots)) {
      previewDots.textContent = '';
      previewDots.appendChild(buildGroupDots(groups, observationGroups));
    }
    previewPill.classList.toggle(
      'observation-group-outline',
      groups.includes('SCHWARZ'),
    );
  };

  const openCreateOverlay = (child) => {
    if (isReadOnly) {
      return;
    }
    if (!child) {
      return;
    }
    activeChild = child;
    isCreateOverlayOpen = true;
    createOverlay.classList.add('is-open');
    createOverlay.setAttribute('aria-hidden', 'false');
    overlayPanel.classList.add('is-create-open');
    setCreateGroups([]);
    const input = createOverlay.querySelector('[data-role="observation-create-input"]');
    focusTextInput(input, { resetValue: true, caret: 'end' });
    updateCreatePreview();
  };

  const closeCreateOverlay = () => {
    if (!isCreateOverlayOpen) {
      return;
    }
    isCreateOverlayOpen = false;
    createOverlay.classList.remove('is-open');
    createOverlay.setAttribute('aria-hidden', 'true');
    overlayPanel.classList.remove('is-create-open');
  };

  const setEditGroups = (groups) => {
    const normalized = normalizeObservationGroups(groups);
    editOverlay.dataset.selectedGroups = normalized.join(',');
    const buttons = editOverlay.querySelectorAll(
      '[data-role="observation-edit-group"]',
    );
    buttons.forEach((button) => {
      const isActive = normalized.includes(button.dataset.value || '');
      button.classList.toggle('active', isActive);
      button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });
  };

  const getEditGroups = () =>
    normalizeObservationGroups(
      typeof editOverlay.dataset.selectedGroups === 'string'
        ? editOverlay.dataset.selectedGroups.split(',')
        : [],
    );

  const openEditOverlay = ({ text, groups }) => {
    if (isReadOnly) {
      return;
    }
    if (!text) {
      return;
    }
    editingObservation = { text };
    isEditOverlayOpen = true;
    editOverlay.classList.add('is-open');
    editOverlay.setAttribute('aria-hidden', 'false');
    overlayPanel.classList.add('is-edit-open');
    setEditGroups(groups || []);
    const input = editOverlay.querySelector('[data-role="observation-edit-input"]');
    if (isInputElement(input)) {
      input.value = text;
      focusTextInput(input, { caret: 'end' });
      input.select();
    }
  };

  const closeEditOverlay = () => {
    if (!isEditOverlayOpen) {
      return;
    }
    isEditOverlayOpen = false;
    editingObservation = null;
    editOverlay.classList.remove('is-open');
    editOverlay.setAttribute('aria-hidden', 'true');
    overlayPanel.classList.remove('is-edit-open');
  };

  const closeOverlay = ({ updateHistory = true } = {}) => {
    if (!isOverlayOpen) {
      return;
    }
    if (updateHistory && history.state?.observationChild) {
      history.back();
      return;
    }
    closeOverlayInternal();
  };

  const handleOverlayClick = (event) => {
    const target = event.target;
    if (!isHtmlElement(target)) {
      return;
    }

    const card = target.closest('[data-child]');
    if (!card || !getCardChild(card)) {
      return;
    }
    if (card.dataset.absent === 'true') {
      return;
    }

    const removeButton = target.closest(
      '[data-role="observation-today-remove"]',
    );
    if (removeButton) {
      if (isReadOnly) {
        return;
      }
      const tag = removeButton.dataset.value;
      if (tag) {
        removeObservationForChild(getDate(), card.dataset.child, tag);
      }
      return;
    }

    const topButton = target.closest('[data-role="observation-top-add"]');
    if (topButton) {
      if (isReadOnly) {
        return;
      }
      const tag = topButton.dataset.value;
      if (tag) {
        addTagForChild(getDate(), card.dataset.child, tag);
        if (!findExistingPreset(getObservationPresets(), tag)) {
          addPreset('observations', tag);
        }
      }
      return;
    }

    const templateButton = target.closest(
      '[data-role="observation-template-add"]',
    );
    if (templateButton) {
      return;
    }

    const templateFilterButton = target.closest(
      '[data-role="observation-template-letter"]',
    );
    if (templateFilterButton) {
      return;
    }

    const templateOpenButton = target.closest(
      '[data-role="observation-template-open"]',
    );
    if (templateOpenButton) {
      if (isReadOnly) {
        return;
      }
      openTemplateOverlay(card.dataset.child);
    }

    const createOpenButton = target.closest(
      '[data-role="observation-create-open"]',
    );
    if (createOpenButton) {
      if (isReadOnly) {
        return;
      }
      closeTemplateOverlay();
      openCreateOverlay(card.dataset.child);
    }
  };

  const handleOverlayInput = (event) => {
    const target = event.target;
    if (!isTextAreaElement(target)) {
      return;
    }
    if (target.dataset.role !== 'observation-note-input') {
      return;
    }
    const child = getDetailChild(target);
    persistObservationNote(child, target.value);
  };

  const handleListClick = (event) => {
    const target = event.target;
    if (!isHtmlElement(target)) {
      return;
    }
    if (isReadOnly) {
      return;
    }
    if (suppressNextClick) {
      return;
    }

    const button = target.closest('[data-role="observation-child"]');
    if (!button) {
      return;
    }
    if (button.dataset.absent === 'true') {
      return;
    }

    const child = button.dataset.child;
    if (child) {
      openOverlay(child);
    }
  };

  const handleOverlayBackdropClick = (event) => {
    const target = event.target;
    if (isHtmlElement(target) && target === overlay) {
      closeOverlay();
    }
  };

  const handleTemplateInput = (event) => {
    const target = event.target;
    if (!isInputElement(target)) {
      return;
    }

    if (target.dataset.role === 'observation-template-search') {
      handleTemplateSearch(target);
      return;
    }

    if (target.dataset.role === 'observation-template-multi-switch') {
      setTemplateMultiGroups(templatesOverlay, target.checked);
      persistTemplateFilters(templatesOverlay);
      return;
    }

    if (target.dataset.role === 'observation-template-andor-switch') {
      setTemplateShowAndOr(templatesOverlay, target.checked);
      persistTemplateFilters(templatesOverlay);
      return;
    }

    if (target.dataset.role === 'observation-template-alphabet-switch') {
      setTemplateShowAlphabet(templatesOverlay, target.checked);
      persistTemplateFilters(templatesOverlay);
    }
  };

  const getActiveCard = () => {
    if (!activeChild) {
      return null;
    }
    const selector =
      typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
        ? `[data-child="${CSS.escape(activeChild)}"]`
        : `[data-child="${activeChild}"]`;
    return overlayContent.querySelector(selector);
  };

  const handleCreateSubmit = (event) => {
    const target = event.target;
    if (!isFormElement(target)) {
      return;
    }
    if (target.dataset.role !== 'observation-create-form') {
      return;
    }
    if (isReadOnly) {
      return;
    }
    event.preventDefault();
    const input = target.querySelector(
      '[data-role="observation-create-input"]',
    );
    if (!isInputElement(input)) {
      return;
    }
    const normalized = normalizeObservationInput(input.value);
    if (!normalized) {
      return;
    }
    const groups = getCreateGroups();
    const resolved = upsertObservationCatalogEntry(normalized, groups);
    if (!resolved || !activeChild) {
      closeCreateOverlay();
      return;
    }

    const entry = getEntry(getDate());
    const existing = normalizeObservationList(
      getObservationTags(entry, activeChild),
    );
    if (existing.includes(resolved)) {
      const card = getActiveCard();
      if (card) {
        showFeedback(card, 'Bereits für heute erfasst.');
      }
      closeCreateOverlay();
      return;
    }

    updateEntry(getDate(), {
      observations: {
        [activeChild]: [resolved],
      },
    });
    closeCreateOverlay();
  };

  const getTemplateScrollTop = () => {
    const scroll = templatesOverlay.querySelector(
      '.observation-templates-overlay__content',
    );
    return scroll ? scroll.scrollTop : 0;
  };

  const handleEditSubmit = (event) => {
    const target = event.target;
    if (!isFormElement(target)) {
      return;
    }
    if (target.dataset.role !== 'observation-edit-form') {
      return;
    }
    if (isReadOnly) {
      return;
    }
    event.preventDefault();
    if (!editingObservation) {
      closeEditOverlay();
      return;
    }
    const input = target.querySelector('[data-role="observation-edit-input"]');
    if (!isInputElement(input)) {
      return;
    }
    const normalized = normalizeObservationInput(input.value);
    if (!normalized) {
      return;
    }
    const groups = getEditGroups();
    if (isTemplateOverlayOpen && activeChild) {
      pendingTemplateRestore = {
        child: activeChild,
        scrollTop: getTemplateScrollTop(),
        templateState: getTemplateUiState(templatesOverlay),
      };
    }
    updateObservationCatalogEntry({
      currentText: editingObservation.text,
      nextText: normalized,
      groups,
    });
    closeEditOverlay();
  };

  const handleCreateInput = (event) => {
    const target = event.target;
    if (!isInputElement(target)) {
      return;
    }
    if (target.dataset.role === 'observation-create-input') {
      updateCreatePreview();
    }
  };

  const handleCreateClick = (event) => {
    const target = event.target;
    if (!isHtmlElement(target)) {
      return;
    }

    const closeButton = target.closest(
      '[data-role="observation-create-close"]',
    );
    if (closeButton) {
      closeCreateOverlay();
      return;
    }

    const cancelButton = target.closest(
      '[data-role="observation-create-cancel"]',
    );
    if (cancelButton) {
      closeCreateOverlay();
      return;
    }

    const groupButton = target.closest(
      '[data-role="observation-create-group"]',
    );
    if (groupButton) {
      if (isReadOnly) {
        return;
      }
      const selected = new Set(getCreateGroups());
      const value = groupButton.dataset.value;
      if (value) {
        if (selected.has(value)) {
          selected.delete(value);
        } else {
          selected.add(value);
        }
        setCreateGroups(Array.from(selected));
        updateCreatePreview();
      }
    }
  };

  const handleTemplateClick = (event) => {
    const target = event.target;
    if (!isHtmlElement(target)) {
      return;
    }

    const settingsPanel = templatesOverlay.querySelector(
      '[data-role="observation-template-settings-panel"]',
    );
    const isSettingsToggle = target.closest(
      '[data-role="observation-template-settings-toggle"]',
    );
    const { settingsOpen } = getTemplateFlags(templatesOverlay);
    if (settingsOpen && settingsPanel && !isSettingsToggle && !settingsPanel.contains(target)) {
      setTemplateSettingsOpen(templatesOverlay, false);
    }

    if (isEditOverlayOpen) {
      return;
    }

    if (target === templatesOverlay) {
      closeTemplateOverlay();
      return;
    }

    const closeTemplateButton = target.closest(
      '[data-role="observation-template-close"]',
    );
    if (closeTemplateButton) {
      closeTemplateOverlay();
      return;
    }

    const settingsToggle = target.closest(
      '[data-role="observation-template-settings-toggle"]',
    );
    if (settingsToggle) {
      const { settingsOpen } = getTemplateFlags(templatesOverlay);
      setTemplateSettingsOpen(templatesOverlay, !settingsOpen);
      return;
    }

    const templateButton = target.closest(
      '[data-role="observation-template-add"]',
    );
    if (templateButton) {
      if (isReadOnly) {
        return;
      }
      if (suppressTemplateClick) {
        return;
      }
      const tag = templateButton.dataset.value;
      if (tag && activeChild) {
        const selectedKeys = getSelectedObservationKeys(getDate(), activeChild);
        const tagKey = normalizeObservationKey(tag);
        const isSelected = tagKey && selectedKeys.has(tagKey);
        const scrollTop = getTemplateScrollTop();
        pendingTemplateRestore = {
          child: activeChild,
          scrollTop,
          focusSearch: false,
          templateState: getTemplateUiState(templatesOverlay),
        };
        templatesOverlay.dataset.pendingScrollTop = `${scrollTop}`;
        updateTemplateButtonState(templateButton, !isSelected);
        if (isSelected) {
          removeObservationForChild(getDate(), activeChild, tag);
        } else {
          addTagForChild(getDate(), activeChild, tag);
        }
      }
      return;
    }

    const templateGroupButton = target.closest(
      '[data-role="observation-template-group-filter"]',
    );
    if (templateGroupButton) {
      if (isReadOnly) {
        return;
      }
      toggleTemplateGroup(
        templatesOverlay,
        templateGroupButton.dataset.value,
      );
      persistTemplateFilters(templatesOverlay);
      return;
    }

    const templateGroupModeButton = target.closest(
      '[data-role="observation-template-group-mode"]',
    );
    if (templateGroupModeButton) {
      const { multiGroups } = getTemplateFlags(templatesOverlay);
      if (isReadOnly || !multiGroups) {
        return;
      }
      setTemplateGroupMode(
        templatesOverlay,
        templateGroupModeButton.dataset.value,
      );
      persistTemplateFilters(templatesOverlay);
      return;
    }

    const templateFilterButton = target.closest(
      '[data-role="observation-template-letter"]',
    );
    if (templateFilterButton) {
      if (isReadOnly) {
        return;
      }
      setTemplateFilter(
        templatesOverlay,
        templateFilterButton.dataset.value || 'ALL',
      );
      persistTemplateFilters(templatesOverlay);
    }
  };

  const handleTemplatePointerDown = (event) => {
    const target = event.target;
    if (!isHtmlElement(target)) {
      return;
    }
    const button = target.closest('[data-role="observation-template-add"]');
    if (!button) {
      return;
    }
    if (event.pointerType === 'mouse' && event.button !== 0) {
      return;
    }
    if (isEditOverlayOpen) {
      return;
    }
    if (isReadOnly) {
      return;
    }
    if (templateLongPressTimer) {
      window.clearTimeout(templateLongPressTimer);
      templateLongPressTimer = null;
    }
    templateLongPressTimer = window.setTimeout(() => {
      suppressTemplateClick = true;
      const text = button.dataset.value;
      const groups = normalizeObservationGroups(
        typeof button.dataset.groups === 'string'
          ? button.dataset.groups.split(',')
          : [],
      );
      if (text) {
        openEditOverlay({ text, groups });
      }
      templateLongPressTimer = null;
    }, LONG_PRESS_MS);
  };

  const handleTemplatePointerEnd = () => {
    if (templateLongPressTimer) {
      window.clearTimeout(templateLongPressTimer);
      templateLongPressTimer = null;
    }
    if (suppressTemplateClick) {
      window.setTimeout(() => {
        suppressTemplateClick = false;
      }, 0);
    }
  };

  const handleEditClick = (event) => {
    const target = event.target;
    if (!isHtmlElement(target)) {
      return;
    }

    const cancelButton = target.closest(
      '[data-role="observation-edit-cancel"]',
    );
    if (cancelButton) {
      closeEditOverlay();
      return;
    }

    const groupButton = target.closest(
      '[data-role="observation-edit-group"]',
    );
    if (groupButton) {
      const selected = new Set(getEditGroups());
      const value = groupButton.dataset.value;
      if (value) {
        if (selected.has(value)) {
          selected.delete(value);
        } else {
          selected.add(value);
        }
        setEditGroups(Array.from(selected));
      }
    }
  };

  const clearLongPress = () => {
    if (longPressTimer) {
      window.clearTimeout(longPressTimer);
      longPressTimer = null;
    }
  };

  const handleListPointerDown = (event) => {
    const target = event.target;
    if (!isHtmlElement(target)) {
      return;
    }
    if (isReadOnly) {
      return;
    }

    const button = target.closest('[data-role="observation-child"]');
    if (!button) {
      return;
    }

    if (event.pointerType === 'mouse' && event.button !== 0) {
      return;
    }

    clearLongPress();
    longPressTimer = window.setTimeout(() => {
      suppressNextClick = true;
      toggleAbsentChild(getDate(), button.dataset.child);
      longPressTimer = null;
    }, LONG_PRESS_MS);
  };

  const handleListPointerEnd = () => {
    clearLongPress();
    if (suppressNextClick) {
      window.setTimeout(() => {
        suppressNextClick = false;
      }, 0);
    }
  };

  overlayContent.addEventListener('click', handleOverlayClick);
  overlayContent.addEventListener('input', handleOverlayInput);
  list.addEventListener('click', handleListClick);
  list.addEventListener('pointerdown', handleListPointerDown);
  list.addEventListener('pointerup', handleListPointerEnd);
  list.addEventListener('pointerleave', handleListPointerEnd);
  list.addEventListener('pointercancel', handleListPointerEnd);
  overlay.addEventListener('click', handleOverlayBackdropClick);
  window.addEventListener('freilog:observation-open', handleExternalOpen);

  if (closeButton) {
    closeButton.addEventListener('click', () => {
      closeOverlay();
    });
  }

  templatesOverlay.addEventListener('input', handleTemplateInput);
  templatesOverlay.addEventListener('click', handleTemplateClick);
  templatesOverlay.addEventListener('pointerdown', handleTemplatePointerDown);
  templatesOverlay.addEventListener('pointerup', handleTemplatePointerEnd);
  templatesOverlay.addEventListener('pointerleave', handleTemplatePointerEnd);
  templatesOverlay.addEventListener('pointercancel', handleTemplatePointerEnd);
  createOverlay.addEventListener('submit', handleCreateSubmit);
  createOverlay.addEventListener('input', handleCreateInput);
  createOverlay.addEventListener('click', handleCreateClick);
  editOverlay.addEventListener('submit', handleEditSubmit);
  editOverlay.addEventListener('click', handleEditClick);

  window.addEventListener('popstate', () => {
    const stateChild = history.state?.observationChild;
    const hashChild = parseChildFromHash();
    const nextChild = stateChild || hashChild;
    if (nextChild) {
      if (openOverlay(nextChild, { updateHistory: false })) {
        return;
      }
    }
    closeOverlayInternal();
  });

  const initialChild = parseChildFromHash();
  if (initialChild && !pendingTemplateRestore?.child) {
    openOverlay(initialChild, { updateHistory: false });
  }

  if (pendingTemplateRestore?.child) {
    const {
      child,
      scrollTop,
      focusSearch = true,
      templateState = null,
    } = pendingTemplateRestore;
    pendingTemplateRestore = null;
    if (openOverlay(child, { updateHistory: false })) {
      restoreTemplateUiState(templatesOverlay, templateState);
      openTemplateOverlay(child, { focusSearch });
    }
    requestAnimationFrame(() => {
      const scroll = templatesOverlay.querySelector(
        '.observation-templates-overlay__content',
      );
      if (scroll) {
        scroll.scrollTop = scrollTop || 0;
      }
    });
  }

  return {
    updateDate: (nextDate) => {
      currentDate = nextDate;
      if (isOverlayOpen) {
        setOverlayTitle(activeChild);
      }
    },
    updateReadOnly: (nextReadOnly) => {
      const next = Boolean(nextReadOnly);
      if (next === isReadOnly) {
        return;
      }
      isReadOnly = next;
      if (isReadOnly) {
        closeTemplateOverlay();
        closeCreateOverlay();
        closeEditOverlay();
      }
    },
  };
};

export const bindObservationCatalog = ({
  openButton,
  overlay,
  createOverlay,
  editOverlay,
  deleteConfirmOverlay,
  observationGroups,
  catalog,
  savedFilters,
}) => {
  if (!overlay || !createOverlay || !editOverlay) {
    return null;
  }

  let currentCatalog = Array.isArray(catalog) ? catalog : [];
  let currentGroups = observationGroups || {};
  let currentSavedFilters = savedFilters || null;
  let isOverlayOpen = false;
  let isCreateOverlayOpen = false;
  let isEditOverlayOpen = false;
  let editingObservation = null;
  let openButtonRef = openButton || null;
  let deleteConfirmRef = deleteConfirmOverlay || null;

  const setOpenButton = (button) => {
    if (openButtonRef && openButtonRef instanceof HTMLElement) {
      openButtonRef.removeEventListener('click', handleOpen);
    }
    openButtonRef = button || null;
    if (openButtonRef && openButtonRef instanceof HTMLElement) {
      openButtonRef.addEventListener('click', handleOpen);
    }
  };

  const rebuildOverlay = ({ preserveState = true } = {}) => {
    const templateContent = overlay.querySelector(
      '.observation-templates-overlay__content',
    );
    const previousScrollTop = templateContent ? templateContent.scrollTop : 0;
    const preservedState = preserveState ? getTemplateUiState(overlay) : null;
    const refreshed = buildObservationTemplatesOverlay({
      templates: currentCatalog,
      observationCatalog: currentCatalog,
      observationGroups: currentGroups,
      savedFilters: currentSavedFilters,
      role: 'observation-catalog-overlay',
      className: 'observation-templates-overlay observation-catalog-overlay',
      closeRole: 'observation-catalog-close',
      showCreateButton: true,
      createButtonRole: 'observation-catalog-create-open',
    });
    if (refreshed?.element) {
      const nextPanel = refreshed.element.querySelector(
        '.observation-templates-overlay__panel',
      );
      const currentPanel = overlay.querySelector(
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
        currentContent.replaceChildren(...nextContent.children);
        currentContent.scrollTop = previousScrollTop;
      }
    }

    if (preservedState) {
      restoreTemplateUiState(overlay, preservedState);
    } else if (currentSavedFilters) {
      restoreTemplateUiState(overlay, {
        templateFilter: currentSavedFilters.selectedLetter || 'ALL',
        templateQuery: overlay.dataset.templateQuery || '',
        templateGroups: normalizeObservationGroups(
          currentSavedFilters.selectedGroups || [],
        ).join(','),
        templateGroupMode:
          currentSavedFilters.andOrMode === 'OR' ? 'OR' : 'AND',
        templateMulti: currentSavedFilters.multiGroups === true,
        templateShowAndOr: currentSavedFilters.showAndOr === true,
        templateShowAlphabet: currentSavedFilters.showAlphabet === true,
        templateSettingsOpen: false,
      });
    } else {
      updateTemplateControls(overlay, { syncInput: true });
      applyTemplateFilters(overlay);
    }
    if (templateContent) {
      templateContent.scrollTop = previousScrollTop;
    }
  };

  const openOverlay = () => {
    closeDrawerIfOpen();
    isOverlayOpen = true;
    overlay.classList.add('is-open');
    overlay.setAttribute('aria-hidden', 'false');
    document.body.classList.add('observation-overlay-open');
    rebuildOverlay({ preserveState: false });
  };

  const closeOverlay = () => {
    isOverlayOpen = false;
    overlay.classList.remove('is-open');
    overlay.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('observation-overlay-open');
    closeCreateOverlay();
    closeEditOverlay();
    closeDeleteConfirm();
    setTemplateSettingsOpen(overlay, false);
  };

  const setCreateGroups = (groups) => {
    const normalized = normalizeObservationGroups(groups);
    createOverlay.dataset.selectedGroups = normalized.join(',');
    const buttons = createOverlay.querySelectorAll(
      '[data-role="observation-create-group"]',
    );
    buttons.forEach((button) => {
      const isActive = normalized.includes(button.dataset.value || '');
      button.classList.toggle('active', isActive);
      button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });
  };

  const getCreateGroups = () =>
    normalizeObservationGroups(
      typeof createOverlay.dataset.selectedGroups === 'string'
        ? createOverlay.dataset.selectedGroups.split(',')
        : [],
    );

  const updateCreatePreview = () => {
    const input = createOverlay.querySelector(
      '[data-role="observation-create-input"]',
    );
    const previewPill = createOverlay.querySelector(
      '[data-role="observation-create-preview-pill"]',
    );
    const previewText = createOverlay.querySelector(
      '[data-role="observation-create-preview-text"]',
    );
    const previewDots = createOverlay.querySelector(
      '[data-role="observation-create-preview-dots"]',
    );
    const previewEmpty = createOverlay.querySelector(
      '[data-role="observation-create-preview-empty"]',
    );
    if (!isInputElement(input) || !isHtmlElement(previewPill)) {
      return;
    }

    const text = normalizeObservationInput(input.value);
    const groups = getCreateGroups();
    const hasText = Boolean(text);
    previewPill.hidden = !hasText;
    if (isHtmlElement(previewEmpty)) {
      previewEmpty.hidden = hasText;
    }
    if (!hasText) {
      if (isHtmlElement(previewText)) {
        previewText.textContent = '';
      }
      if (isHtmlElement(previewDots)) {
        previewDots.textContent = '';
      }
      previewPill.classList.remove('observation-group-outline');
      return;
    }

    if (isHtmlElement(previewText)) {
      previewText.textContent = text;
    }
    if (isHtmlElement(previewDots)) {
      previewDots.textContent = '';
      previewDots.appendChild(buildGroupDots(groups, currentGroups));
    }
    previewPill.classList.toggle(
      'observation-group-outline',
      groups.includes('SCHWARZ'),
    );
  };

  const openCreateOverlay = () => {
    isCreateOverlayOpen = true;
    createOverlay.classList.add('is-open');
    createOverlay.setAttribute('aria-hidden', 'false');
    setCreateGroups([]);
    const input = createOverlay.querySelector(
      '[data-role="observation-create-input"]',
    );
    focusTextInput(input, { resetValue: true, caret: 'end' });
    updateCreatePreview();
  };

  const closeCreateOverlay = () => {
    if (!isCreateOverlayOpen) {
      return;
    }
    isCreateOverlayOpen = false;
    createOverlay.classList.remove('is-open');
    createOverlay.setAttribute('aria-hidden', 'true');
  };

  const setEditGroups = (groups) => {
    const normalized = normalizeObservationGroups(groups);
    editOverlay.dataset.selectedGroups = normalized.join(',');
    const buttons = editOverlay.querySelectorAll(
      '[data-role="observation-edit-group"]',
    );
    buttons.forEach((button) => {
      const isActive = normalized.includes(button.dataset.value || '');
      button.classList.toggle('active', isActive);
      button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });
  };

  const getEditGroups = () =>
    normalizeObservationGroups(
      typeof editOverlay.dataset.selectedGroups === 'string'
        ? editOverlay.dataset.selectedGroups.split(',')
        : [],
    );

  const openEditOverlay = ({ text, groups }) => {
    if (!text) {
      return;
    }
    editingObservation = { text };
    isEditOverlayOpen = true;
    editOverlay.classList.add('is-open');
    editOverlay.setAttribute('aria-hidden', 'false');
    setEditGroups(groups || []);
    const input = editOverlay.querySelector(
      '[data-role="observation-edit-input"]',
    );
    if (isInputElement(input)) {
      input.value = text;
      focusTextInput(input, { caret: 'end' });
      input.select();
    }
  };

  const closeEditOverlay = () => {
    if (!isEditOverlayOpen) {
      return;
    }
    isEditOverlayOpen = false;
    editingObservation = null;
    editOverlay.classList.remove('is-open');
    editOverlay.setAttribute('aria-hidden', 'true');
  };

  const openDeleteConfirm = () => {
    if (!deleteConfirmRef || !editingObservation?.text) {
      return;
    }
    const messageEl = deleteConfirmRef.querySelector(
      '[data-role="observation-delete-confirm-message"]',
    );
    if (isHtmlElement(messageEl)) {
      messageEl.textContent = `“${editingObservation.text}” wird dauerhaft gelöscht.`;
    }
    const input = deleteConfirmRef.querySelector(
      '[data-role="observation-delete-confirm-input"]',
    );
    if (isInputElement(input)) {
      input.value = '';
      input.focus();
    }
    const confirmButton = deleteConfirmRef.querySelector(
      '[data-role="observation-delete-confirm"]',
    );
    if (confirmButton instanceof HTMLButtonElement) {
      confirmButton.disabled = true;
    }
    deleteConfirmRef.classList.remove('d-none');
    deleteConfirmRef.setAttribute('aria-hidden', 'false');
  };

  const closeDeleteConfirm = () => {
    if (!deleteConfirmRef) {
      return;
    }
    deleteConfirmRef.classList.add('d-none');
    deleteConfirmRef.setAttribute('aria-hidden', 'true');
  };

  const handleOpen = () => {
    openOverlay();
  };

  const handleOverlayInput = (event) => {
    const target = event.target;
    if (!isInputElement(target)) {
      return;
    }

    if (target.dataset.role === 'observation-template-search') {
      setTemplateQuery(overlay, target.value);
      return;
    }

    if (target.dataset.role === 'observation-template-multi-switch') {
      setTemplateMultiGroups(overlay, target.checked);
      persistTemplateFilters(overlay);
      return;
    }

    if (target.dataset.role === 'observation-template-andor-switch') {
      setTemplateShowAndOr(overlay, target.checked);
      persistTemplateFilters(overlay);
      return;
    }

    if (target.dataset.role === 'observation-template-alphabet-switch') {
      setTemplateShowAlphabet(overlay, target.checked);
      persistTemplateFilters(overlay);
    }
  };

  const handleOverlayClick = (event) => {
    const target = event.target;
    if (!isHtmlElement(target)) {
      return;
    }

    const settingsPanel = overlay.querySelector(
      '[data-role="observation-template-settings-panel"]',
    );
    const isSettingsToggle = target.closest(
      '[data-role="observation-template-settings-toggle"]',
    );
    const { settingsOpen } = getTemplateFlags(overlay);
    if (settingsOpen && settingsPanel && !isSettingsToggle && !settingsPanel.contains(target)) {
      setTemplateSettingsOpen(overlay, false);
    }

    if (target === overlay) {
      closeOverlay();
      return;
    }

    const closeButton = target.closest(
      '[data-role="observation-catalog-close"]',
    );
    if (closeButton) {
      closeOverlay();
      return;
    }

    if (target.closest('[data-role="observation-catalog-create-open"]')) {
      openCreateOverlay();
      return;
    }

    const settingsToggle = target.closest(
      '[data-role="observation-template-settings-toggle"]',
    );
    if (settingsToggle) {
      const { settingsOpen: nextOpen } = getTemplateFlags(overlay);
      setTemplateSettingsOpen(overlay, !nextOpen);
      return;
    }

    const templateButton = target.closest(
      '[data-role="observation-template-add"]',
    );
    if (templateButton) {
      const text = templateButton.dataset.value;
      const groups = normalizeObservationGroups(
        typeof templateButton.dataset.groups === 'string'
          ? templateButton.dataset.groups.split(',')
          : [],
      );
      if (text) {
        openEditOverlay({ text, groups });
      }
      return;
    }

    const templateGroupButton = target.closest(
      '[data-role="observation-template-group-filter"]',
    );
    if (templateGroupButton) {
      toggleTemplateGroup(overlay, templateGroupButton.dataset.value);
      persistTemplateFilters(overlay);
      return;
    }

    const templateGroupModeButton = target.closest(
      '[data-role="observation-template-group-mode"]',
    );
    if (templateGroupModeButton) {
      const { multiGroups } = getTemplateFlags(overlay);
      if (!multiGroups) {
        return;
      }
      setTemplateGroupMode(overlay, templateGroupModeButton.dataset.value);
      persistTemplateFilters(overlay);
      return;
    }

    const templateFilterButton = target.closest(
      '[data-role="observation-template-letter"]',
    );
    if (templateFilterButton) {
      setTemplateFilter(
        overlay,
        templateFilterButton.dataset.value || 'ALL',
      );
      persistTemplateFilters(overlay);
    }
  };

  const handleCreateSubmit = (event) => {
    const target = event.target;
    if (!isFormElement(target)) {
      return;
    }
    if (target.dataset.role !== 'observation-create-form') {
      return;
    }
    event.preventDefault();
    const input = target.querySelector(
      '[data-role="observation-create-input"]',
    );
    if (!isInputElement(input)) {
      return;
    }
    const normalized = normalizeObservationInput(input.value);
    if (!normalized) {
      return;
    }
    const groups = getCreateGroups();
    upsertObservationCatalogEntry(normalized, groups);
    closeCreateOverlay();
    rebuildOverlay();
  };

  const handleCreateInput = (event) => {
    const target = event.target;
    if (!isInputElement(target)) {
      return;
    }
    if (target.dataset.role === 'observation-create-input') {
      updateCreatePreview();
    }
  };

  const handleCreateClick = (event) => {
    const target = event.target;
    if (!isHtmlElement(target)) {
      return;
    }

    const closeButton = target.closest(
      '[data-role="observation-create-close"]',
    );
    if (closeButton) {
      closeCreateOverlay();
      return;
    }

    const cancelButton = target.closest(
      '[data-role="observation-create-cancel"]',
    );
    if (cancelButton) {
      closeCreateOverlay();
      return;
    }

    const groupButton = target.closest(
      '[data-role="observation-create-group"]',
    );
    if (groupButton) {
      const selected = new Set(getCreateGroups());
      const value = groupButton.dataset.value;
      if (value) {
        if (selected.has(value)) {
          selected.delete(value);
        } else {
          selected.add(value);
        }
        setCreateGroups(Array.from(selected));
        updateCreatePreview();
      }
    }
  };

  const handleEditSubmit = (event) => {
    const target = event.target;
    if (!isFormElement(target)) {
      return;
    }
    if (target.dataset.role !== 'observation-edit-form') {
      return;
    }
    event.preventDefault();
    if (!editingObservation) {
      closeEditOverlay();
      return;
    }
    const input = target.querySelector(
      '[data-role="observation-edit-input"]',
    );
    if (!isInputElement(input)) {
      return;
    }
    const normalized = normalizeObservationInput(input.value);
    if (!normalized) {
      return;
    }
    const groups = getEditGroups();
    updateObservationCatalogEntry({
      currentText: editingObservation.text,
      nextText: normalized,
      groups,
    });
    closeEditOverlay();
    rebuildOverlay();
  };

  const handleEditClick = (event) => {
    const target = event.target;
    if (!isHtmlElement(target)) {
      return;
    }

    const cancelButton = target.closest(
      '[data-role="observation-edit-cancel"]',
    );
    if (cancelButton) {
      closeEditOverlay();
      return;
    }

    const deleteButton = target.closest(
      '[data-role="observation-edit-delete"]',
    );
    if (deleteButton) {
      openDeleteConfirm();
      return;
    }

    const groupButton = target.closest(
      '[data-role="observation-edit-group"]',
    );
    if (groupButton) {
      const selected = new Set(getEditGroups());
      const value = groupButton.dataset.value;
      if (value) {
        if (selected.has(value)) {
          selected.delete(value);
        } else {
          selected.add(value);
        }
        setEditGroups(Array.from(selected));
      }
    }
  };

  const handleDeleteConfirmClick = (event) => {
    const target = event.target;
    if (!isHtmlElement(target)) {
      return;
    }
    if (target.closest('[data-role="observation-delete-cancel"]')) {
      closeDeleteConfirm();
      return;
    }
    if (target.closest('[data-role="observation-delete-confirm"]')) {
      const input = deleteConfirmRef?.querySelector(
        '[data-role="observation-delete-confirm-input"]',
      );
      const typed =
        input instanceof HTMLInputElement
          ? input.value.trim().toLocaleLowerCase('de')
          : '';
      if (typed !== 'ja') {
        return;
      }
      if (editingObservation?.text) {
        removeObservationCatalogEntry(editingObservation.text);
      }
      closeDeleteConfirm();
      closeEditOverlay();
      rebuildOverlay();
    }
  };

  const handleDeleteConfirmInput = (event) => {
    const target = event.target;
    if (!isInputElement(target)) {
      return;
    }
    if (target.dataset.role !== 'observation-delete-confirm-input') {
      return;
    }
    const confirmButton = deleteConfirmRef?.querySelector(
      '[data-role="observation-delete-confirm"]',
    );
    if (confirmButton instanceof HTMLButtonElement) {
      confirmButton.disabled = target.value.trim().toLocaleLowerCase('de') !== 'ja';
    }
  };

  setOpenButton(openButtonRef);
  rebuildOverlay({ preserveState: false });

  overlay.addEventListener('input', handleOverlayInput);
  overlay.addEventListener('click', handleOverlayClick);
  createOverlay.addEventListener('submit', handleCreateSubmit);
  createOverlay.addEventListener('input', handleCreateInput);
  createOverlay.addEventListener('click', handleCreateClick);
  editOverlay.addEventListener('submit', handleEditSubmit);
  editOverlay.addEventListener('click', handleEditClick);
  if (deleteConfirmRef) {
    deleteConfirmRef.addEventListener('click', handleDeleteConfirmClick);
    deleteConfirmRef.addEventListener('input', handleDeleteConfirmInput);
  }

  return {
    update: ({
      catalog: nextCatalog,
      observationGroups: nextGroups,
      savedFilters: nextFilters,
      openButton: nextOpenButton,
    }) => {
      currentCatalog = Array.isArray(nextCatalog) ? nextCatalog : currentCatalog;
      currentGroups = nextGroups || currentGroups;
      if (nextFilters) {
        currentSavedFilters = nextFilters;
      }
      if (typeof nextOpenButton !== 'undefined') {
        setOpenButton(nextOpenButton);
      }
      rebuildOverlay({ preserveState: isOverlayOpen });
    },
    open: () => openOverlay(),
    close: () => closeOverlay(),
  };
};
