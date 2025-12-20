import { addPreset, updateEntry } from '../db/dbRepository.js';

const updateAngebot = (date, value) => {
  const trimmed = value.trim();
  updateEntry(date, { angebote: trimmed ? [trimmed] : [] });
};

export const bindAngebot = ({ comboInput, addInput, addButton, date }) => {
  if (!comboInput) {
    return;
  }

  comboInput.addEventListener('input', () => {
    updateAngebot(date, comboInput.value || '');
  });

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
