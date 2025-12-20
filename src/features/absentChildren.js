import { updateEntry } from '../db/dbRepository.js';

const getOrderedChildren = (list) =>
  Array.from(list.querySelectorAll('[data-role="attendance-row"]')).map(
    (item) => item.dataset.child,
  );

const updateAbsent = (allList, absentSet, date) => {
  const ordered = getOrderedChildren(allList);
  const absent = ordered.filter((child) => absentSet.has(child));
  updateEntry(date, { absentChildIds: absent });
};

export const bindAbsentChildren = ({ absentList, allList, date }) => {
  if (!absentList || !allList) {
    return;
  }

  absentList.addEventListener('click', (event) => {
    const button = event.target.closest('[data-role="absent-remove"]');
    if (!button) {
      return;
    }

    const child = button.dataset.child;
    if (!child) {
      return;
    }

    const absentSet = new Set(
      Array.from(allList.querySelectorAll('.is-absent')).map(
        (item) => item.dataset.child,
      ),
    );
    absentSet.delete(child);
    updateAbsent(allList, absentSet, date);
  });

  allList.addEventListener('click', (event) => {
    const row = event.target.closest('[data-role="attendance-row"]');
    if (!row) {
      return;
    }

    const child = row.dataset.child;
    if (!child) {
      return;
    }

    const absentSet = new Set(
      Array.from(allList.querySelectorAll('.is-absent')).map(
        (item) => item.dataset.child,
      ),
    );

    if (absentSet.has(child)) {
      absentSet.delete(child);
    } else {
      absentSet.add(child);
    }

    updateAbsent(allList, absentSet, date);
  });
};
