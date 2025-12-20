import { setSelectedDate } from '../state/store.js';

export const bindDateEntry = (input) => {
  if (!input) {
    return;
  }

  input.addEventListener('change', () => {
    if (input.value) {
      setSelectedDate(input.value);
    }
  });
};
