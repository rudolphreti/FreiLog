const pad = (value) => String(value).padStart(2, '0');

export const todayYmd = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = pad(now.getMonth() + 1);
  const day = pad(now.getDate());
  return `${year}-${month}-${day}`;
};

export const isValidYmd = (value) => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
};

export const ensureYmd = (value, fallback) => {
  if (isValidYmd(value)) {
    return value;
  }

  if (isValidYmd(fallback)) {
    return fallback;
  }

  return todayYmd();
};
