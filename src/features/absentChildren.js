import { updateEntry } from '../db/dbRepository.js';
import { debounce } from '../utils/debounce.js';

const applyFilter = (list, query) => {
  const normalized = query.trim().toLowerCase();
  list.querySelectorAll('[data-child]').forEach((item) => {
    const name = item.dataset.child.toLowerCase();
    item.hidden = normalized && !name.includes(normalized);
  });
};

const updateAbsent = (list, date) => {
  const checked = Array.from(
    list.querySelectorAll('input[type="checkbox"]'),
  )
    .filter((input) => input.checked)
    .map((input) => input.value);

  updateEntry(date, { absentChildren: checked });
};

export const bindAbsentChildren = ({ searchInput, list, date }) => {
  if (!searchInput || !list) {
    return;
  }

  const debouncedFilter = debounce(() => {
    applyFilter(list, searchInput.value);
  });

  searchInput.addEventListener('input', debouncedFilter);

  list.addEventListener('change', (event) => {
    if (event.target instanceof HTMLInputElement) {
      updateAbsent(list, date);
    }
  });

  applyFilter(list, searchInput.value || '');
};
