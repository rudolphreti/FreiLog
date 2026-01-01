import {
  OBSERVATION_GROUP_CODES,
  buildObservationId,
  normalizeObservationGroups,
  normalizeObservationKey,
  normalizeObservationText,
} from './observationCatalog.js';

export const ANGEBOT_GROUP_CODES = OBSERVATION_GROUP_CODES.filter(
  (code) => code !== 'SCHWARZ',
);

export const normalizeAngebotText = (value) => normalizeObservationText(value);

export const normalizeAngebotKey = (value) => normalizeObservationKey(value);

export const normalizeAngebotGroups = (value) =>
  normalizeObservationGroups(value).filter((code) => code !== 'SCHWARZ');

export const buildAngebotId = (value) => buildObservationId(value);

export const normalizeAngebotCatalog = (value, fallback = []) => {
  const source = Array.isArray(value)
    ? value
    : Array.isArray(fallback)
      ? fallback
      : [];
  const seen = new Set();
  const result = [];

  source.forEach((item) => {
    const rawText =
      typeof item === 'string'
        ? item
        : item && typeof item === 'object'
          ? item.text
          : '';
    const text = normalizeAngebotText(rawText);
    if (!text) {
      return;
    }
    const key = normalizeAngebotKey(text);
    if (seen.has(key)) {
      return;
    }
    seen.add(key);

    const groups = normalizeAngebotGroups(item?.groups);
    const createdAt =
      typeof item?.createdAt === 'string' && item.createdAt.trim()
        ? item.createdAt.trim()
        : '2025-01-01T00:00:00Z';
    const id =
      typeof item?.id === 'string' && item.id.trim()
        ? item.id.trim()
        : buildAngebotId(text);

    result.push({
      id,
      text,
      groups,
      createdAt,
    });
  });

  return result.sort((a, b) => a.text.localeCompare(b.text, 'de', { sensitivity: 'base' }));
};

export const getAngebotCatalogLabels = (catalog) => {
  const entries = Array.isArray(catalog) ? catalog : [];
  const unique = new Map();

  entries.forEach((entry) => {
    const text = normalizeAngebotText(entry?.text || entry || '');
    const key = normalizeAngebotKey(text);
    if (key && !unique.has(key)) {
      unique.set(key, text);
    }
  });

  return Array.from(unique.values()).sort((a, b) =>
    a.localeCompare(b, 'de', { sensitivity: 'base' }),
  );
};

export const buildAngebotCatalogGroupMap = (catalog) => {
  const entries = Array.isArray(catalog) ? catalog : [];
  const groups = new Map();

  entries.forEach((entry) => {
    const text =
      typeof entry === 'string'
        ? entry.trim()
        : typeof entry?.text === 'string'
          ? entry.text.trim()
          : '';
    if (!text) {
      return;
    }
    const normalizedGroups = normalizeAngebotGroups(entry?.groups || []);
    groups.set(normalizeAngebotKey(text), normalizedGroups);
  });

  return groups;
};
