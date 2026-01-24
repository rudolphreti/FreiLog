const normalizeNoteText = (value) => (typeof value === 'string' ? value : '');

const buildNoteKey = (value) => {
  if (typeof value !== 'string') {
    return '';
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }
  return trimmed.toLocaleLowerCase('de');
};

export const normalizeObservationNoteList = (value) => {
  if (typeof value === 'string') {
    return buildNoteKey(value) ? [value] : [];
  }

  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const nested =
      value.items ?? value.notes ?? value.values ?? value.value ?? [];
    return normalizeObservationNoteList(nested);
  }

  if (!Array.isArray(value)) {
    return [];
  }

  const seen = new Set();
  const result = [];
  value.forEach((item) => {
    const note = normalizeNoteText(item);
    const key = buildNoteKey(note);
    if (!key || seen.has(key)) {
      return;
    }
    seen.add(key);
    result.push(note);
  });
  return result;
};

export const mergeObservationNoteLists = (existing, incoming) =>
  normalizeObservationNoteList([
    ...normalizeObservationNoteList(existing),
    ...normalizeObservationNoteList(incoming),
  ]);

export const hasObservationNotes = (value) => normalizeObservationNoteList(value).length > 0;
