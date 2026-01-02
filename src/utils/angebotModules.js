import { isValidYmd } from './date.js';
import { normalizeAngebotText } from './angebotCatalog.js';
import {
  buildSubjectKey,
  DEFAULT_TIMETABLE_LESSONS,
  TIMETABLE_DAY_ORDER,
} from './timetable.js';

const FREIZEIT_KEY = buildSubjectKey('Freizeit');
const isPlainObject = (value) => value && typeof value === 'object' && !Array.isArray(value);

const DAY_KEY_BY_INDEX = {
  1: 'monday',
  2: 'tuesday',
  3: 'wednesday',
  4: 'thursday',
  5: 'friday',
};

const uniqueSorted = (values) => {
  if (!Array.isArray(values)) {
    return [];
  }
  return Array.from(new Set(values))
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, 'de'));
};

const normalizeAngebotList = (value) => {
  const list = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? [value]
      : [];
  const normalized = list
    .map((item) => normalizeAngebotText(item))
    .filter(Boolean);
  return uniqueSorted(normalized);
};

const formatPeriodLabel = (startPeriod, endPeriod) => {
  if (!startPeriod || !endPeriod) {
    return '';
  }
  if (startPeriod === endPeriod) {
    return `${startPeriod}. Stunde`;
  }
  return `${startPeriod}.–${endPeriod}. Stunde`;
};

const formatTimeLabel = (lessons, startPeriod, endPeriod) => {
  const safeLessons = Array.isArray(lessons) && lessons.length ? lessons : DEFAULT_TIMETABLE_LESSONS;
  const startTime = safeLessons[startPeriod - 1]?.start;
  const endTime = safeLessons[endPeriod - 1]?.end;
  if (startTime && endTime) {
    return `${startTime}–${endTime}`;
  }
  return '';
};

const hasFreizeit = (cell = []) =>
  Array.isArray(cell) && cell.some((subject) => buildSubjectKey(subject) === FREIZEIT_KEY);

export const getTimetableDayKey = (ymd) => {
  if (!isValidYmd(ymd)) {
    return '';
  }
  const date = new Date(ymd);
  const weekday = date.getDay();
  return DAY_KEY_BY_INDEX[weekday] || '';
};

export const buildFreizeitModules = ({ scheduleDay = [], lessons = DEFAULT_TIMETABLE_LESSONS }) => {
  const modules = [];
  if (!Array.isArray(scheduleDay) || !scheduleDay.length) {
    return modules;
  }

  let start = null;
  let end = null;

  const pushModule = () => {
    if (start === null || end === null) {
      return;
    }
    const id = `freizeit-${start}-${end}`;
    const periodLabel = formatPeriodLabel(start, end);
    const timeLabel = formatTimeLabel(lessons, start, end);
    modules.push({
      id,
      startPeriod: start,
      endPeriod: end,
      periodLabel,
      timeLabel,
      tabLabel: timeLabel ? `${periodLabel} · ${timeLabel}` : periodLabel,
      descriptor: timeLabel ? `${periodLabel} (${timeLabel})` : periodLabel,
    });
  };

  scheduleDay.forEach((cell, index) => {
    const period = index + 1;
    const isFreizeit = hasFreizeit(cell);
    if (isFreizeit && start === null) {
      start = period;
      end = period;
      return;
    }
    if (isFreizeit && start !== null) {
      end = period;
      return;
    }
    if (!isFreizeit && start !== null) {
      pushModule();
      start = null;
      end = null;
    }
  });

  if (start !== null) {
    pushModule();
  }

  return modules.map((module, index) => ({ ...module, index: index + 1 }));
};

export const getFreizeitModulesForDate = (
  ymd,
  timetableSchedule = {},
  timetableLessons = DEFAULT_TIMETABLE_LESSONS,
) => {
  const dayKey = getTimetableDayKey(ymd);
  if (!dayKey) {
    return [];
  }
  const scheduleDay = Array.isArray(timetableSchedule?.[dayKey])
    ? timetableSchedule[dayKey]
    : [];
  const lessons = Array.isArray(timetableLessons) && timetableLessons.length
    ? timetableLessons
    : DEFAULT_TIMETABLE_LESSONS;
  return buildFreizeitModules({ scheduleDay, lessons });
};

export const getFreizeitModulesByDay = (
  timetableSchedule = {},
  timetableLessons = DEFAULT_TIMETABLE_LESSONS,
) => {
  const lessons =
    Array.isArray(timetableLessons) && timetableLessons.length
      ? timetableLessons
      : DEFAULT_TIMETABLE_LESSONS;
  const schedule =
    timetableSchedule && typeof timetableSchedule === 'object'
      ? timetableSchedule
      : {};
  const modulesByDay = {};

  TIMETABLE_DAY_ORDER.forEach(({ key }) => {
    modulesByDay[key] = buildFreizeitModules({
      scheduleDay: Array.isArray(schedule[key]) ? schedule[key] : [],
      lessons,
    });
  });

  return modulesByDay;
};

export const normalizeFixedAngeboteConfig = (
  assignments,
  timetableSchedule = {},
  timetableLessons = DEFAULT_TIMETABLE_LESSONS,
) => {
  const modulesByDay = getFreizeitModulesByDay(timetableSchedule, timetableLessons);
  const source = isPlainObject(assignments) ? assignments : {};
  const normalized = {};

  Object.entries(modulesByDay).forEach(([dayKey, modules]) => {
    const daySource = isPlainObject(source[dayKey]) ? source[dayKey] : {};
    const dayAssignments = {};

    modules.forEach((module) => {
      const list = normalizeAngebotListForModules(daySource[module.id]);
      if (list.length) {
        dayAssignments[module.id] = list;
      }
    });

    if (Object.keys(dayAssignments).length) {
      normalized[dayKey] = dayAssignments;
    }
  });

  return normalized;
};

export const normalizeModuleAssignments = (modules, assignments, fallbackAngebote = []) => {
  const allowedIds = new Set((Array.isArray(modules) ? modules : []).map((module) => module.id));
  const result = {};

  if (assignments && typeof assignments === 'object') {
    Object.entries(assignments).forEach(([moduleId, value]) => {
      if (!allowedIds.has(moduleId)) {
        return;
      }
      result[moduleId] = normalizeAngebotList(value);
    });
  }

  (Array.isArray(modules) ? modules : []).forEach((module) => {
    if (!result[module.id]) {
      result[module.id] = [];
    }
  });

  const normalizedFallback = normalizeAngebotList(fallbackAngebote);
  const hasAssignments = Object.values(result).some((list) => list.length > 0);
  if (!hasAssignments && normalizedFallback.length && modules?.length) {
    const firstModuleId = modules[0].id;
    result[firstModuleId] = normalizeAngebotList([
      ...(result[firstModuleId] || []),
      ...normalizedFallback,
    ]);
  }

  return result;
};

export const flattenModuleAssignments = (assignments, extras = []) => {
  const aggregated = [];
  if (assignments && typeof assignments === 'object') {
    Object.values(assignments).forEach((list) => {
      aggregated.push(...normalizeAngebotList(list));
    });
  }
  aggregated.push(...normalizeAngebotList(extras));
  return uniqueSorted(aggregated);
};

export const mergeModuleAssignments = (currentAssignments, patchAssignments) => {
  const merged = { ...(currentAssignments || {}) };
  if (patchAssignments && typeof patchAssignments === 'object') {
    Object.entries(patchAssignments).forEach(([moduleId, list]) => {
      merged[moduleId] = normalizeAngebotList(list);
    });
  }
  return merged;
};

export const normalizeAngebotListForModules = normalizeAngebotList;
