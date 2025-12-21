import { setSelectedDate } from '../state/store.js';
import { todayYmd } from '../utils/date.js';

export const bindDateEntry = (input) => {
  if (!input) {
    return;
  }

  if (!input.value) {
    const today = todayYmd();
    input.value = today;
    setSelectedDate(today);
  }

  input.addEventListener('change', () => {
    const nextValue = input.value || todayYmd();
    input.value = nextValue;
    setSelectedDate(nextValue);
  });
};
