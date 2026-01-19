import { ensureYmd } from './date.js';

const normalizeWhitespace = (value) => value.trim().replace(/\s+/g, ' ');

const ensureUniqueSortedStrings = (arr) => {
  if (!Array.isArray(arr)) {
    return [];
  }

  const unique = new Set();
  arr.forEach((item) => {
    if (typeof item === 'string') {
      const trimmed = item.trim();
      if (trimmed) {
        unique.add(trimmed);
      }
    }
  });

  return Array.from(unique).sort((a, b) => a.localeCompare(b));
};

export const normalizeGeldsammlungName = (value) =>
  typeof value === 'string' ? normalizeWhitespace(value) : '';

export const normalizeGeldsammlungId = (value) =>
  normalizeGeldsammlungName(value).toLocaleLowerCase();

export const normalizeGeldsammlungDate = (value) => {
  if (typeof value !== 'string') {
    return '';
  }
  return ensureYmd(value.trim(), '');
};

export const normalizeGeldsammlung = (value = {}, childrenList = []) => {
  const source = value && typeof value === 'object' ? value : {};
  const name = normalizeGeldsammlungName(source.name);
  const date = normalizeGeldsammlungDate(source.date);
  const paidByRaw = Array.isArray(source.paidBy) ? source.paidBy : [];
  const allowedSet = new Set(
    Array.isArray(childrenList)
      ? childrenList.map((child) => normalizeGeldsammlungName(child)).filter(Boolean)
      : [],
  );
  const paidBy = ensureUniqueSortedStrings(
    paidByRaw
      .map((child) => normalizeGeldsammlungName(child))
      .filter((child) => child && (!allowedSet.size || allowedSet.has(child))),
  );

  return {
    id: typeof source.id === 'string' ? source.id : '',
    name,
    date,
    paidBy,
  };
};

export const normalizeGeldsammlungen = (value, childrenList = []) => {
  const entries = Array.isArray(value) ? value : [];
  const seen = new Set();
  const normalized = [];

  entries.forEach((entry) => {
    const next = normalizeGeldsammlung(entry, childrenList);
    if (!next.name || !next.date) {
      return;
    }
    const key = normalizeGeldsammlungId(`${next.name}-${next.date}`);
    if (!key || seen.has(key)) {
      return;
    }
    seen.add(key);
    normalized.push({
      ...next,
      id: next.id || key,
    });
  });

  normalized.sort((a, b) => {
    const dateSort = a.date.localeCompare(b.date);
    if (dateSort !== 0) {
      return dateSort;
    }
    return a.name.localeCompare(b.name, 'de', { sensitivity: 'base' });
  });

  return normalized;
};
