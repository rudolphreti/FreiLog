import { addPreset, getEntry, getPresets, updateEntry } from '../db/dbRepository.js';
import { debounce } from '../utils/debounce.js';

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

const applyTemplateFilters = (container) => {
  const selectedInitial = container.dataset.templateFilter || 'ALL';
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
    const initial = button.dataset.initial || '';
    const label = button.dataset.value || '';
    const matchesInitial =
      selectedInitial === 'ALL' || initial === selectedInitial;
    const matchesQuery = normalizedQuery
      ? label.toLocaleLowerCase().includes(normalizedQuery)
      : true;
    button.hidden = !(matchesInitial && matchesQuery);
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
  const buttons = container.querySelectorAll(
    '[data-role="observation-template-letter"]',
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

const addObservationForChild = ({ date, card, input }) => {
  const child = getCardChild(card);
  if (!child) {
    return;
  }

  const normalized = normalizeObservationInput(input.value);
  if (!normalized) {
    return;
  }

  const presets = getObservationPresets();
  const existingPreset = findExistingPreset(presets, normalized);
  const observationValue = existingPreset || normalized;
  if (!existingPreset) {
    addPreset('observations', observationValue);
  }

  const entry = getEntry(date);
  const existing = normalizeObservationList(getObservationTags(entry, child));

  if (existing.includes(observationValue)) {
    showFeedback(card, 'Bereits für heute erfasst.');
    return;
  }

  updateEntry(date, {
    observations: {
      [child]: [observationValue],
    },
  });

  input.value = '';
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
    return Boolean(activePanel);
  };

  const openOverlay = (child, { updateHistory = true } = {}) => {
    if (!child) {
      return false;
    }
    if (!setOverlayState(child)) {
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

    const input = target.querySelector('[data-role="observation-input"]');
    if (!isInputElement(input)) {
      return;
    }

    addObservationForChild({ date, card, input });
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
        addTagForChild(date, card.dataset.child, tag);
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
      openTemplateOverlay(card.dataset.child);
    }
  };

  const handleListClick = (event) => {
    const target = event.target;
    if (!isHtmlElement(target)) {
      return;
    }

    const button = target.closest('[data-role="observation-child"]');
    if (!button) {
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
        addTagForChild(date, activeChild, tag);
      }
      return;
    }

    const templateFilterButton = target.closest(
      '[data-role="observation-template-letter"]',
    );
    if (templateFilterButton) {
      setTemplateFilter(
        templatesOverlay,
        templateFilterButton.dataset.value || 'ALL',
      );
    }
  };

  overlayContent.addEventListener('submit', handleOverlaySubmit);
  overlayContent.addEventListener('click', handleOverlayClick);
  list.addEventListener('click', handleListClick);
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
