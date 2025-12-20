export const sortBy = (items, accessor) => {
  return [...items].sort((a, b) => {
    const left = accessor(a);
    const right = accessor(b);
    if (left < right) return -1;
    if (left > right) return 1;
    return 0;
  });
};
