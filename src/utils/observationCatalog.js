export const OBSERVATION_GROUP_CODES = [
  'ROT',
  'BLAU',
  'ORANGE',
  'GRUEN',
  'LILA',
  'SCHWARZ',
];

const normalizeWhitespace = (value) => value.trim().replace(/\s+/g, ' ');

export const normalizeObservationText = (value) =>
  typeof value === 'string' ? normalizeWhitespace(value) : '';

export const normalizeObservationKey = (value) =>
  normalizeObservationText(value).toLocaleLowerCase();

export const normalizeObservationGroups = (groups) => {
  if (!Array.isArray(groups)) {
    return [];
  }

  const allowed = new Set(OBSERVATION_GROUP_CODES);
  const seen = new Set();
  const result = [];

  groups.forEach((group) => {
    if (typeof group !== 'string') {
      return;
    }
    const trimmed = group.trim().toLocaleUpperCase();
    if (!trimmed || !allowed.has(trimmed) || seen.has(trimmed)) {
      return;
    }
    seen.add(trimmed);
    result.push(trimmed);
  });

  return result;
};

export const buildObservationId = (text) => {
  const normalized = normalizeObservationKey(text);
  const slug = normalized
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'observation';
};

export const getObservationCatalogLabels = (catalog) => {
  const entries = Array.isArray(catalog) ? catalog : [];
  const seen = new Set();
  const result = [];

  entries.forEach((entry) => {
    const value =
      typeof entry === 'string'
        ? entry
        : entry && typeof entry === 'object'
          ? entry.text
          : '';
    const text = normalizeObservationText(value);
    if (!text) {
      return;
    }
    const key = normalizeObservationKey(text);
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    result.push(text);
  });

  return result.sort((a, b) => a.localeCompare(b, 'de', { sensitivity: 'base' }));
};
