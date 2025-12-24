import { getEntry } from '../db/dbRepository.js';
import { getState, setSelectedDate } from '../state/store.js';
import { ensureYmd, todayYmd } from '../utils/date.js';

const normalizeDateValue = (value) => {
  const fallback = getState().ui?.selectedDate || todayYmd();
  return ensureYmd(value, fallback);
};

const applyDateSelection = (input, value) => {
  const normalized = normalizeDateValue(value);
  input.value = normalized;
  const currentSelected = getState().ui?.selectedDate || '';
  if (currentSelected !== normalized) {
    setSelectedDate(normalized);
  }
  getEntry(normalized);
};

export const bindDateEntry = (input) => {
  if (!input) {
    return;
  }

  if (!input.value) {
    applyDateSelection(input, todayYmd());
  }

  input.addEventListener('change', () => {
    applyDateSelection(input, input.value);
  });
};
