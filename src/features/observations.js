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
import { normalizeObservationNoteList } from '../utils/observationNotes.js';
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

const normalizeNoteKey = (value) => {
  if (typeof value !== 'string') {
    return '';
  }
  const trimmed = value.trim();
  return trimmed ? trimmed.toLocaleLowerCase('de') : '';
};

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
const isButtonElement = (value) => value instanceof HTMLButtonElement;
const getCardChild = (card) => card?.dataset?.child || null;
const getDetailChild = (element) => element?.closest('[data-child]')?.dataset?.child || null;
const syncNoteInputState = (panel, { readOnly = false } = {}) => {
  if (!panel) {
    return;
  }
  const disabled = panel.dataset.absent === 'true' || readOnly;
  panel.querySelectorAll('[data-role="observation-note-input"]').forEach((noteInput) => {
    if (isTextAreaElement(noteInput)) {
      noteInput.disabled = disabled;
    }
  });
  const addButton = panel.querySelector('[data-role="observation-note-add"]');
  if (isButtonElement(addButton)) {
    addButton.disabled = disabled;
  }
  panel.querySelectorAll('[data-role="observation-note-delete"]').forEach((button) => {
    if (isButtonElement(button)) {
      button.disabled = disabled;
    }
  });
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
  multiObservationButton,
  multiTemplatesOverlay,
  assignOverlay,
  editOverlay,
  createOverlay,
  noteDeleteConfirmOverlay,
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
    !createOverlay ||
    !noteDeleteConfirmOverlay
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
  let isMultiTemplateOpen = false;
  let isAssignOverlayOpen = false;
  let isNoteDeleteConfirmOpen = false;
  let isReadOnly = Boolean(readOnly);
  let editingObservation = null;
  let activeMultiObservation = null;
  let noteDeleteTarget = null;
  let assignTab = 'short';
  let assignNoteCreateDraft = '';
  const assignNoteCreateSelection = new Set();
  let assignNoteAssignableSet = new Set();
  const assignNoteSharedDrafts = new Map();
  const assignNoteSharedSelections = new Map();
  const assignNoteSharedFocusKeys = new Set();
  const assignNoteSharedFocusTimers = new Map();
  const assignNoteSharedRefs = new Map();
  const notePersistDebouncers = new Map();
  const handleTemplateSearch = debounce((input) => {
    setTemplateQuery(templatesOverlay, input.value);
  }, 200);
  let longPressTimer = null;
  let suppressNextClick = false;
  let templateLongPressTimer = null;
  let suppressTemplateClick = false;
  const noteEditTimers = new Map();
  const getScrollSpacer = (panel) =>
    panel?.querySelector('[data-role="observation-scroll-spacer"]') || null;
  const setScrollSpacerHeight = (panel, height) => {
    if (!panel) {
      return;
    }
    const nextHeight = Number.isFinite(height) ? Math.max(height, 0) : 0;
    const existing = getScrollSpacer(panel);
    if (!nextHeight) {
      existing?.remove();
      return;
    }
    const spacer = existing || document.createElement('div');
    spacer.dataset.role = 'observation-scroll-spacer';
    spacer.className = 'observation-scroll-spacer';
    spacer.setAttribute('aria-hidden', 'true');
    spacer.style.height = `${nextHeight}px`;
    spacer.dataset.height = `${nextHeight}`;
    if (!existing) {
      panel.appendChild(spacer);
    }
  };
  const adjustScrollSpacer = (panel, deltaHeight) => {
    if (!panel || !Number.isFinite(deltaHeight) || deltaHeight === 0) {
      return;
    }
    const existing = getScrollSpacer(panel);
    const rawHeight = existing ? Number(existing.dataset.height) : 0;
    const currentHeight = Number.isFinite(rawHeight) ? rawHeight : 0;
    const nextHeight = Math.max(currentHeight + deltaHeight, 0);
    setScrollSpacerHeight(panel, nextHeight);
  };
  const markNoteEditing = (panel, index = null, { shouldFocus = true } = {}) => {
    if (!panel) {
      return;
    }
    panel.dataset.noteEditing = 'true';
    panel.dataset.noteEditingFocus = shouldFocus ? 'true' : 'false';
    if (Number.isFinite(index) && index >= 0) {
      panel.dataset.noteEditingIndex = String(index);
    }
    const existing = noteEditTimers.get(panel);
    if (existing) {
      window.clearTimeout(existing);
    }
    const timeoutId = window.setTimeout(() => {
      delete panel.dataset.noteEditing;
      delete panel.dataset.noteEditingIndex;
      delete panel.dataset.noteEditingFocus;
      noteEditTimers.delete(panel);
    }, 1500);
    noteEditTimers.set(panel, timeoutId);
  };
  const reindexNoteInputs = (panel, { disabledOverride } = {}) => {
    if (!panel) {
      return [];
    }
    const previousScrollHeight = overlayContent.scrollHeight;
    const previousScrollTop = overlayContent.scrollTop;
    const disabled =
      typeof disabledOverride === 'boolean'
        ? disabledOverride
        : panel.dataset.absent === 'true' || isReadOnly;
    const inputs = Array.from(
      panel.querySelectorAll('[data-role="observation-note-input"]'),
    ).filter(isTextAreaElement);
    inputs.forEach((input, index) => {
      input.dataset.noteIndex = String(index);
      input.setAttribute('aria-label', `Notiz ${index + 1}`);
      const item = input.closest('.observation-note-item');
      const deleteButton = item?.querySelector('[data-role="observation-note-delete"]');
      if (isButtonElement(deleteButton)) {
        deleteButton.dataset.noteIndex = String(index);
        deleteButton.setAttribute('aria-label', `Notiz ${index + 1} löschen`);
        const hasContent = input.value.trim().length > 0;
        deleteButton.classList.toggle('d-none', !hasContent);
        deleteButton.hidden = !hasContent;
        deleteButton.setAttribute('aria-hidden', hasContent ? 'false' : 'true');
        deleteButton.disabled = disabled || !hasContent;
      }
    });
    const nextScrollHeight = overlayContent.scrollHeight;
    if (nextScrollHeight > previousScrollHeight) {
      adjustScrollSpacer(panel, previousScrollHeight - nextScrollHeight);
    }
    const nextMaxScroll = overlayContent.scrollHeight - overlayContent.clientHeight;
    overlayContent.scrollTop = Math.min(previousScrollTop, Math.max(nextMaxScroll, 0));
    return inputs;
  };
  const noteListsEqual = (left, right) => {
    const a = normalizeObservationNoteList(left);
    const b = normalizeObservationNoteList(right);
    if (a.length !== b.length) {
      return false;
    }
    return a.every((value, index) => value === b[index]);
  };
  const getObservationNotesForChild = (entry, child) =>
    normalizeObservationNoteList(entry?.observationNotes?.[child]);
  const getNotesFromPanel = (panel) => {
    const inputs = reindexNoteInputs(panel);
    const values = inputs.map((input) => input.value);
    return normalizeObservationNoteList(values);
  };
  const getRawNotesFromPanel = (panel) => {
    const inputs = reindexNoteInputs(panel);
    return inputs.map((input) => input.value);
  };
  const persistObservationNotes = (child, panel) => {
    if (!child || !panel || isReadOnly || panel.dataset.absent === 'true') {
      return;
    }
    const entry = getEntry(getDate());
    const currentValue = getObservationNotesForChild(entry, child);
    const nextValue = getNotesFromPanel(panel);
    if (noteListsEqual(currentValue, nextValue)) {
      return;
    }
    updateEntry(getDate(), {
      observationNotes: {
        [child]: {
          items: nextValue,
          replace: true,
        },
      },
    });
  };
  const getNotePersistDebouncer = (child) => {
    const existing = notePersistDebouncers.get(child);
    if (existing) {
      return existing;
    }
    const debounced = debounce((panel) => {
      persistObservationNotes(child, panel);
    }, 250);
    notePersistDebouncers.set(child, debounced);
    return debounced;
  };
  const schedulePersistNotes = (child, panel) => {
    if (!child || !panel) {
      return;
    }
    getNotePersistDebouncer(child)(panel);
  };
  const appendNoteField = (panel, { focus = true, markEditing = true } = {}) => {
    if (!panel || isReadOnly || panel.dataset.absent === 'true') {
      return null;
    }
    const noteList = panel.querySelector('[data-role="observation-note-list"]');
    if (!noteList) {
      return null;
    }
    const noteItem = document.createElement('div');
    noteItem.className = 'observation-note-item d-flex flex-column gap-2';
    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.className =
      'btn btn-outline-danger btn-sm observation-note-delete align-self-end';
    deleteButton.textContent = 'Löschen';
    deleteButton.dataset.role = 'observation-note-delete';
    const noteInput = document.createElement('textarea');
    noteInput.className = 'form-control observation-note-input';
    noteInput.rows = 3;
    noteInput.placeholder = 'Notiz';
    noteInput.dataset.role = 'observation-note-input';
    noteItem.append(deleteButton, noteInput);
    noteList.appendChild(noteItem);
    const inputs = reindexNoteInputs(panel);
    const newIndex = Math.max(inputs.indexOf(noteInput), 0);
    const disabled = panel.dataset.absent === 'true' || isReadOnly;
    noteInput.disabled = disabled;
    deleteButton.disabled = disabled;
    deleteButton.classList.add('d-none');
    deleteButton.hidden = true;
    deleteButton.setAttribute('aria-hidden', 'true');
    if (markEditing) {
      markNoteEditing(panel, newIndex, { shouldFocus: focus });
    }
    if (focus) {
      requestAnimationFrame(() => {
        if (!noteInput.disabled) {
          noteInput.focus();
          noteInput.click();
        }
      });
    }
    return noteInput;
  };
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
      if (!panel) {
        return;
      }
      syncNoteInputState(panel, { readOnly: isReadOnly });
      const noteInputs = reindexNoteInputs(panel);
      const noteInput = noteInputs[0];
      if (!isTextAreaElement(noteInput)) {
        return;
      }
      noteInput.removeAttribute('readonly');
      markNoteEditing(panel, Number(noteInput.dataset.noteIndex) || 0);
      requestAnimationFrame(() => {
        if (!noteInput.disabled) {
          noteInput.focus();
          noteInput.click();
        }
      });
    };
    attemptOpen();
  };
  const getDetailPanel = (child) => {
    if (!child) {
      return null;
    }
    const safeChildSelector =
      typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
        ? CSS.escape(child)
        : child;
    return overlayContent.querySelector(`[data-child="${safeChildSelector}"]`);
  };
  const persistActiveNote = () => {
    if (!activeChild) {
      return;
    }
    const panel = getDetailPanel(activeChild);
    if (!panel) {
      return;
    }
    persistObservationNotes(activeChild, panel);
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
  if (multiTemplatesOverlay) {
    const savedTemplateState = savedFilters
      ? {
          templateFilter: savedFilters.selectedLetter || 'ALL',
          templateQuery: multiTemplatesOverlay.dataset.templateQuery || '',
          templateGroups: normalizeObservationGroups(savedFilters.selectedGroups || []).join(','),
          templateGroupMode: savedFilters.andOrMode === 'OR' ? 'OR' : 'AND',
          templateMulti: savedFilters.multiGroups === true,
          templateShowAndOr: savedFilters.showAndOr === true,
          templateShowAlphabet: savedFilters.showAlphabet === true,
          templateSettingsOpen: false,
        }
      : getTemplateUiState(multiTemplatesOverlay);
    restoreTemplateUiState(multiTemplatesOverlay, savedTemplateState);
  }

  const updateBodyOverlayClass = () => {
    const shouldBeOpen =
      isOverlayOpen ||
      isTemplateOverlayOpen ||
      isCreateOverlayOpen ||
      isEditOverlayOpen ||
      isMultiTemplateOpen ||
      isAssignOverlayOpen ||
      isNoteDeleteConfirmOpen;
    document.body.classList.toggle('observation-overlay-open', shouldBeOpen);
  };

  const setAssignObservationLabel = (value) => {
    if (!assignOverlay) {
      return;
    }
    const title = assignOverlay.querySelector('[data-role="observation-assign-title"]');
    if (isHtmlElement(title)) {
      title.textContent = value
        ? `${value} mehreren Kindern zuweisen`
        : 'Beobachtung mehreren Kindern zuweisen';
    }
    const label = assignOverlay.querySelector(
      '[data-role="observation-assign-observation"]',
    );
    if (isHtmlElement(label)) {
      label.textContent = value ? `Beobachtung: ${value}` : '';
    }
  };

  const notesOverlay = multiTemplatesOverlay;
  const notesOverlayScrollEl = notesOverlay?.querySelector(
    '.observation-templates-overlay__content',
  );
  const assignTabButtons = notesOverlay?.querySelectorAll(
    '[data-role="observation-assign-tab"]',
  );
  const assignShortPaneEl = notesOverlay?.querySelector(
    '[data-role="observation-assign-pane"][data-tab="short"]',
  );
  const assignNotesPaneEl = notesOverlay?.querySelector(
    '[data-role="observation-assign-pane"][data-tab="notes"]',
  );
  const assignNoteCreateListEl = notesOverlay?.querySelector(
    '[data-role="observation-assign-note-create-list"]',
  );
  const assignNoteCreateInputEl = notesOverlay?.querySelector(
    '[data-role="observation-assign-note-create-input"]',
  );
  const assignNoteCreateSaveButtonEl = notesOverlay?.querySelector(
    '[data-role="observation-assign-note-create-save"]',
  );
  const assignNoteSharedListEl = notesOverlay?.querySelector(
    '[data-role="observation-assign-note-shared-list"]',
  );
  const assignNoteSharedEmptyEl = notesOverlay?.querySelector(
    '[data-role="observation-assign-note-shared-empty"]',
  );
  const noteDeleteConfirmEl =
    noteDeleteConfirmOverlay instanceof HTMLElement ? noteDeleteConfirmOverlay : null;
  const noteDeleteConfirmMessageEl = noteDeleteConfirmEl?.querySelector(
    '[data-role="observation-note-delete-confirm-message"]',
  );
  const noteDeleteConfirmButtonEl = noteDeleteConfirmEl?.querySelector(
    '[data-role="observation-note-delete-confirm"]',
  );
  const noteDeleteCancelButtonEl = noteDeleteConfirmEl?.querySelector(
    '[data-role="observation-note-delete-cancel"]',
  );

  const closeNoteDeleteConfirm = ({ force = false } = {}) => {
    if (!noteDeleteConfirmEl) {
      return;
    }
    if (!isNoteDeleteConfirmOpen && !force) {
      return;
    }
    isNoteDeleteConfirmOpen = false;
    noteDeleteTarget = null;
    noteDeleteConfirmEl.classList.add('d-none');
    noteDeleteConfirmEl.setAttribute('aria-hidden', 'true');
    updateBodyOverlayClass();
  };

  const syncNotesAfterDelete = (panel, nextNotes, deletedIndex) => {
    if (!panel) {
      return;
    }
    const noteList = panel.querySelector('[data-role="observation-note-list"]');
    if (!noteList) {
      return;
    }
    const previousScrollTop = overlayContent.scrollTop;
    const previousScrollHeight = overlayContent.scrollHeight;
    const disabled = panel.dataset.absent === 'true' || isReadOnly;
    const activeElement = document.activeElement;
    const hadActiveNoteFocus =
      isTextAreaElement(activeElement) &&
      activeElement.dataset.role === 'observation-note-input' &&
      noteList.contains(activeElement);
    const previousEditingIndex = Number(panel.dataset.noteEditingIndex);
    const preferredIndex = hadActiveNoteFocus
      ? Number(activeElement.dataset.noteIndex)
      : Number.isFinite(previousEditingIndex)
        ? previousEditingIndex
        : deletedIndex;
    const editingFocusRequested = panel.dataset.noteEditingFocus === 'true' || hadActiveNoteFocus;

    const noteItems = Array.from(noteList.querySelectorAll('.observation-note-item'));
    const itemToRemove = noteItems[deletedIndex];
    if (itemToRemove instanceof HTMLElement) {
      itemToRemove.remove();
    }

    let inputs = reindexNoteInputs(panel, { disabledOverride: disabled });

    while (inputs.length > nextNotes.length) {
      const lastInput = inputs[inputs.length - 1];
      const lastItem = lastInput?.closest('.observation-note-item');
      if (lastItem instanceof HTMLElement) {
        lastItem.remove();
      } else {
        break;
      }
      inputs = reindexNoteInputs(panel, { disabledOverride: disabled });
    }

    while (inputs.length < nextNotes.length) {
      const appended = appendNoteField(panel, { focus: false, markEditing: false });
      if (!appended) {
        break;
      }
      inputs = reindexNoteInputs(panel, { disabledOverride: disabled });
    }

    if (inputs.length === 0) {
      appendNoteField(panel, { focus: false, markEditing: false });
      inputs = reindexNoteInputs(panel, { disabledOverride: disabled });
    }

    inputs.forEach((input, idx) => {
      if (idx >= nextNotes.length) {
        return;
      }
      const nextValue = nextNotes[idx];
      if (input.value !== nextValue) {
        input.value = nextValue;
      }
    });

    inputs = reindexNoteInputs(panel, { disabledOverride: disabled });
    const nextScrollHeight = overlayContent.scrollHeight;
    const scrollShrink = previousScrollHeight - nextScrollHeight;
    if (previousScrollTop > 0 && scrollShrink > 0) {
      adjustScrollSpacer(panel, scrollShrink);
    }
    const maxScrollTop = overlayContent.scrollHeight - overlayContent.clientHeight;
    overlayContent.scrollTop = Math.min(previousScrollTop, Math.max(maxScrollTop, 0));

    const maxIndex = Math.max(inputs.length - 1, 0);
    const normalizedPreferred = Number.isFinite(preferredIndex) ? preferredIndex : 0;
    const adjustedPreferred =
      normalizedPreferred > deletedIndex ? normalizedPreferred - 1 : normalizedPreferred;
    const targetIndex = Math.min(Math.max(adjustedPreferred, 0), maxIndex);

    markNoteEditing(panel, targetIndex, { shouldFocus: editingFocusRequested });
    if (!editingFocusRequested) {
      return;
    }
    const focusTarget = inputs[targetIndex];
    if (!isTextAreaElement(focusTarget) || focusTarget.disabled) {
      return;
    }
    requestAnimationFrame(() => {
      focusTarget.focus();
    });
  };

  const deleteNoteForChild = (child, index) => {
    if (!child || !Number.isFinite(index) || index < 0) {
      return;
    }
    const panel = getDetailPanel(child);
    if (!panel) {
      return;
    }
    const rawNotes = getRawNotesFromPanel(panel);
    if (index >= rawNotes.length) {
      return;
    }
    rawNotes.splice(index, 1);
    const nextNotes = normalizeObservationNoteList(rawNotes);
    syncNotesAfterDelete(panel, nextNotes, index);
    updateEntry(getDate(), {
      observationNotes: {
        [child]: {
          items: nextNotes,
          replace: true,
        },
      },
    });
  };

  const openNoteDeleteConfirm = ({ child, index, note }) => {
    if (
      isReadOnly ||
      !noteDeleteConfirmEl ||
      !child ||
      !Number.isFinite(index) ||
      index < 0
    ) {
      return;
    }
    noteDeleteTarget = { child, index };
    const trimmed = typeof note === 'string' ? note.trim() : '';
    const noteLabel = trimmed ? `„${trimmed}”` : 'diese leere Notiz';
    if (isHtmlElement(noteDeleteConfirmMessageEl)) {
      noteDeleteConfirmMessageEl.textContent = `Möchtest du ${noteLabel} wirklich löschen?`;
    }
    noteDeleteConfirmEl.classList.remove('d-none');
    noteDeleteConfirmEl.setAttribute('aria-hidden', 'false');
    isNoteDeleteConfirmOpen = true;
    updateBodyOverlayClass();
    const focusTarget = noteDeleteConfirmButtonEl || noteDeleteCancelButtonEl;
    if (isButtonElement(focusTarget)) {
      requestAnimationFrame(() => {
        focusTarget.focus();
      });
    }
  };

  const confirmNoteDelete = () => {
    if (!noteDeleteTarget) {
      return;
    }
    const { child, index } = noteDeleteTarget;
    closeNoteDeleteConfirm({ force: true });
    deleteNoteForChild(child, index);
  };

  const getAssignChildEntries = () => {
    const childButtons = list.querySelectorAll('[data-role="observation-child"]');
    const entries = [];
    childButtons.forEach((button) => {
      const child = button.dataset.child;
      if (!child) {
        return;
      }
      entries.push({
        child,
        isAbsent: button.dataset.absent === 'true',
      });
    });
    return entries;
  };

  const syncAssignableChildren = (entries) => {
    const assignableChildren = entries
      .filter(({ isAbsent }) => !isAbsent)
      .map(({ child }) => child);
    const assignableSet = new Set(assignableChildren);
    assignNoteAssignableSet = assignableSet;
    assignNoteCreateSelection.forEach((child) => {
      if (!assignableSet.has(child)) {
        assignNoteCreateSelection.delete(child);
      }
    });
    assignNoteSharedSelections.forEach((selected, key) => {
      selected.forEach((child) => {
        if (!assignableSet.has(child)) {
          selected.delete(child);
        }
      });
      if (!selected.size && !assignNoteSharedFocusKeys.has(key)) {
        assignNoteSharedSelections.delete(key);
      }
    });
    return { assignableChildren, assignableSet };
  };

  const updateAssignNoteButtonState = (button, isSelected) => {
    button.classList.toggle('is-assigned', isSelected);
    button.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
  };

  const buildAssignNoteButton = ({
    child,
    isAbsent,
    role,
    isSelected,
    noteKey = null,
  }) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn btn-outline-primary observation-assign-pill';
    button.textContent = child;
    button.dataset.role = role;
    button.dataset.child = child;
    button.dataset.absent = isAbsent ? 'true' : 'false';
    if (noteKey) {
      button.dataset.noteKey = noteKey;
    }
    updateAssignNoteButtonState(button, isSelected && !isAbsent);
    if (isAbsent) {
      button.classList.add('is-absent');
    }
    button.disabled = isReadOnly || isAbsent;
    return button;
  };

  const updateAssignNoteCreateSaveState = () => {
    const hasDraft = assignNoteCreateDraft.trim().length > 0;
    const hasSelection = Array.from(assignNoteCreateSelection).some((child) =>
      assignNoteAssignableSet.has(child),
    );
    const shouldDisable = isReadOnly || !hasDraft || !hasSelection;
    if (isButtonElement(assignNoteCreateSaveButtonEl)) {
      assignNoteCreateSaveButtonEl.disabled = shouldDisable;
    }
    if (isTextAreaElement(assignNoteCreateInputEl)) {
      assignNoteCreateInputEl.disabled = isReadOnly || assignNoteAssignableSet.size === 0;
    }
  };

  const updateAssignNoteSharedSaveState = (key) => {
    const refs = assignNoteSharedRefs.get(key);
    if (!refs) {
      return;
    }
    const draft = assignNoteSharedDrafts.get(key) ?? refs.input.value;
    const selection = assignNoteSharedSelections.get(key);
    const hasSelection = Array.from(selection || []).some((child) =>
      assignNoteAssignableSet.has(child),
    );
    const shouldDisable = isReadOnly || !draft.trim() || !hasSelection;
    refs.saveButton.disabled = shouldDisable;
  };

  const updateAssignNoteSharedSaveStateForAll = () => {
    assignNoteSharedRefs.forEach((_refs, key) => {
      updateAssignNoteSharedSaveState(key);
    });
  };

  const setAssignTab = (nextTab, { shouldSync = true, focusInput = false } = {}) => {
    assignTab = nextTab === 'notes' ? 'notes' : 'short';
    assignTabButtons?.forEach((button) => {
      const tabId = button.dataset.tab;
      const isActive = tabId === assignTab;
      button.classList.toggle('active', isActive);
      button.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });
    const togglePane = (pane, isActive) => {
      if (!pane) {
        return;
      }
      pane.classList.toggle('active', isActive);
      pane.classList.toggle('show', isActive);
      pane.classList.toggle('d-none', !isActive);
      pane.setAttribute('aria-hidden', isActive ? 'false' : 'true');
    };
    togglePane(assignShortPaneEl, assignTab === 'short');
    togglePane(assignNotesPaneEl, assignTab === 'notes');
    if (assignTab === 'notes' && shouldSync) {
      syncAssignNotesTab();
    }
    if (assignTab === 'notes' && focusInput && isTextAreaElement(assignNoteCreateInputEl)) {
      requestAnimationFrame(() => {
        if (!assignNoteCreateInputEl.disabled) {
          assignNoteCreateInputEl.focus();
        }
      });
    }
  };

  const clearAssignNoteSharedFocus = (key) => {
    const timerId = assignNoteSharedFocusTimers.get(key);
    if (timerId) {
      window.clearTimeout(timerId);
      assignNoteSharedFocusTimers.delete(key);
    }
    assignNoteSharedFocusKeys.delete(key);
  };

  const markAssignNoteSharedFocus = (key) => {
    if (!key) {
      return;
    }
    assignNoteSharedFocusKeys.add(key);
    const existingTimer = assignNoteSharedFocusTimers.get(key);
    if (existingTimer) {
      window.clearTimeout(existingTimer);
    }
    const timerId = window.setTimeout(() => {
      assignNoteSharedFocusTimers.delete(key);
      assignNoteSharedFocusKeys.delete(key);
    if (isMultiTemplateOpen && assignTab === 'notes') {
      syncAssignNotesTab();
    }
    }, 1500);
    assignNoteSharedFocusTimers.set(key, timerId);
  };

  const buildNotesByChild = (entries, overrides = new Map()) => {
    const entry = getEntry(getDate());
    const notesByChild = new Map();
    entries.forEach(({ child, isAbsent }) => {
      if (!child || isAbsent) {
        return;
      }
      const override = overrides.get(child);
      const notes = override
        ? normalizeObservationNoteList(override)
        : getObservationNotesForChild(entry, child);
      notesByChild.set(child, notes);
    });
    return notesByChild;
  };

  const buildNoteChildrenMap = (notesByChild) => {
    const noteMap = new Map();
    notesByChild.forEach((notes, child) => {
      notes.forEach((note) => {
        const key = normalizeNoteKey(note);
        if (!key) {
          return;
        }
        const existing = noteMap.get(key);
        if (existing) {
          existing.children.add(child);
          if (!existing.text.trim()) {
            existing.text = note;
          }
          return;
        }
        noteMap.set(key, {
          key,
          text: note,
          children: new Set([child]),
        });
      });
    });
    return noteMap;
  };

  const buildSharedNotesData = (notesByChild) =>
    Array.from(buildNoteChildrenMap(notesByChild).values())
      .filter(({ children }) => children.size > 1)
      .sort((a, b) => a.text.localeCompare(b.text, 'de', { sensitivity: 'base' }));

  const createAssignSharedNoteItem = (key) => {
    const item = document.createElement('div');
    item.className = 'observation-assign-note-item d-flex flex-column gap-2';
    item.dataset.role = 'observation-assign-note-shared-item';
    item.dataset.noteKey = key;
    const input = document.createElement('textarea');
    input.className = 'form-control observation-assign-note-input';
    input.rows = 3;
    input.placeholder = 'Notiz';
    input.dataset.role = 'observation-assign-note-shared-input';
    input.dataset.noteKey = key;
    const children = document.createElement('div');
    children.className = 'd-flex flex-wrap gap-2 observation-assign-note-list';
    children.dataset.role = 'observation-assign-note-shared-children';
    children.dataset.noteKey = key;
    const saveButton = document.createElement('button');
    saveButton.type = 'button';
    saveButton.className = 'btn btn-primary btn-sm observation-assign-note-save align-self-start';
    saveButton.textContent = 'Speichern';
    saveButton.dataset.role = 'observation-assign-note-shared-save';
    saveButton.dataset.noteKey = key;
    item.append(input, children, saveButton);
    const refs = { item, input, children, saveButton };
    assignNoteSharedRefs.set(key, refs);
    return refs;
  };

  const syncAssignSharedNoteItem = (key, data, assignableSet) => {
    const refs = assignNoteSharedRefs.get(key) || createAssignSharedNoteItem(key);
    refs.item.dataset.noteKey = key;
    refs.input.dataset.noteKey = key;
    refs.children.dataset.noteKey = key;
    refs.saveButton.dataset.noteKey = key;

    const isFocused = document.activeElement === refs.input;
    const actualChildren = new Set(Array.from(data.children).filter((child) => assignableSet.has(child)));
    let selectedChildren = assignNoteSharedSelections.get(key);
    if (!selectedChildren || !assignNoteSharedFocusKeys.has(key)) {
      selectedChildren = new Set(actualChildren);
      assignNoteSharedSelections.set(key, selectedChildren);
    } else {
      selectedChildren.forEach((child) => {
        if (!assignableSet.has(child)) {
          selectedChildren.delete(child);
        }
      });
      if (!selectedChildren.size) {
        actualChildren.forEach((child) => selectedChildren.add(child));
      }
    }

    let draft = assignNoteSharedDrafts.get(key);
    if (!draft || !assignNoteSharedFocusKeys.has(key)) {
      draft = data.text;
      assignNoteSharedDrafts.set(key, draft);
    }
    if (!isFocused && refs.input.value !== draft) {
      refs.input.value = draft;
    }

    const buttons = Array.from(assignableSet).map((child) =>
      buildAssignNoteButton({
        child,
        isAbsent: false,
        role: 'observation-assign-note-shared-child',
        isSelected: selectedChildren.has(child),
        noteKey: key,
      }),
    );
    refs.children.replaceChildren(...buttons);
    refs.input.disabled = isReadOnly;
    refs.saveButton.disabled = isReadOnly;
    return refs;
  };

  const syncAssignNotesTab = ({ overrides = new Map() } = {}) => {
    if (!notesOverlay || !isMultiTemplateOpen) {
      return;
    }
    const previousScrollTop = notesOverlayScrollEl?.scrollTop ?? 0;
    const entries = getAssignChildEntries();
    const { assignableChildren, assignableSet } = syncAssignableChildren(entries);
    const notesByChild = buildNotesByChild(entries, overrides);
    const sharedNotes = buildSharedNotesData(notesByChild);

    if (isTextAreaElement(assignNoteCreateInputEl) && document.activeElement !== assignNoteCreateInputEl) {
      if (assignNoteCreateInputEl.value !== assignNoteCreateDraft) {
        assignNoteCreateInputEl.value = assignNoteCreateDraft;
      }
    }
    if (assignNoteCreateListEl) {
      const buttons = assignableChildren.map((child) =>
        buildAssignNoteButton({
          child,
          isAbsent: false,
          role: 'observation-assign-note-create-child',
          isSelected: assignNoteCreateSelection.has(child),
        }),
      );
      assignNoteCreateListEl.replaceChildren(...buttons);
    }
    updateAssignNoteCreateSaveState();

    if (assignNoteSharedListEl) {
      const desiredKeys = new Set(sharedNotes.map(({ key }) => key));
      assignNoteSharedRefs.forEach((refs, key) => {
        if (desiredKeys.has(key)) {
          return;
        }
        const containsFocus = refs.item.contains(document.activeElement);
        if (containsFocus && assignNoteSharedFocusKeys.has(key)) {
          return;
        }
        refs.item.remove();
        assignNoteSharedRefs.delete(key);
        assignNoteSharedDrafts.delete(key);
        assignNoteSharedSelections.delete(key);
        clearAssignNoteSharedFocus(key);
      });

      sharedNotes.forEach((note) => {
        const refs = syncAssignSharedNoteItem(note.key, note, assignableSet);
        assignNoteSharedListEl.appendChild(refs.item);
      });
      if (assignNoteSharedEmptyEl) {
        assignNoteSharedEmptyEl.hidden = sharedNotes.length > 0;
      }
    }

    updateAssignNoteSharedSaveStateForAll();
    setAssignTab(assignTab, { shouldSync: false });
    if (notesOverlayScrollEl) {
      const maxScrollTop = notesOverlayScrollEl.scrollHeight - notesOverlayScrollEl.clientHeight;
      notesOverlayScrollEl.scrollTop = Math.min(previousScrollTop, Math.max(maxScrollTop, 0));
    }
  };

  const resetAssignNoteState = ({ preserveTab = false } = {}) => {
    const nextTab = preserveTab ? assignTab : 'short';
    assignTab = nextTab;
    assignNoteCreateDraft = '';
    assignNoteCreateSelection.clear();
    assignNoteAssignableSet = new Set();
    assignNoteSharedDrafts.clear();
    assignNoteSharedSelections.clear();
    assignNoteSharedFocusKeys.clear();
    assignNoteSharedFocusTimers.forEach((timerId) => window.clearTimeout(timerId));
    assignNoteSharedFocusTimers.clear();
    assignNoteSharedRefs.forEach(({ item }) => item.remove());
    assignNoteSharedRefs.clear();
    if (isTextAreaElement(assignNoteCreateInputEl)) {
      assignNoteCreateInputEl.value = '';
    }
    if (assignNoteSharedEmptyEl) {
      assignNoteSharedEmptyEl.hidden = false;
    }
    assignNoteSharedListEl?.replaceChildren();
    setAssignTab(nextTab, { shouldSync: false });
    updateAssignNoteCreateSaveState();
  };

  const buildAssignButton = ({ child, isAbsent }) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn btn-outline-primary observation-assign-pill';
    button.textContent = child;
    button.dataset.role = 'observation-assign-child';
    button.dataset.child = child;
    button.dataset.absent = isAbsent ? 'true' : 'false';
    button.setAttribute('aria-pressed', 'false');
    if (isAbsent) {
      button.classList.add('is-absent');
    }
    button.disabled = isReadOnly || isAbsent;
    return button;
  };

  const rebuildAssignList = () => {
    if (!assignOverlay) {
      return;
    }
    const assignList = assignOverlay.querySelector(
      '[data-role="observation-assign-list"]',
    );
    if (!assignList) {
      return;
    }
    const entries = getAssignChildEntries();
    const nextButtons = entries.map((entry) => buildAssignButton(entry));
    assignList.replaceChildren(...nextButtons);
  };

  const hasObservationForChild = (dateValue, child, observationKey) => {
    if (!child || !observationKey) {
      return false;
    }
    const entry = getEntry(dateValue);
    const tags = normalizeObservationList(getObservationTags(entry, child));
    return tags.some(
      (tag) => normalizeObservationKey(tag) === observationKey,
    );
  };

  const updateAssignButtonState = (button, isAssigned) => {
    button.classList.toggle('is-assigned', isAssigned);
    button.setAttribute('aria-pressed', isAssigned ? 'true' : 'false');
  };

  const refreshAssignButtons = () => {
    if (!assignOverlay || !activeMultiObservation) {
      return;
    }
    const observationKey = normalizeObservationKey(activeMultiObservation);
    const assignList = assignOverlay.querySelector(
      '[data-role="observation-assign-list"]',
    );
    if (!assignList) {
      return;
    }
    assignList
      .querySelectorAll('[data-role="observation-assign-child"]')
      .forEach((button) => {
        const child = button.dataset.child;
        if (!child) {
          return;
        }
        const isAbsent = button.dataset.absent === 'true';
        const isAssigned = hasObservationForChild(
          getDate(),
          child,
          observationKey,
        );
        updateAssignButtonState(button, isAssigned);
        button.disabled = isReadOnly || isAbsent;
      });
    syncAssignNotesTab();
  };

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
    syncNoteInputState(activePanel, { readOnly: isReadOnly });
    return activePanel;
  };

  const openOverlay = (child, { updateHistory = true } = {}) => {
    if (!child) {
      return false;
    }
    if (activeChild && activeChild !== child) {
      persistActiveNote();
    }
    closeDrawerIfOpen();
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
    updateBodyOverlayClass();
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
    persistActiveNote();
    closeTemplateOverlay();
    closeCreateOverlay();
    closeNoteDeleteConfirm({ force: true });
    isOverlayOpen = false;
    activeChild = null;
    overlay.classList.remove('is-open');
    overlay.setAttribute('aria-hidden', 'true');
    updateBodyOverlayClass();
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

  const openMultiTemplateOverlay = () => {
    if (isReadOnly || !multiTemplatesOverlay) {
      return;
    }
    closeDrawerIfOpen();
    isMultiTemplateOpen = true;
    resetAssignNoteState();
    setAssignTab('short', { shouldSync: false });
    multiTemplatesOverlay.dataset.isOpen = 'true';
    multiTemplatesOverlay.classList.add('is-open');
    multiTemplatesOverlay.setAttribute('aria-hidden', 'false');
    restoreTemplateUiState(multiTemplatesOverlay, getTemplateUiState(multiTemplatesOverlay));
    updateBodyOverlayClass();
    const searchInput = multiTemplatesOverlay.querySelector(
      '[data-role="observation-template-search"]',
    );
    if (isInputElement(searchInput)) {
      searchInput.focus();
    }
  };

  const closeMultiTemplateOverlay = () => {
    if (!isMultiTemplateOpen || !multiTemplatesOverlay) {
      return;
    }
    isMultiTemplateOpen = false;
    resetAssignNoteState();
    multiTemplatesOverlay.dataset.isOpen = 'false';
    setTemplateSettingsOpen(multiTemplatesOverlay, false);
    multiTemplatesOverlay.classList.remove('is-open');
    multiTemplatesOverlay.setAttribute('aria-hidden', 'true');
    updateBodyOverlayClass();
  };

  const openAssignOverlay = (observation) => {
    if (isReadOnly || !assignOverlay || !observation) {
      return;
    }
    activeMultiObservation = observation;
    isAssignOverlayOpen = true;
    setAssignObservationLabel(observation);
    rebuildAssignList();
    assignOverlay.classList.add('is-open');
    assignOverlay.setAttribute('aria-hidden', 'false');
    refreshAssignButtons();
    updateBodyOverlayClass();
  };

  const closeAssignOverlay = () => {
    if (!isAssignOverlayOpen || !assignOverlay) {
      return;
    }
    isAssignOverlayOpen = false;
    activeMultiObservation = null;
    resetAssignNoteState();
    assignOverlay.classList.remove('is-open');
    assignOverlay.setAttribute('aria-hidden', 'true');
    setAssignObservationLabel('');
    updateBodyOverlayClass();
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

    if (noteDeleteConfirmEl && noteDeleteConfirmEl.contains(target)) {
      if (target === noteDeleteConfirmEl) {
        closeNoteDeleteConfirm();
        return;
      }
      if (target.closest('[data-role="observation-note-delete-cancel"]')) {
        closeNoteDeleteConfirm();
        return;
      }
      if (target.closest('[data-role="observation-note-delete-confirm"]')) {
        confirmNoteDelete();
        return;
      }
      return;
    }

    const card = target.closest('[data-child]');
    if (!card || !getCardChild(card)) {
      return;
    }
    if (card.dataset.absent === 'true') {
      return;
    }

    const noteAddButton = target.closest('[data-role="observation-note-add"]');
    if (noteAddButton) {
      if (isReadOnly) {
        return;
      }
      const child = card.dataset.child;
      const panel = (child && getDetailPanel(child)) || card;
      if (!child || !panel) {
        return;
      }
      markNoteEditing(panel);
      persistObservationNotes(child, panel);
      appendNoteField(panel);
      return;
    }

    const noteDeleteButton = target.closest('[data-role="observation-note-delete"]');
    if (noteDeleteButton) {
      if (isReadOnly) {
        return;
      }
      const child = card.dataset.child;
      const panel = (child && getDetailPanel(child)) || card;
      if (!child || !panel) {
        return;
      }
      const noteIndex = Number(noteDeleteButton.dataset.noteIndex);
      const rawNotes = getRawNotesFromPanel(panel);
      const noteValue =
        Number.isFinite(noteIndex) && noteIndex >= 0 ? rawNotes[noteIndex] || '' : '';
      openNoteDeleteConfirm({ child, index: noteIndex, note: noteValue });
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
    const panel = target.closest('[data-child]');
    const child = getDetailChild(target);
    if (!panel || !child) {
      return;
    }
    reindexNoteInputs(panel);
    const noteIndex = Number(target.dataset.noteIndex);
    markNoteEditing(panel, Number.isFinite(noteIndex) ? noteIndex : 0);
    schedulePersistNotes(child, panel);
  };
  const handleOverlayFocusOut = (event) => {
    const target = event.target;
    if (!isTextAreaElement(target)) {
      return;
    }
    if (target.dataset.role !== 'observation-note-input') {
      return;
    }
    const child = getDetailChild(target);
    const panel = (child && getDetailPanel(child)) || target.closest('[data-child]');
    if (!panel || !child) {
      return;
    }
    const relatedTarget = event.relatedTarget;
    if (
      isHtmlElement(relatedTarget) &&
      relatedTarget.closest('[data-role="observation-note-add"]')
    ) {
      return;
    }
    persistObservationNotes(child, panel);
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

  const handleMultiTemplateInput = (event) => {
    const target = event.target;
    if (!multiTemplatesOverlay || !isHtmlElement(target)) {
      return;
    }

    if (isTextAreaElement(target)) {
      handleAssignOverlayInput(event);
      return;
    }

    if (!isInputElement(target)) {
      return;
    }

    if (target.dataset.role === 'observation-template-search') {
      setTemplateQuery(multiTemplatesOverlay, target.value);
      return;
    }

    if (target.dataset.role === 'observation-template-multi-switch') {
      setTemplateMultiGroups(multiTemplatesOverlay, target.checked);
      persistTemplateFilters(multiTemplatesOverlay);
      return;
    }

    if (target.dataset.role === 'observation-template-andor-switch') {
      setTemplateShowAndOr(multiTemplatesOverlay, target.checked);
      persistTemplateFilters(multiTemplatesOverlay);
      return;
    }

    if (target.dataset.role === 'observation-template-alphabet-switch') {
      setTemplateShowAlphabet(multiTemplatesOverlay, target.checked);
      persistTemplateFilters(multiTemplatesOverlay);
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

  const handleMultiTemplateClick = (event) => {
    const target = event.target;
    if (!isHtmlElement(target) || !multiTemplatesOverlay) {
      return;
    }

    const settingsPanel = multiTemplatesOverlay.querySelector(
      '[data-role="observation-template-settings-panel"]',
    );
    const isSettingsToggle = target.closest(
      '[data-role="observation-template-settings-toggle"]',
    );
    const { settingsOpen } = getTemplateFlags(multiTemplatesOverlay);
    if (settingsOpen && settingsPanel && !isSettingsToggle && !settingsPanel.contains(target)) {
      setTemplateSettingsOpen(multiTemplatesOverlay, false);
    }

    if (target === multiTemplatesOverlay) {
      closeMultiTemplateOverlay();
      return;
    }

    const tabButton = target.closest('[data-role="observation-assign-tab"]');
    if (tabButton) {
      const nextTab = tabButton.dataset.tab;
      setAssignTab(nextTab, { focusInput: nextTab === 'notes' });
      return;
    }

    const closeTemplateButton = target.closest(
      '[data-role="observation-multi-catalog-close"]',
    );
    if (closeTemplateButton) {
      closeMultiTemplateOverlay();
      return;
    }

    const settingsToggle = target.closest(
      '[data-role="observation-template-settings-toggle"]',
    );
    if (settingsToggle) {
      const { settingsOpen: nextSettingsOpen } = getTemplateFlags(multiTemplatesOverlay);
      setTemplateSettingsOpen(multiTemplatesOverlay, !nextSettingsOpen);
      return;
    }

    const noteCreateChildButton = target.closest(
      '[data-role="observation-assign-note-create-child"]',
    );
    if (noteCreateChildButton) {
      toggleAssignNoteCreateChild(noteCreateChildButton);
      return;
    }

    const noteCreateSaveButton = target.closest(
      '[data-role="observation-assign-note-create-save"]',
    );
    if (noteCreateSaveButton) {
      saveAssignNoteCreate();
      return;
    }

    const noteSharedChildButton = target.closest(
      '[data-role="observation-assign-note-shared-child"]',
    );
    if (noteSharedChildButton) {
      toggleAssignNoteSharedChild(noteSharedChildButton);
      return;
    }

    const noteSharedSaveButton = target.closest(
      '[data-role="observation-assign-note-shared-save"]',
    );
    if (noteSharedSaveButton) {
      const noteKey = noteSharedSaveButton.dataset.noteKey;
      saveAssignNoteShared(noteKey);
      return;
    }

    const templateButton = target.closest(
      '[data-role="observation-template-add"]',
    );
    if (templateButton) {
      if (isReadOnly) {
        return;
      }
      const tag = templateButton.dataset.value;
      if (tag) {
        openAssignOverlay(tag);
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
        multiTemplatesOverlay,
        templateGroupButton.dataset.value,
      );
      persistTemplateFilters(multiTemplatesOverlay);
      return;
    }

    const templateGroupModeButton = target.closest(
      '[data-role="observation-template-group-mode"]',
    );
    if (templateGroupModeButton) {
      const { multiGroups } = getTemplateFlags(multiTemplatesOverlay);
      if (isReadOnly || !multiGroups) {
        return;
      }
      setTemplateGroupMode(
        multiTemplatesOverlay,
        templateGroupModeButton.dataset.value,
      );
      persistTemplateFilters(multiTemplatesOverlay);
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
        multiTemplatesOverlay,
        templateFilterButton.dataset.value || 'ALL',
      );
      persistTemplateFilters(multiTemplatesOverlay);
    }
  };

  const toggleAssignNoteCreateChild = (childButton) => {
    if (isReadOnly || childButton.dataset.absent === 'true') {
      return;
    }
    const child = childButton.dataset.child;
    if (!child || !assignNoteAssignableSet.has(child)) {
      return;
    }
    if (assignNoteCreateSelection.has(child)) {
      assignNoteCreateSelection.delete(child);
    } else {
      assignNoteCreateSelection.add(child);
    }
    updateAssignNoteButtonState(childButton, assignNoteCreateSelection.has(child));
    updateAssignNoteCreateSaveState();
  };

  const toggleAssignNoteSharedChild = (childButton) => {
    if (isReadOnly || childButton.dataset.absent === 'true') {
      return;
    }
    const child = childButton.dataset.child;
    const noteKey = childButton.dataset.noteKey;
    if (!child || !noteKey || !assignNoteAssignableSet.has(child)) {
      return;
    }
    const selectedChildren = assignNoteSharedSelections.get(noteKey) || new Set();
    if (selectedChildren.has(child)) {
      selectedChildren.delete(child);
    } else {
      selectedChildren.add(child);
    }
    assignNoteSharedSelections.set(noteKey, selectedChildren);
    markAssignNoteSharedFocus(noteKey);
    updateAssignNoteButtonState(childButton, selectedChildren.has(child));
    updateAssignNoteSharedSaveState(noteKey);
  };

  const saveAssignNoteCreate = () => {
    if (isReadOnly) {
      return;
    }
    const noteValue = isTextAreaElement(assignNoteCreateInputEl)
      ? assignNoteCreateInputEl.value
      : assignNoteCreateDraft;
    assignNoteCreateDraft = noteValue;
    const trimmedKey = normalizeNoteKey(noteValue);
    const selectedChildren = Array.from(assignNoteCreateSelection).filter((child) =>
      assignNoteAssignableSet.has(child),
    );
    if (!trimmedKey || !selectedChildren.length) {
      updateAssignNoteCreateSaveState();
      return;
    }
    const entries = getAssignChildEntries();
    const { assignableSet } = syncAssignableChildren(entries);
    const baseNotesByChild = buildNotesByChild(entries);
    const overrides = new Map();
    const patch = {};
    selectedChildren.forEach((child) => {
      if (!assignableSet.has(child)) {
        return;
      }
      const existing = baseNotesByChild.get(child) || [];
      const nextNotes = normalizeObservationNoteList([...existing, noteValue]);
      overrides.set(child, nextNotes);
      patch[child] = {
        items: nextNotes,
        replace: true,
      };
    });
    if (!Object.keys(patch).length) {
      updateAssignNoteCreateSaveState();
      return;
    }
    syncAssignNotesTab({ overrides });
    assignNoteCreateDraft = '';
    assignNoteCreateSelection.clear();
    if (isTextAreaElement(assignNoteCreateInputEl)) {
      assignNoteCreateInputEl.value = '';
    }
    updateAssignNoteCreateSaveState();
    updateEntry(getDate(), {
      observationNotes: patch,
    });
  };

  const saveAssignNoteShared = (noteKey) => {
    if (isReadOnly) {
      return;
    }
    const normalizedKey = normalizeNoteKey(noteKey);
    if (!normalizedKey) {
      return;
    }
    const refs = assignNoteSharedRefs.get(normalizedKey);
    const draftValue = refs?.input.value ?? assignNoteSharedDrafts.get(normalizedKey) ?? '';
    assignNoteSharedDrafts.set(normalizedKey, draftValue);
    const nextKey = normalizeNoteKey(draftValue);
    const selectedChildrenRaw = assignNoteSharedSelections.get(normalizedKey) || new Set();
    const entries = getAssignChildEntries();
    const { assignableSet } = syncAssignableChildren(entries);
    const selectedChildren = new Set(
      Array.from(selectedChildrenRaw).filter((child) => assignableSet.has(child)),
    );
    if (!nextKey || !selectedChildren.size) {
      updateAssignNoteSharedSaveState(normalizedKey);
      return;
    }

    const baseNotesByChild = buildNotesByChild(entries);
    const noteMap = buildNoteChildrenMap(baseNotesByChild);
    const currentChildren = noteMap.get(normalizedKey)?.children || new Set();

    let targetKey = normalizedKey;
    if (nextKey !== normalizedKey) {
      const currentRefs = assignNoteSharedRefs.get(normalizedKey);
      if (currentRefs) {
        const existingRefs = assignNoteSharedRefs.get(nextKey);
        if (existingRefs && existingRefs !== currentRefs) {
          existingRefs.item.remove();
          assignNoteSharedRefs.delete(nextKey);
          assignNoteSharedDrafts.delete(nextKey);
          assignNoteSharedSelections.delete(nextKey);
          clearAssignNoteSharedFocus(nextKey);
        }
        assignNoteSharedRefs.delete(normalizedKey);
        assignNoteSharedRefs.set(nextKey, currentRefs);
        currentRefs.item.dataset.noteKey = nextKey;
        currentRefs.input.dataset.noteKey = nextKey;
        currentRefs.children.dataset.noteKey = nextKey;
        currentRefs.saveButton.dataset.noteKey = nextKey;
      }
      const currentDraft = assignNoteSharedDrafts.get(normalizedKey);
      if (currentDraft !== undefined) {
        assignNoteSharedDrafts.set(nextKey, currentDraft);
        assignNoteSharedDrafts.delete(normalizedKey);
      }
      const currentSelection = assignNoteSharedSelections.get(normalizedKey);
      if (currentSelection) {
        assignNoteSharedSelections.set(nextKey, currentSelection);
        assignNoteSharedSelections.delete(normalizedKey);
      }
      clearAssignNoteSharedFocus(normalizedKey);
      targetKey = nextKey;
    }
    assignNoteSharedDrafts.set(targetKey, draftValue);
    assignNoteSharedSelections.set(targetKey, selectedChildren);
    markAssignNoteSharedFocus(targetKey);

    const affectedChildren = new Set([...currentChildren, ...selectedChildren]);
    const overrides = new Map();
    const patch = {};
    affectedChildren.forEach((child) => {
      const existing = baseNotesByChild.get(child) || [];
      const filtered = existing.filter((note) => normalizeNoteKey(note) !== normalizedKey);
      if (selectedChildren.has(child)) {
        filtered.push(draftValue);
      }
      const nextNotes = normalizeObservationNoteList(filtered);
      overrides.set(child, nextNotes);
      patch[child] = {
        items: nextNotes,
        replace: true,
      };
    });
    if (!Object.keys(patch).length) {
      updateAssignNoteSharedSaveState(targetKey);
      return;
    }
    syncAssignNotesTab({ overrides });
    updateEntry(getDate(), {
      observationNotes: patch,
    });
  };

  const handleAssignOverlayInput = (event) => {
    const target = event.target;
    if (!isTextAreaElement(target)) {
      return;
    }
    if (notesOverlay && !notesOverlay.contains(target)) {
      return;
    }
    if (target.dataset.role === 'observation-assign-note-create-input') {
      assignNoteCreateDraft = target.value;
      updateAssignNoteCreateSaveState();
      return;
    }
    if (target.dataset.role !== 'observation-assign-note-shared-input') {
      return;
    }
    const noteKey = normalizeNoteKey(target.dataset.noteKey);
    if (!noteKey) {
      return;
    }
    assignNoteSharedDrafts.set(noteKey, target.value);
    markAssignNoteSharedFocus(noteKey);
    updateAssignNoteSharedSaveState(noteKey);
  };

  const handleAssignOverlayClick = (event) => {
    const target = event.target;
    if (!isHtmlElement(target) || !assignOverlay) {
      return;
    }

    if (target === assignOverlay) {
      closeAssignOverlay();
      return;
    }

    const closeButton = target.closest('[data-role="observation-assign-close"]');
    if (closeButton) {
      closeAssignOverlay();
      return;
    }

    const childButton = target.closest('[data-role="observation-assign-child"]');
    if (childButton) {
      if (isReadOnly || !activeMultiObservation) {
        return;
      }
      if (childButton.dataset.absent === 'true') {
        return;
      }
      const child = childButton.dataset.child;
      const observationKey = normalizeObservationKey(activeMultiObservation);
      if (!child || !observationKey) {
        return;
      }
      const isAssigned = hasObservationForChild(
        getDate(),
        child,
        observationKey,
      );
      if (isAssigned) {
        removeObservationForChild(getDate(), child, activeMultiObservation);
      } else {
        addTagForChild(getDate(), child, activeMultiObservation);
      }
      updateAssignButtonState(childButton, !isAssigned);
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
  if (noteDeleteConfirmEl) {
    noteDeleteConfirmEl.addEventListener('click', handleOverlayClick);
  }
  overlayContent.addEventListener('input', handleOverlayInput);
  overlayContent.addEventListener('focusout', handleOverlayFocusOut);
  list.addEventListener('click', handleListClick);
  list.addEventListener('pointerdown', handleListPointerDown);
  list.addEventListener('pointerup', handleListPointerEnd);
  list.addEventListener('pointerleave', handleListPointerEnd);
  list.addEventListener('pointercancel', handleListPointerEnd);
  overlay.addEventListener('click', handleOverlayBackdropClick);
  window.addEventListener('freilog:observation-open', handleExternalOpen);

  if (multiObservationButton) {
    multiObservationButton.addEventListener('click', () => {
      openMultiTemplateOverlay();
    });
  }

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
  if (multiTemplatesOverlay) {
    multiTemplatesOverlay.addEventListener('input', handleMultiTemplateInput);
    multiTemplatesOverlay.addEventListener('click', handleMultiTemplateClick);
  }
  if (assignOverlay) {
    assignOverlay.addEventListener('input', handleAssignOverlayInput);
    assignOverlay.addEventListener('click', handleAssignOverlayClick);
  }
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
      if (isNoteDeleteConfirmOpen) {
        closeNoteDeleteConfirm({ force: true });
      }
      if (isOverlayOpen) {
        setOverlayTitle(activeChild);
      }
      if (isAssignOverlayOpen) {
        resetAssignNoteState({ preserveTab: true });
        refreshAssignButtons();
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
        closeMultiTemplateOverlay();
        closeAssignOverlay();
        closeNoteDeleteConfirm({ force: true });
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
