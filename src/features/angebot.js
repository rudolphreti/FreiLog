import { addPreset, getEntry, getPresets, updateEntry } from '../db/dbRepository.js';
import { buildTopicEntry, getEntryText, normalizeTopicEntries } from '../utils/topics.js';

const normalizeOffers = (value) => {
  return normalizeTopicEntries(value);
};

const addOffer = ({ date, value }) => {
  const trimmed = value.trim();
  if (!trimmed) {
    return;
  }

  const offerEntry = buildTopicEntry({ text: trimmed });
  if (!offerEntry) {
    return;
  }

  const entry = getEntry(date);
  const current = normalizeOffers(entry.angebote);

  const normalizedKey = trimmed.toLocaleLowerCase();
  if (
    !current.some(
      (item) => getEntryText(item).toLocaleLowerCase() === normalizedKey,
    )
  ) {
    updateEntry(date, { angebote: [...current, offerEntry] });
  }

  const presets = getPresets('angebote');
  if (
    !presets.some(
      (item) => getEntryText(item).toLocaleLowerCase() === normalizedKey,
    )
  ) {
    addPreset('angebote', offerEntry);
  }
};

const removeOffer = (date, value) => {
  const entry = getEntry(date);
  const current = normalizeOffers(entry.angebote);
  const normalizedKey = value.toLocaleLowerCase();
  const updated = current.filter(
    (item) => getEntryText(item).toLocaleLowerCase() !== normalizedKey,
  );
  updateEntry(date, { angebote: updated });
};

export const bindAngebot = ({
  comboInput,
  addButton,
  selectedList,
  date,
}) => {
  if (!comboInput || !addButton || !selectedList) {
    return;
  }

  const handleAdd = () => {
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
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    const removeButton = target.closest('[data-role="angebot-remove"]');
    if (!removeButton) {
      return;
    }
    const value = removeButton.dataset.value;
    if (!value) {
      return;
    }
    removeOffer(date, value);
  });
};
