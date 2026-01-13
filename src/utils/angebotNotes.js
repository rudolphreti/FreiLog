export const ANGEBOT_NOTE_LIMIT = 1000;

export const normalizeAngebotNote = (value) => {
  if (typeof value !== 'string') {
    return '';
  }

  if (value.length <= ANGEBOT_NOTE_LIMIT) {
    return value;
  }

  return value.slice(0, ANGEBOT_NOTE_LIMIT);
};
