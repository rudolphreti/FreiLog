import { updateEntry } from '../db/dbRepository.js';

const updateObservation = (date, list, child) => {
  const card = list.querySelector(`[data-child="${child}"]`);
  if (!card) {
    return;
  }

  const presetInput = card.querySelector('[data-role="observation-preset"]');
  const noteInput = card.querySelector('[data-role="observation-note"]');
  const preset = presetInput ? presetInput.value.trim() : '';
  const note = noteInput ? noteInput.value : '';

  updateEntry(date, {
    observations: {
      [child]: {
        preset,
        note,
      },
    },
  });
};

export const bindObservations = ({ list, date }) => {
  if (!list) {
    return;
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

    updateObservation(date, list, card.dataset.child);
  });
};
