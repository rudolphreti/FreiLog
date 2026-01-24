import { getEntry } from '../db/dbRepository.js';
import { getState, setSelectedDate } from '../state/store.js';
import { addDaysYmd, ensureYmd, todayYmd } from '../utils/date.js';

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

const resolveInput = (target) => {
  if (target instanceof HTMLElement) {
    return { input: target, prevButton: null, nextButton: null };
  }
  return {
    input: target?.input || null,
    prevButton: target?.prevButton || null,
    nextButton: target?.nextButton || null,
  };
};

export const bindDateEntry = (target) => {
  const { input, prevButton, nextButton } = resolveInput(target);
  if (!input) {
    return;
  }

  if (!input.value) {
    applyDateSelection(input, todayYmd());
  }

  if (input.dataset.dateEntryBound === 'true') {
    return;
  }
  input.dataset.dateEntryBound = 'true';

  const applyOffset = (offset) => {
    const current = normalizeDateValue(input.value);
    const next = addDaysYmd(current, offset, current);
    applyDateSelection(input, next);
  };

  input.addEventListener('change', () => {
    applyDateSelection(input, input.value);
  });

  prevButton?.addEventListener('click', () => {
    applyOffset(-1);
  });

  nextButton?.addEventListener('click', () => {
    applyOffset(1);
  });
};
