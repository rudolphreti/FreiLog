import { addPreset, getEntry, getPresets, updateEntry } from '../db/dbRepository.js';
import { debounce } from '../utils/debounce.js';
const normalizeObservationInput = (value) => {
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim().replace(/\s+/g, ' ');
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
  const current =
    entry.observations && entry.observations[child]
      ? entry.observations[child]
      : [];
  const updatedTags = normalizeObservationList(current).filter(
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

const updatePresetButtonState = (card, value) => {
  const button = card.querySelector('[data-role="observation-save-preset"]');
  if (!(button instanceof HTMLButtonElement)) {
    return;
  }

  const presets = getObservationPresets();
  const trimmed = normalizeObservationInput(value);
  const shouldShow = Boolean(trimmed) && !presets.includes(trimmed);

  button.disabled = !shouldShow;
  button.classList.toggle('d-none', !shouldShow);
};

const normalizeTemplateQuery = (value) =>
  typeof value === 'string' ? value.trim().toLocaleLowerCase() : '';

const applyTemplateFilters = (card) => {
  const selectedInitial = card.dataset.templateFilter || 'ALL';
  const query = card.dataset.templateQuery || '';
  const normalizedQuery = normalizeTemplateQuery(query);
  const templateButtons = card.querySelectorAll(
    '[data-role="observation-template-add"]',
  );
  const templateGroups = card.querySelectorAll(
    '[data-role="observation-template-group"]',
  );
  const emptyMessage = card.querySelector(
    '[data-role="observation-template-empty"]',
  );
  const hasTemplates = templateButtons.length > 0;

  if (!hasTemplates) {
    if (emptyMessage instanceof HTMLElement) {
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

  if (emptyMessage instanceof HTMLElement) {
    emptyMessage.hidden = visibleCount > 0;
    emptyMessage.textContent =
      visibleCount > 0
        ? 'Keine gespeicherten Beobachtungen vorhanden.'
        : 'Keine passenden Beobachtungen gefunden.';
  }
};

const setTemplateFilter = (card, selected) => {
  const next =
    selected && selected !== 'ALL'
      ? selected.toLocaleUpperCase()
      : 'ALL';
  card.dataset.templateFilter = next;
  const buttons = card.querySelectorAll(
    '[data-role="observation-template-letter"]',
  );
  buttons.forEach((button) => {
    const isActive = button.dataset.value === next;
    button.classList.toggle('active', isActive);
    button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
  });
  applyTemplateFilters(card);
};

const setTemplateQuery = (card, query) => {
  card.dataset.templateQuery = typeof query === 'string' ? query : '';
  applyTemplateFilters(card);
};

const feedbackTimeouts = new WeakMap();

const showFeedback = (card, message) => {
  const feedback = card.querySelector('[data-role="observation-feedback"]');
  if (!(feedback instanceof HTMLElement)) {
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
  const child = card.dataset.child;
  if (!child) {
    return;
  }

  const normalized = normalizeObservationInput(input.value);
  if (!normalized) {
    return;
  }

  const presets = getObservationPresets();
  if (!presets.includes(normalized)) {
    addPreset('observations', normalized);
  }

  const entry = getEntry(date);
  const current =
    entry.observations && entry.observations[child]
      ? entry.observations[child]
      : [];
  const existing = normalizeObservationList(current);

  if (existing.includes(normalized)) {
    showFeedback(card, 'Bereits für heute erfasst.');
    return;
  }

  updateEntry(date, {
    observations: {
      [child]: [normalized],
    },
  });

  input.value = '';
  updatePresetButtonState(card, '');
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
  overlayContent,
  overlayTitle,
  closeButton,
  date,
}) => {
  if (!list || !overlay || !overlayContent || !overlayTitle) {
    return;
  }

  let activeChild = null;
  let isOverlayOpen = false;
  const handleTemplateSearch = debounce((input, card) => {
    setTemplateQuery(card, input.value);
  }, 200);

  const setOverlayState = (child) => {
    const detailPanels = overlayContent.querySelectorAll('[data-child]');
    let activePanel = null;
    detailPanels.forEach((panel) => {
      panel.hidden = panel.dataset.child !== child;
      if (!panel.hidden) {
        activePanel = panel;
      }
    });
    overlayTitle.textContent = activePanel ? child : '';
    overlayContent.scrollTop = 0;
    if (activePanel) {
      applyTemplateFilters(activePanel);
    }
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
    isOverlayOpen = false;
    activeChild = null;
    overlay.classList.remove('is-open');
    overlay.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('observation-overlay-open');
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

  overlayContent.addEventListener('input', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) {
      return;
    }

    const card = target.closest('[data-child]');
    if (!card) {
      return;
    }

    if (target.dataset.role === 'observation-input') {
      updatePresetButtonState(card, target.value);
      return;
    }

    if (target.dataset.role === 'observation-template-search') {
      handleTemplateSearch(target, card);
    }
  });

  overlayContent.addEventListener('submit', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLFormElement)) {
      return;
    }
    if (target.dataset.role !== 'observation-form') {
      return;
    }

    event.preventDefault();
    const card = target.closest('[data-child]');
    if (!card || !card.dataset.child) {
      return;
    }

    const input = target.querySelector('[data-role="observation-input"]');
    if (!(input instanceof HTMLInputElement)) {
      return;
    }

    addObservationForChild({ date, card, input });
  });

  overlayContent.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    const card = target.closest('[data-child]');
    if (!card || !card.dataset.child) {
      return;
    }

    const savePresetButton = target.closest(
      '[data-role="observation-save-preset"]',
    );
    if (savePresetButton) {
      const input = card.querySelector('[data-role="observation-input"]');
      if (!(input instanceof HTMLInputElement)) {
        return;
      }
      const trimmed = normalizeObservationInput(input.value);
      if (trimmed && !getObservationPresets().includes(trimmed)) {
        addPreset('observations', trimmed);
      }
      updatePresetButtonState(card, input.value);
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
        if (!getObservationPresets().includes(tag)) {
          addPreset('observations', tag);
        }
      }
      return;
    }

    const templateButton = target.closest(
      '[data-role="observation-template-add"]',
    );
    if (templateButton) {
      const tag = templateButton.dataset.value;
      if (tag) {
        addTagForChild(date, card.dataset.child, tag);
      }
      return;
    }

    const templateFilterButton = target.closest(
      '[data-role="observation-template-letter"]',
    );
    if (templateFilterButton) {
      setTemplateFilter(card, templateFilterButton.dataset.value || 'ALL');
    }
  });

  list.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
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
  });

  overlay.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    if (target === overlay) {
      closeOverlay();
    }
  });

  if (closeButton) {
    closeButton.addEventListener('click', () => {
      closeOverlay();
    });
  }

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
