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

const normalizeSearch = (value) => {
  if (typeof value !== 'string') {
    return '';
  }

  return value
    .trim()
    .toLocaleLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');
};

const applyChildFilter = (list, value) => {
  const query = normalizeSearch(value);
  const cards = Array.from(list.querySelectorAll('[data-child]'));
  cards.forEach((card) => {
    const name = normalizeSearch(card.dataset.child || '');
    card.classList.toggle('is-hidden', Boolean(query && !name.includes(query)));
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

export const bindObservations = ({ list, searchInput, date }) => {
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

  if (searchInput instanceof HTMLInputElement) {
    const handleSearch = debounce(
      () => applyChildFilter(list, searchInput.value),
      150,
    );
    searchInput.addEventListener('input', handleSearch);
  }

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
