export const sortLocale = (a, b) => {
  const left = typeof a === 'string' ? a : String(a ?? '');
  const right = typeof b === 'string' ? b : String(b ?? '');
  return left.localeCompare(right, 'de-AT');
};
