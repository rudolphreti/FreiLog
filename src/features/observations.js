import {
  addPreset,
  getChildrenList,
  getEntry,
  getPresets,
  updateEntry,
} from '../db/dbRepository.js';
import { debounce } from '../utils/debounce.js';
import {
  buildTopicEntry,
  getEntryText,
  normalizeTopicEntries,
  resolvePrimaryTopic,
} from '../utils/topics.js';

const normalizeObservationInput = (value) => {
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim().replace(/\s+/g, ' ');
};

const normalizeObservationKey = (value) =>
  normalizeObservationInput(getEntryText(value)).toLocaleLowerCase();

const normalizeObservationList = (value) => {
  if (Array.isArray(value) || typeof value === 'string') {
    return normalizeTopicEntries(value);
  }

  if (value && typeof value === 'object' && !Array.isArray(value)) {
    if (typeof value.text === 'string') {
      return normalizeTopicEntries([value]);
    }
    if (Array.isArray(value.tags) || typeof value.tags === 'string') {
      return normalizeTopicEntries(value.tags);
    }
  }

  return [];
};

const LONG_PRESS_MS = 600;

const getAbsentChildren = (entry) =>
  Array.isArray(entry?.absentChildIds) ? entry.absentChildIds : [];

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
const isFormElement = (value) => value instanceof HTMLFormElement;
const getCardChild = (card) => card?.dataset?.child || null;

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

const getObservationEntries = (entry, child) =>
  entry.observations && entry.observations[child]
    ? entry.observations[child]
    : [];

const addEntryForChild = (date, child, entry) => {
  if (!entry) {
    return;
  }

  updateEntry(date, {
    observations: {
      [child]: [entry],
    },
  });
};

const removeObservationForChild = (date, child, tag) => {
  const entry = getEntry(date);
  const normalizedKey = normalizeObservationKey(tag);
  const updatedTags = normalizeObservationList(
    getObservationEntries(entry, child),
  ).filter((item) => normalizeObservationKey(item) !== normalizedKey);

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

const applyTemplateFilters = (container) => {
  const selectedTopic = container.dataset.templateFilter || 'ALL';
  const normalizedQuery = normalizeTemplateQuery(container.dataset.templateQuery || '');
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
    const topics = (button.dataset.topics || '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
    const label = button.dataset.value || '';
    const matchesTopic =
      selectedTopic === 'ALL' || topics.includes(selectedTopic);
    const matchesQuery = normalizedQuery
      ? label.toLocaleLowerCase().includes(normalizedQuery)
      : true;
    button.hidden = !(matchesTopic && matchesQuery);
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
    group.hidden = !hasVisible;
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
      ? selected
      : 'ALL';
  container.dataset.templateFilter = next;
  const buttons = container.querySelectorAll(
    '[data-role="observation-template-topic"]',
  );
  buttons.forEach((button) => {
    const isActive = button.dataset.value === next;
    button.classList.toggle('active', isActive);
    button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
  });
  applyTemplateFilters(container);
};

const setTemplateQuery = (container, query) => {
  container.dataset.templateQuery = typeof query === 'string' ? query : '';
  applyTemplateFilters(container);
};

const feedbackTimeouts = new WeakMap();

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

const getSelectedTopics = (card) => {
  const checkboxes = card.querySelectorAll('[data-role="observation-topic"]');
  const topics = [];
  checkboxes.forEach((checkbox) => {
    if (checkbox instanceof HTMLInputElement && checkbox.checked) {
      topics.push(checkbox.value);
    }
  });
  return topics;
};

const getPrimaryTopicSelection = (card) => {
  const select = card.querySelector('[data-role="observation-primary-topic"]');
  if (select instanceof HTMLSelectElement) {
    return select.value;
  }
  return '';
};

const syncPrimaryTopicSelection = (card) => {
  const topics = getSelectedTopics(card);
  const select = card.querySelector('[data-role="observation-primary-topic"]');
  if (!(select instanceof HTMLSelectElement)) {
    return;
  }
  const resolved = resolvePrimaryTopic(select.value, topics);
  select.value = resolved;
};

const resetTopicSelection = (card) => {
  const checkboxes = card.querySelectorAll('[data-role="observation-topic"]');
  checkboxes.forEach((checkbox) => {
    if (checkbox instanceof HTMLInputElement) {
      checkbox.checked = checkbox.value === 'social';
    }
  });
  syncPrimaryTopicSelection(card);
};

const addObservationForChild = ({ date, card, input }) => {
  const child = getCardChild(card);
  if (!child) {
    return;
  }

  const normalized = normalizeObservationInput(input.value);
  if (!normalized) {
    return;
  }

  const selectedTopics = getSelectedTopics(card);
  const primaryTopic = getPrimaryTopicSelection(card);
  const observationEntry = buildTopicEntry({
    text: normalized,
    topics: selectedTopics,
    primaryTopic,
  });
  if (!observationEntry) {
    return;
  }

  const presets = getObservationPresets();
  const existingPreset = findExistingPreset(presets, normalized);
  if (!existingPreset) {
    addPreset('observations', observationEntry);
  }

  const entry = getEntry(date);
  const existing = normalizeObservationList(
    getObservationEntries(entry, child),
  );

  if (
    existing.some(
      (item) =>
        normalizeObservationKey(item) ===
        normalizeObservationKey(observationEntry),
    )
  ) {
    showFeedback(card, 'Bereits für heute erfasst.');
    return;
  }

  addEntryForChild(date, child, observationEntry);

  input.value = '';
  resetTopicSelection(card);
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
  date,
}) => {
  if (
    !list ||
    !overlay ||
    !overlayPanel ||
    !overlayContent ||
    !overlayTitle ||
    !templatesOverlay
  ) {
    return;
  }

  let activeChild = null;
  let isOverlayOpen = false;
  let isTemplateOverlayOpen = false;
  const handleTemplateSearch = debounce((input) => {
    setTemplateQuery(templatesOverlay, input.value);
  }, 200);
  let longPressTimer = null;
  let suppressNextClick = false;

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
    overlayTitle.textContent = activePanel ? child : '';
    overlayContent.scrollTop = 0;
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
    isOverlayOpen = false;
    activeChild = null;
    overlay.classList.remove('is-open');
    overlay.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('observation-overlay-open');
  };

  const openTemplateOverlay = (child) => {
    if (!child) {
      return;
    }
    activeChild = child;
    isTemplateOverlayOpen = true;
    templatesOverlay.classList.add('is-open');
    templatesOverlay.setAttribute('aria-hidden', 'false');
    overlayPanel.classList.add('is-template-open');
    applyTemplateFilters(templatesOverlay);
    const searchInput = templatesOverlay.querySelector(
      '[data-role="observation-template-search"]',
    );
    if (isInputElement(searchInput)) {
      searchInput.focus();
    }
  };

  const closeTemplateOverlay = () => {
    if (!isTemplateOverlayOpen) {
      return;
    }
    isTemplateOverlayOpen = false;
    templatesOverlay.classList.remove('is-open');
    templatesOverlay.setAttribute('aria-hidden', 'true');
    overlayPanel.classList.remove('is-template-open');
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

  const handleOverlaySubmit = (event) => {
    const target = event.target;
    if (!isFormElement(target)) {
      return;
    }
    if (target.dataset.role !== 'observation-form') {
      return;
    }

    event.preventDefault();
    const card = target.closest('[data-child]');
    if (!card || !getCardChild(card)) {
      return;
    }
    if (card.dataset.absent === 'true') {
      return;
    }

    const input = target.querySelector('[data-role="observation-input"]');
    if (!isInputElement(input)) {
      return;
    }

    addObservationForChild({ date, card, input });
  };

  const handleOverlayChange = (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    if (target instanceof HTMLInputElement && target.dataset.role === 'observation-topic') {
      const card = target.closest('[data-child]');
      if (card) {
        syncPrimaryTopicSelection(card);
      }
      return;
    }

    if (
      target instanceof HTMLSelectElement &&
      target.dataset.role === 'observation-primary-topic'
    ) {
      const card = target.closest('[data-child]');
      if (!card) {
        return;
      }
      const primary = target.value;
      const checkbox = card.querySelector(
        `[data-role=\"observation-topic\"][value=\"${primary}\"]`,
      );
      if (checkbox instanceof HTMLInputElement) {
        checkbox.checked = true;
      }
      syncPrimaryTopicSelection(card);
    }
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
      const tag = removeButton.dataset.value;
      if (tag) {
        removeObservationForChild(date, card.dataset.child, tag);
      }
      return;
    }

    const topButton = target.closest('[data-role="observation-top-add"]');
    if (topButton) {
      const tag = topButton.dataset.value;
      if (tag) {
        const topics = getSelectedTopics(card);
        const primaryTopic = getPrimaryTopicSelection(card);
        const entry = buildTopicEntry({
          text: tag,
          topics,
          primaryTopic,
        });
        if (entry) {
          addEntryForChild(date, card.dataset.child, entry);
          if (!findExistingPreset(getObservationPresets(), tag)) {
            addPreset('observations', entry);
          }
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
      '[data-role="observation-template-topic"]',
    );
    if (templateFilterButton) {
      return;
    }

    const templateOpenButton = target.closest(
      '[data-role="observation-template-open"]',
    );
    if (templateOpenButton) {
      openTemplateOverlay(card.dataset.child);
    }
  };

  const handleListClick = (event) => {
    const target = event.target;
    if (!isHtmlElement(target)) {
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
    }
  };

  const handleTemplateClick = (event) => {
    const target = event.target;
    if (!isHtmlElement(target)) {
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

    const templateButton = target.closest(
      '[data-role="observation-template-add"]',
    );
    if (templateButton) {
      const tag = templateButton.dataset.value;
      if (tag && activeChild) {
        const entry = buildTopicEntry({
          text: tag,
          topics: (templateButton.dataset.topics || '')
            .split(',')
            .map((item) => item.trim())
            .filter(Boolean),
          primaryTopic: templateButton.dataset.primaryTopic || '',
        });
        if (entry) {
          addEntryForChild(date, activeChild, entry);
        }
      }
      return;
    }

    const templateFilterButton = target.closest(
      '[data-role="observation-template-topic"]',
    );
    if (templateFilterButton) {
      setTemplateFilter(
        templatesOverlay,
        templateFilterButton.dataset.value || 'ALL',
      );
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
      toggleAbsentChild(date, button.dataset.child);
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

  overlayContent.addEventListener('submit', handleOverlaySubmit);
  overlayContent.addEventListener('change', handleOverlayChange);
  overlayContent.addEventListener('click', handleOverlayClick);
  list.addEventListener('click', handleListClick);
  list.addEventListener('pointerdown', handleListPointerDown);
  list.addEventListener('pointerup', handleListPointerEnd);
  list.addEventListener('pointerleave', handleListPointerEnd);
  list.addEventListener('pointercancel', handleListPointerEnd);
  overlay.addEventListener('click', handleOverlayBackdropClick);

  if (closeButton) {
    closeButton.addEventListener('click', () => {
      closeOverlay();
    });
  }

  templatesOverlay.addEventListener('input', handleTemplateInput);
  templatesOverlay.addEventListener('click', handleTemplateClick);

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
  if (initialChild) {
    openOverlay(initialChild, { updateHistory: false });
  }
};
