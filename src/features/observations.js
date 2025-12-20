import { addPreset, getEntry, getPresets, updateEntry } from '../db/dbRepository.js';
import { debounce } from '../utils/debounce.js';

const normalizeTagList = (value) => {
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

const updateObservationNote = (date, list, child) => {
  const card = list.querySelector(`[data-child="${child}"]`);
  if (!card) {
    return;
  }

  const noteInput = card.querySelector('[data-role="observation-note"]');
  const note = noteInput ? noteInput.value : '';

  updateEntry(date, {
    observations: {
      [child]: {
        note,
      },
    },
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

const addTagForChild = (date, child, value) => {
  const trimmed = value.trim();
  if (!trimmed) {
    return;
  }

  updateEntry(date, {
    observations: {
      [child]: {
        tags: [trimmed],
      },
    },
  });
};

const removeTagForChild = (date, child, tag) => {
  const entry = getEntry(date);
  const current =
    entry.observations && entry.observations[child]
      ? entry.observations[child]
      : {};
  const updatedTags = normalizeTagList(current.tags).filter(
    (item) => item !== tag,
  );

  updateEntry(date, {
    observations: {
      [child]: {
        tags: updatedTags,
        replaceTags: true,
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
  button.classList.toggle('is-hidden', !shouldShow);
};

export const bindObservations = ({ list, date }) => {
  if (!list) {
    return;
  }

  const debouncedByChild = new Map();
  const getDebouncedUpdate = (child) => {
    if (!debouncedByChild.has(child)) {
      debouncedByChild.set(
        child,
        debounce(() => updateObservationNote(date, list, child)),
      );
    }
    return debouncedByChild.get(child);
  };

  const presets = getPresets('observations');

  list.addEventListener('input', (event) => {
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

    if (target.dataset.role === 'observation-note') {
      const debounced = getDebouncedUpdate(card.dataset.child);
      if (debounced) {
        debounced();
      }
    }
  });

  list.addEventListener('keydown', (event) => {
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

  list.addEventListener('click', (event) => {
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
      '[data-role="observation-tag-remove"]',
    );
    if (removeButton) {
      const tag = removeButton.dataset.value;
      if (tag) {
        removeTagForChild(date, card.dataset.child, tag);
      }
    }
  });
};
