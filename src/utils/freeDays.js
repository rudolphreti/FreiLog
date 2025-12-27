import { isValidYmd } from './date.js';

const WEEKEND_DAYS = [0, 6];

const toUtcDate = (ymd) => {
  if (!isValidYmd(ymd)) {
    return null;
  }
  const [year, month, day] = ymd.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
};

const toDayNumber = (ymd) => {
  const date = toUtcDate(ymd);
  return date ? date.getTime() : null;
};

const formatYmd = (date) => {
  if (!(date instanceof Date)) {
    return '';
  }
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const normalizeEntryDates = (startRaw, endRaw) => {
  const startDate = toUtcDate(startRaw);
  const endDate = toUtcDate(endRaw || startRaw);

  if (!startDate) {
    return null;
  }

  if (!endDate) {
    return {
      startYmd: formatYmd(startDate),
      endYmd: formatYmd(startDate),
    };
  }

  const startMs = startDate.getTime();
  const endMs = endDate.getTime();

  if (endMs < startMs) {
    return {
      startYmd: formatYmd(endDate),
      endYmd: formatYmd(startDate),
    };
  }

  return {
    startYmd: formatYmd(startDate),
    endYmd: formatYmd(endDate),
  };
};

export const DEFAULT_FREE_DAYS = [
  {
    start: '2025-10-26',
    end: '2025-10-26',
    label: 'Nationalfeiertag (Dzień Narodowy Austrii)',
  },
  {
    start: '2025-10-27',
    end: '2025-10-31',
    label: 'Herbstferien (ferie jesienne)',
  },
  {
    start: '2025-11-15',
    end: '2025-11-15',
    label: 'Heiliger Leopold – Wien (święto Wiednia)',
  },
  {
    start: '2025-12-24',
    end: '2026-01-06',
    label: 'Weihnachtsferien (ferie bożonarodzeniowe)',
  },
  {
    start: '2025-12-25',
    end: '2025-12-25',
    label: 'Christtag (Boże Narodzenie)',
  },
  {
    start: '2025-12-26',
    end: '2025-12-26',
    label: 'Stephanitag (św. Szczepan)',
  },
  {
    start: '2026-01-01',
    end: '2026-01-01',
    label: 'Neujahr (Nowy Rok)',
  },
  {
    start: '2026-01-06',
    end: '2026-01-06',
    label: 'Heilige Drei Könige (Trzech Könige)',
  },
  {
    start: '2026-02-02',
    end: '2026-02-08',
    label: 'Semesterferien (ferie semestralne)',
  },
  {
    start: '2026-03-28',
    end: '2026-04-06',
    label: 'Osterferien (ferie wielkanocne)',
  },
  {
    start: '2026-04-06',
    end: '2026-04-06',
    label: 'Ostermontag (Poniedziałek Wielkanocny)',
  },
  {
    start: '2026-05-01',
    end: '2026-05-01',
    label: 'Staatsfeiertag (Święto Państwowe)',
  },
  {
    start: '2026-05-14',
    end: '2026-05-14',
    label: 'Christi Himmelfahrt (Wniebowstąpienie)',
  },
  {
    start: '2026-05-23',
    end: '2026-05-25',
    label: 'Pfingstferien (Zielone Świątki)',
  },
  {
    start: '2026-05-25',
    end: '2026-05-25',
    label: 'Pfingstmontag (Poniedziałek Zielonoświątkowy)',
  },
  {
    start: '2026-06-04',
    end: '2026-06-04',
    label: 'Fronleichnam (Boże Ciało)',
  },
  {
    start: '2026-07-04',
    end: '2026-09-06',
    label: 'Sommerferien (wakacje letnie)',
  },
];

export const normalizeFreeDayEntry = (value) => {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const startRaw = value.start || value.startDate || value.date || '';
  const endRaw = value.end || value.endDate || value.until || value.date || '';
  const normalizedDates = normalizeEntryDates(startRaw, endRaw);
  if (!normalizedDates) {
    return null;
  }

  const label =
    typeof value.label === 'string' && value.label.trim() ? value.label.trim() : '';

  return {
    start: normalizedDates.startYmd,
    end: normalizedDates.endYmd,
    label,
  };
};

export const normalizeFreeDays = (value, fallback = []) => {
  const primary = Array.isArray(value) ? value : [];
  const secondary = Array.isArray(fallback) ? fallback : [];
  const merged = [...primary, ...secondary];
  const byRange = new Map();

  merged.forEach((item) => {
    const entry = normalizeFreeDayEntry(item);
    if (!entry) {
      return;
    }
    const key = `${entry.start}__${entry.end}`;
    if (!byRange.has(key)) {
      byRange.set(key, entry);
    }
  });

  return Array.from(byRange.values()).sort((a, b) => {
    const startDiff = a.start.localeCompare(b.start);
    if (startDiff !== 0) {
      return startDiff;
    }
    return a.end.localeCompare(b.end);
  });
};

export const isWeekend = (ymd) => {
  const date = toUtcDate(ymd);
  if (!date) {
    return false;
  }
  return WEEKEND_DAYS.includes(date.getUTCDay());
};

const isWithinRange = (ymd, start, end) => {
  const target = toDayNumber(ymd);
  const startValue = toDayNumber(start);
  const endValue = toDayNumber(end || start);
  if (target === null || startValue === null || endValue === null) {
    return false;
  }
  return target >= startValue && target <= endValue;
};

const rangeLength = (start, end) => {
  const startValue = toDayNumber(start);
  const endValue = toDayNumber(end || start);
  if (startValue === null || endValue === null) {
    return Number.MAX_SAFE_INTEGER;
  }
  return endValue - startValue;
};

export const findFreeDayMatch = (ymd, freeDays = []) => {
  const entries = Array.isArray(freeDays) ? freeDays : [];
  const matches = entries
    .map((entry) => ({ ...entry, span: rangeLength(entry.start, entry.end) }))
    .filter((entry) => isWithinRange(ymd, entry.start, entry.end));

  if (!matches.length) {
    return null;
  }

  matches.sort((a, b) => {
    const spanDiff = a.span - b.span;
    if (spanDiff !== 0) {
      return spanDiff;
    }
    const startDiff = a.start.localeCompare(b.start);
    if (startDiff !== 0) {
      return startDiff;
    }
    return a.end.localeCompare(b.end);
  });

  const best = matches[0];
  return best
    ? {
        start: best.start,
        end: best.end,
        label: best.label || '',
      }
    : null;
};

export const getFreeDayInfo = (ymd, freeDays = []) => {
  if (!isValidYmd(ymd)) {
    return null;
  }

  const match = findFreeDayMatch(ymd, freeDays);
  if (match) {
    return {
      ...match,
      type: 'holiday',
    };
  }

  if (isWeekend(ymd)) {
    return {
      start: ymd,
      end: ymd,
      label: 'Wochenende',
      type: 'weekend',
    };
  }

  return null;
};

export const isFreeDay = (ymd, freeDays = []) => Boolean(getFreeDayInfo(ymd, freeDays));
