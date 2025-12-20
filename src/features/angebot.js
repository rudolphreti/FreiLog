import { addPreset, updateEntry } from '../db/dbRepository.js';
import { debounce } from '../utils/debounce.js';

const updateAngebot = (date, value) => {
  const trimmed = value.trim();
  updateEntry(date, { angebote: trimmed ? [trimmed] : [] });
};

export const bindAngebot = ({ comboInput, addInput, addButton, date }) => {
  if (!comboInput) {
    return;
  }

  const debouncedUpdate = debounce(() => {
    updateAngebot(date, comboInput.value || '');
  });

  comboInput.addEventListener('input', debouncedUpdate);

  if (addButton && addInput) {
    addButton.addEventListener('click', () => {
      const value = addInput.value.trim();
      if (!value) {
        return;
      }

      addPreset('angebote', value);
      comboInput.value = value;
      updateAngebot(date, value);
      addInput.value = '';
    });
  }
};
