import { addPreset, getEntry, getPresets, updateEntry } from '../db/dbRepository.js';
const normalizeObservationList = (value) => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
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
    const trimmed = item.trim();
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
  const trimmed = value.trim();
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

const updatePresetButtonState = (card, value, presets) => {
  const button = card.querySelector('[data-role="observation-save-preset"]');
  if (!(button instanceof HTMLButtonElement)) {
    return;
  }

  const trimmed = value.trim();
  const shouldShow =
    Boolean(trimmed) && !presets.includes(trimmed);

  button.disabled = !shouldShow;
  button.classList.toggle('d-none', !shouldShow);
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

  const presets = getPresets('observations');
  let activeChild = null;
  let isOverlayOpen = false;

  const setOverlayState = (child) => {
    const detailPanels = overlayContent.querySelectorAll('[data-child]');
    detailPanels.forEach((panel) => {
      panel.hidden = panel.dataset.child !== child;
    });
    overlayTitle.textContent = child || '';
    overlayContent.scrollTop = 0;
  };

  const openOverlay = (child, { updateHistory = true } = {}) => {
    if (!child) {
      return;
    }
    activeChild = child;
    isOverlayOpen = true;
    setOverlayState(child);
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
      updatePresetButtonState(card, target.value, presets);
      return;
    }
  });

  overlayContent.addEventListener('keydown', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) {
      return;
    }
    if (event.key !== 'Enter' || target.dataset.role !== 'observation-input') {
      return;
    }

    event.preventDefault();
    const card = target.closest('[data-child]');
    if (!card || !card.dataset.child) {
      return;
    }

    addTagForChild(date, card.dataset.child, target.value);
    target.value = '';
    updatePresetButtonState(card, '', presets);
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

    const addButton = target.closest('[data-role="observation-add"]');
    if (addButton) {
      const input = card.querySelector('[data-role="observation-input"]');
      if (!(input instanceof HTMLInputElement)) {
        return;
      }
      addTagForChild(date, card.dataset.child, input.value);
      input.value = '';
      updatePresetButtonState(card, '', presets);
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
      const trimmed = input.value.trim();
      if (trimmed && !presets.includes(trimmed)) {
        addPreset('observations', trimmed);
      }
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
      openOverlay(nextChild, { updateHistory: false });
      return;
    }
    closeOverlayInternal();
  });

  const initialChild = parseChildFromHash();
  if (initialChild) {
    openOverlay(initialChild, { updateHistory: false });
  }
};
