import { isValidYmd } from './date.js';

const pad = (value) => String(value).padStart(2, '0');

const toUtcDate = (ymd) => {
  if (!isValidYmd(ymd)) {
    return null;
  }
  const [year, month, day] = ymd.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
};

const formatYmd = (date) => {
  if (!(date instanceof Date)) {
    return '';
  }
  const year = date.getUTCFullYear();
  const month = pad(date.getUTCMonth() + 1);
  const day = pad(date.getUTCDate());
  return `${year}-${month}-${day}`;
};

const addUtcDays = (date, days) => {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
};

const startOfIsoWeek = (date) => {
  const day = date.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  return addUtcDays(date, diff);
};

const getFirstSchoolMonday = (startDate) => {
  const day = startDate.getUTCDay();
  if (day === 1) {
    return startDate;
  }
  const offset = (8 - day) % 7;
  return addUtcDays(startDate, offset || 7);
};

const getSchoolYearFromDate = (date) => {
  const month = date.getUTCMonth() + 1;
  const year = date.getUTCFullYear();
  const startYear = month >= 9 ? year : year - 1;
  const startDate = new Date(Date.UTC(startYear, 8, 1));
  const endDate = new Date(Date.UTC(startYear + 1, 7, 31));
  const firstWeekStart = getFirstSchoolMonday(startDate);
  const label = `${startYear}-${String(startYear + 1).slice(-2)}`;
  return {
    label,
    startYear,
    startDate,
    endDate,
    firstWeekStart,
  };
};

const clampWeekWithinSchoolYear = (weekStart, schoolYear) => {
  const boundedStart = weekStart < schoolYear.firstWeekStart ? schoolYear.firstWeekStart : weekStart;
  let endDate = addUtcDays(boundedStart, 4);
  if (endDate > schoolYear.endDate) {
    endDate = schoolYear.endDate;
  }
  return {
    startDate: boundedStart,
    endDate,
  };
};

export const getSchoolWeeks = (daysByDate) => {
  const entries = daysByDate ? Object.keys(daysByDate) : [];
  if (!entries.length) {
    return [];
  }

  const schoolYears = new Map();

  entries.forEach((dateKey) => {
    if (!isValidYmd(dateKey)) {
      return;
    }
    const date = toUtcDate(dateKey);
    if (!date) {
      return;
    }
    const schoolYear = getSchoolYearFromDate(date);
    const isoWeekStart = startOfIsoWeek(date);
    const normalizedWeekStart =
      isoWeekStart < schoolYear.firstWeekStart ? schoolYear.firstWeekStart : isoWeekStart;
    const { startDate, endDate } = clampWeekWithinSchoolYear(normalizedWeekStart, schoolYear);
    const startYmd = formatYmd(startDate);
    const endYmd = formatYmd(endDate);
    if (!schoolYears.has(schoolYear.label)) {
      schoolYears.set(schoolYear.label, {
        label: schoolYear.label,
        startYear: schoolYear.startYear,
        startDate,
        endDate,
        firstWeekStart: schoolYear.firstWeekStart,
        weeks: new Map(),
      });
    }
    const yearEntry = schoolYears.get(schoolYear.label);
    if (!yearEntry.weeks.has(startYmd)) {
      yearEntry.weeks.set(startYmd, {
        id: `${schoolYear.label}-${startYmd}`,
        schoolYearLabel: schoolYear.label,
        startDate,
        endDate,
        startYmd,
        endYmd,
      });
    }
  });

  const normalizedYears = Array.from(schoolYears.values()).sort(
    (a, b) => a.startYear - b.startYear,
  );

  normalizedYears.forEach((year) => {
    const weeks = Array.from(year.weeks.values()).sort(
      (a, b) => a.startDate.getTime() - b.startDate.getTime(),
    );
    const startYearShort = String(year.startYear).slice(-2);
    const endYearShort = String(year.startYear + 1).slice(-2);
    weeks.forEach((week, index) => {
      const diffMs = week.startDate.getTime() - year.firstWeekStart.getTime();
      const diffWeeks = Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000));
      week.number = diffWeeks + 1;
      week.label = `${week.number}/${startYearShort}-${endYearShort}`;
    });
    year.weeks = weeks;
  });

  return normalizedYears;
};

export const getLatestWeekForYear = (schoolYears, label) => {
  const year = schoolYears.find((item) => item.label === label);
  if (!year || !year.weeks.length) {
    return null;
  }
  return year.weeks[year.weeks.length - 1];
};

export const formatDisplayDate = (ymd) => {
  const date = toUtcDate(ymd);
  if (!date) {
    return '';
  }
  const day = pad(date.getUTCDate());
  const month = pad(date.getUTCMonth() + 1);
  const year = String(date.getUTCFullYear()).slice(-2);
  return `${day}.${month}.${year}`;
};
