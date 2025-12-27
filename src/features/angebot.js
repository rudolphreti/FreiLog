import { addPreset, getEntry, getPresets, updateEntry } from '../db/dbRepository.js';

const normalizeOffers = (value) => {
  if (!Array.isArray(value)) {
    return [];
  }

  const seen = new Set();
  return value.filter((item) => {
    if (typeof item !== 'string') {
      return false;
    }
    const trimmed = item.trim();
    if (!trimmed || seen.has(trimmed)) {
      return false;
    }
    seen.add(trimmed);
    return true;
  });
};

const addOffer = ({ date, value }) => {
  const trimmed = value.trim();
  if (!trimmed) {
    return;
  }

  const entry = getEntry(date);
  const current = normalizeOffers(entry.angebote);

  if (!current.includes(trimmed)) {
    updateEntry(date, { angebote: [...current, trimmed] });
  }

  const presets = getPresets('angebote');
  if (!presets.includes(trimmed)) {
    addPreset('angebote', trimmed);
  }
};

const removeOffer = (date, value) => {
  const entry = getEntry(date);
  const current = normalizeOffers(entry.angebote);
  const updated = current.filter((item) => item !== value);
  updateEntry(date, { angebote: updated });
};

export const bindAngebot = ({
  comboInput,
  addButton,
  selectedList,
  date,
  readOnly = false,
}) => {
  if (!comboInput || !addButton || !selectedList) {
    return;
  }

  let isReadOnly = Boolean(readOnly);
  comboInput.disabled = isReadOnly;
  addButton.disabled = isReadOnly;

  const handleAdd = () => {
    if (isReadOnly) {
      return;
    }
    const value = comboInput.value || '';
    addOffer({
      date,
      value,
    });
    comboInput.value = '';
  };

  addButton.addEventListener('click', handleAdd);
  comboInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      handleAdd();
    }
  });

  selectedList.addEventListener('click', (event) => {
    if (isReadOnly) {
      return;
    }
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    const removeButton = target.closest('[data-role="angebot-remove"]');
    if (!removeButton) {
      return;
    }
    const value =
      removeButton.dataset.angebot ||
      removeButton.dataset.value ||
      removeButton.closest('[data-angebot]')?.dataset.angebot;
    if (!value) {
      return;
    }
    removeOffer(date, value);
  });

  const updateReadOnly = (nextReadOnly) => {
    isReadOnly = Boolean(nextReadOnly);
    comboInput.disabled = isReadOnly;
    addButton.disabled = isReadOnly;
  };

  return {
    updateReadOnly,
  };
};
