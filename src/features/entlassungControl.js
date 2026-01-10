const STORAGE_KEY = 'freilog.entlassungStatus';

const getExpirationTimestamp = (ymd) => {
  if (!ymd || typeof ymd !== 'string') {
    return null;
  }
  const expiration = new Date(`${ymd}T23:59:59.999`);
  if (Number.isNaN(expiration.getTime())) {
    return null;
  }
  return expiration.getTime();
};

const getStorage = () => {
  if (typeof localStorage === 'undefined') {
    return null;
  }

  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw);
  } catch (error) {
    console.warn('Failed to parse entlassung status from localStorage.', error);
    return null;
  }
};

const setStorage = (payload) => {
  if (typeof localStorage === 'undefined') {
    return;
  }
  if (!payload) {
    localStorage.removeItem(STORAGE_KEY);
    return;
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
};

export const getEntlassungStatus = (selectedDate) => {
  const stored = getStorage();
  if (!stored || stored.date !== selectedDate || !Array.isArray(stored.children)) {
    return new Set();
  }

  const expiresAt = Number.isFinite(stored.expiresAt)
    ? stored.expiresAt
    : getExpirationTimestamp(stored.date);
  if (!expiresAt || Date.now() > expiresAt) {
    setStorage(null);
    return new Set();
  }

  return new Set(stored.children);
};

export const toggleEntlassungStatus = (selectedDate, child) => {
  if (!child) {
    return getEntlassungStatus(selectedDate);
  }

  const next = getEntlassungStatus(selectedDate);
  if (next.has(child)) {
    next.delete(child);
  } else {
    next.add(child);
  }

  const expiresAt = getExpirationTimestamp(selectedDate);
  setStorage({
    date: selectedDate,
    children: Array.from(next).sort((a, b) => a.localeCompare(b, 'de')),
    expiresAt,
  });

  return next;
};

const updateEntlassungButtonState = (button, isEntlassen) => {
  if (!button) {
    return;
  }
  button.dataset.entlassen = isEntlassen ? 'true' : 'false';
  button.classList.toggle('btn-secondary', isEntlassen);
  button.classList.toggle('btn-outline-secondary', !isEntlassen);
  button.setAttribute('aria-pressed', isEntlassen ? 'true' : 'false');
  if (isEntlassen) {
    ensureEntlassungBadge(button);
  } else {
    removeEntlassungBadge(button);
  }
};

const ensureEntlassungBadge = (button) => {
  const badge = button.querySelector('[data-role="entlassung-badge"]');
  if (badge) {
    return badge;
  }
  const nextBadge = document.createElement('span');
  nextBadge.className = 'badge text-bg-light text-secondary entlassung-badge';
  nextBadge.dataset.role = 'entlassung-badge';
  nextBadge.textContent = 'Entlassen';
  button.appendChild(nextBadge);
  return nextBadge;
};

const removeEntlassungBadge = (button) => {
  const badge = button.querySelector('[data-role="entlassung-badge"]');
  if (badge) {
    badge.remove();
  }
};

export const bindEntlassungControl = ({ container, selectedDate }) => {
  if (!container) {
    return null;
  }

  let currentDate = selectedDate;

  const handleClick = (event) => {
    const target = event.target.closest('[data-role="entlassung-child"]');
    if (!target || !container.contains(target)) {
      return;
    }
    if (target.disabled || container.dataset.readonly === 'true') {
      return;
    }

    const child = target.dataset.child;
    const nextStatus = toggleEntlassungStatus(currentDate, child);
    const isEntlassen = nextStatus.has(child);

    updateEntlassungButtonState(target, isEntlassen);
  };

  container.addEventListener('click', handleClick);

  return {
    updateDate(nextDate) {
      currentDate = nextDate;
    },
  };
};
