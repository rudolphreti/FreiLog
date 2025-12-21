import { setSelectedDate } from '../state/store.js';
import { getDateRelation, todayYmd } from '../utils/date.js';

const updateDateLegend = (legend, value) => {
  if (!legend) {
    return;
  }

  const relation = getDateRelation(value);
  legend.querySelectorAll('[data-date-status]').forEach((item) => {
    item.classList.toggle('is-active', item.dataset.dateStatus === relation);
  });
};

export const bindDateEntry = (input, legend) => {
  if (!input) {
    return;
  }

  if (!input.value) {
    const today = todayYmd();
    input.value = today;
    setSelectedDate(today);
  }

  updateDateLegend(legend, input.value);

  input.addEventListener('change', () => {
    const nextValue = input.value || todayYmd();
    input.value = nextValue;
    setSelectedDate(nextValue);
    updateDateLegend(legend, nextValue);
  });
};
