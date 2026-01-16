import { clearElement, createEl } from '../ui/dom.js';
import {
  formatDisplayDate,
  getLatestWeekForYear,
  getSchoolWeeks,
} from '../utils/schoolWeeks.js';
import { isValidYmd } from '../utils/date.js';
import {
  normalizeObservationGroups,
  normalizeObservationKey,
} from '../utils/observationCatalog.js';
import { setSelectedDate } from '../state/store.js';
import { getFreeDayInfo, isSummerBreakEntry, isWeekend } from '../utils/freeDays.js';
import { UI_LABELS } from '../ui/labels.js';
import {
  flattenModuleAssignments,
  getFreizeitModulesForDate,
  normalizeModuleAssignments,
} from '../utils/angebotModules.js';
import { normalizeAngebotNote } from '../utils/angebotNotes.js';

const WEEKDAY_LABELS = [
  { label: 'Montag', offset: 0 },
  { label: 'Dienstag', offset: 1 },
  { label: 'Mittwoch', offset: 2 },
  { label: 'Donnerstag', offset: 3 },
  { label: 'Freitag', offset: 4 },
];
const WEEKEND_LABELS = [
  { label: 'Samstag', offset: 5 },
  { label: 'Sonntag', offset: 6 },
];

const normalizeValueList = (value) => {
  const values = Array.isArray(value) ? value : typeof value === 'string' ? [value] : [];
  return values
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean);
};

const normalizeObservationEntry = (value) => {
  if (!value) {
    return [];
  }
  if (Array.isArray(value)) {
    return normalizeValueList(value);
  }
  if (typeof value === 'string') {
    return normalizeValueList([value]);
  }
  if (typeof value === 'object') {
    const preset =
      typeof value.preset === 'string' && value.preset.trim() ? value.preset.trim() : '';
    const tags = normalizeValueList(value.tags);
    if (preset && !tags.includes(preset)) {
      tags.push(preset);
    }
    return tags;
  }
  return [];
};

const normalizeDayEntry = (days, dateKey, timetableSchedule, timetableLessons) => {
  const entry = days?.[dateKey] && typeof days[dateKey] === 'object' ? days[dateKey] : {};
  const angebote = normalizeValueList(entry.angebote);
  const angebotNotes = normalizeAngebotNote(entry.angebotNotes);
  const observations = typeof entry.observations === 'object' ? entry.observations : {};
  const observationNotes =
    entry.observationNotes && typeof entry.observationNotes === 'object'
      ? entry.observationNotes
      : {};
  const absentChildren = Array.isArray(entry.absentChildIds)
    ? entry.absentChildIds
        .map((child) => (typeof child === 'string' ? child.trim() : ''))
        .filter(Boolean)
    : Array.isArray(entry.absentChildren)
      ? entry.absentChildren
          .map((child) => (typeof child === 'string' ? child.trim() : ''))
          .filter(Boolean)
      : [];
  const normalizedObs = Object.entries(observations || {}).reduce((acc, [child, value]) => {
    const normalized = normalizeObservationEntry(value);
    if (normalized.length) {
      acc[child] = normalized;
    }
    return acc;
  }, {});
  const normalizedNotes = Object.entries(observationNotes || {}).reduce((acc, [child, value]) => {
    if (typeof value !== 'string') {
      return acc;
    }
    const trimmed = value.trim();
    if (!trimmed) {
      return acc;
    }
    acc[child] = trimmed;
    return acc;
  }, {});

  const freizeitModules = getFreizeitModulesForDate(
    dateKey,
    timetableSchedule,
    timetableLessons,
  );
  const angebotModules = freizeitModules.length
    ? normalizeModuleAssignments(freizeitModules, entry.angebotModules, angebote)
    : {};
  const normalizedAngebote = freizeitModules.length
    ? flattenModuleAssignments(angebotModules)
    : angebote;

  return {
    angebote: normalizedAngebote,
    angebotModules,
    freizeitModules,
    angebotNotes,
    observations: normalizedObs,
    observationNotes: normalizedNotes,
    absentChildren: [...new Set(absentChildren)],
  };
};

const getWeekDays = (week, includeWeekend = false) => {
  const labels = includeWeekend ? [...WEEKDAY_LABELS, ...WEEKEND_LABELS] : WEEKDAY_LABELS;
  return labels.map((info) => {
    const date = new Date(week.startDate);
    date.setUTCDate(date.getUTCDate() + info.offset);
    const ymd = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
    return {
      ...info,
      dateKey: ymd,
      displayDate: formatDisplayDate(ymd),
    };
  });
};

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
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const addUtcDays = (date, days) => {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
};

const getDateRangeKeys = (startYmd, endYmd) => {
  const startDate = toUtcDate(startYmd);
  const endDate = toUtcDate(endYmd || startYmd);
  if (!startDate || !endDate) {
    return [];
  }
  const keys = [];
  const startTime = startDate.getTime();
  const endTime = endDate.getTime();
  const forward = startTime <= endTime;
  let cursor = forward ? startDate : endDate;
  const end = forward ? endDate : startDate;
  while (cursor <= end) {
    keys.push(formatYmd(cursor));
    cursor = addUtcDays(cursor, 1);
  }
  return keys;
};

const getDateRangeFromKeys = (keys) => {
  const sorted = Array.isArray(keys)
    ? keys.filter((key) => isValidYmd(key)).sort((a, b) => a.localeCompare(b))
    : [];
  if (!sorted.length) {
    return null;
  }
  return {
    startYmd: sorted[0],
    endYmd: sorted[sorted.length - 1],
  };
};

const getFreeDayDateKeys = (freeDays = []) => {
  const entries = Array.isArray(freeDays) ? freeDays : [];
  const keys = [];
  entries.forEach((entry) => {
    if (!entry) {
      return;
    }
    if (isSummerBreakEntry(entry)) {
      return;
    }
    const start = entry.start || entry.date || entry.startDate;
    const end = entry.end || entry.until || entry.endDate || start;
    getDateRangeKeys(start, end).forEach((key) => keys.push(key));
  });
  return keys;
};

const buildDaysIndex = (dateKeys, days) =>
  dateKeys.reduce((acc, key) => {
    acc[key] = days?.[key] || {};
    return acc;
  }, {});

const getVisibleWeekDays = (week, visibleDateKeys, freeDays, freeDayFilters) => {
  const visibleSet =
    Array.isArray(visibleDateKeys) && visibleDateKeys.length
      ? new Set(visibleDateKeys)
      : null;
  const showWeekend = freeDayFilters?.weekend ?? false;
  const showHolidays = freeDayFilters?.holidays ?? false;
  const days = getWeekDays(week, showWeekend);
  return days
    .map((item) => {
      const freeInfo = getFreeDayInfo(item.dateKey, freeDays);
      const holidayLabel = freeInfo?.type === 'holiday' && freeInfo.label ? freeInfo.label : null;
      return {
        ...item,
        freeInfo,
        holidayLabel,
        isWeekend: isWeekend(item.dateKey),
      };
    })
    .filter((item) => {
      if (visibleSet && !visibleSet.has(item.dateKey)) {
        return false;
      }
      const isHoliday = item.freeInfo?.type === 'holiday';
      const isWeekendDay = item.isWeekend;
      if (!isHoliday && !isWeekendDay) {
        return true;
      }
      if (isWeekendDay && showWeekend) {
        return true;
      }
      if (isHoliday && showHolidays) {
        return true;
      }
      return false;
    });
};

const getSortedDateKeys = (days) => {
  const keys = days ? Object.keys(days) : [];
  return keys.filter((key) => isValidYmd(key)).sort((a, b) => a.localeCompare(b));
};

const getMonthKey = (ymd) => (typeof ymd === 'string' ? ymd.slice(0, 7) : '');

const formatMonthLabel = (monthKey) => {
  const [year, month] = monthKey.split('-').map(Number);
  if (!year || !month) {
    return monthKey;
  }
  const date = new Date(Date.UTC(year, month - 1, 1));
  if (Number.isNaN(date.getTime())) {
    return monthKey;
  }
  return date.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
};

const getMonthRange = (monthKey) => {
  const [year, month] = monthKey.split('-').map(Number);
  if (!year || !month) {
    return null;
  }
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 0));
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return null;
  }
  const startYmd = `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, '0')}-${String(start.getUTCDate()).padStart(2, '0')}`;
  const endYmd = `${end.getUTCFullYear()}-${String(end.getUTCMonth() + 1).padStart(2, '0')}-${String(end.getUTCDate()).padStart(2, '0')}`;
  return { startYmd, endYmd };
};

const buildPillList = (values) => {
  const list = createEl('div', {
    className: 'weekly-table__pill-list',
  });
  if (!values.length) {
    list.append(
      createEl('span', {
        className: 'text-muted small',
        text: '—',
      }),
    );
    return list;
  }
  values.forEach((value) => {
    list.append(
      createEl('span', {
        className: 'badge rounded-pill text-bg-secondary weekly-table__pill',
        text: value,
      }),
    );
  });
  return list;
};

const buildModuleOfferList = (modules, assignments, extras = []) => {
  const container = createEl('div', { className: 'weekly-table__module-list' });
  const safeModules = Array.isArray(modules) ? modules : [];
  const safeAssignments =
    assignments && typeof assignments === 'object' ? assignments : {};

  if (!safeModules.length) {
    container.append(
      buildPillList(flattenModuleAssignments(safeAssignments, extras)),
    );
    return container;
  }

  safeModules.forEach((module) => {
    const moduleOffers = Array.isArray(safeAssignments[module.id]) ? safeAssignments[module.id] : [];
    // Skip modules without offers
    if (moduleOffers.length === 0) {
      return;
    }

    const moduleWrapper = createEl('div', { className: 'weekly-table__module' });
    const label = module.periodLabel || module.descriptor || module.tabLabel || 'Freizeit';
    moduleWrapper.append(
      createEl('div', {
        className: 'text-muted small weekly-table__module-label',
        text: label,
      }),
      buildPillList(moduleOffers),
    );
    container.append(moduleWrapper);
  });

  return container;
};

const buildOfferNote = (note) =>
  createEl('p', {
    className: 'weekly-table__offer-note text-muted small mb-0',
    text: note,
  });

const buildOfferCell = ({ modules, assignments, extras, note }) => {
  const container = createEl('div', { className: 'weekly-table__offer-cell' });
  container.append(buildModuleOfferList(modules, assignments, extras));
  if (note) {
    container.append(buildOfferNote(note));
  }
  return container;
};

const buildObservationCatalogGroupMap = (catalog) => {
  const entries = Array.isArray(catalog) ? catalog : [];
  const groups = new Map();

  entries.forEach((entry) => {
    const text =
      typeof entry === 'string'
        ? entry.trim()
        : typeof entry?.text === 'string'
          ? entry.text.trim()
          : '';
    if (!text) {
      return;
    }
    const normalizedGroups = normalizeObservationGroups(entry?.groups || []);
    groups.set(normalizeObservationKey(text), normalizedGroups);
  });

  return groups;
};

const getOrderedObservationGroups = (groups) => {
  const normalized = normalizeObservationGroups(groups);
  if (!normalized.length) {
    return [];
  }
  if (!normalized.includes('SCHWARZ')) {
    return normalized;
  }
  return ['SCHWARZ', ...normalized.filter((group) => group !== 'SCHWARZ')];
};

const buildObservationGroupDots = (groups, observationGroups) => {
  const ordered = getOrderedObservationGroups(groups);
  if (!ordered.length) {
    return null;
  }

  const maxDots = 3;
  const showOverflow = ordered.length > maxDots;
  const visible = showOverflow ? ordered.slice(0, maxDots - 1) : ordered;

  const wrapper = createEl('span', { className: 'observation-group-dots' });

  visible.forEach((group) => {
    const color =
      observationGroups && observationGroups[group]?.color
        ? observationGroups[group].color
        : '#6c757d';
    wrapper.appendChild(
      createEl('span', {
        className: 'observation-group-dot',
        attrs: { style: `--group-color: ${color};`, 'aria-hidden': 'true' },
      }),
    );
  });

  if (showOverflow) {
    wrapper.appendChild(
      createEl('span', {
        className: 'observation-group-dot observation-group-dot--overflow',
        text: '+',
        attrs: { 'aria-hidden': 'true' },
      }),
    );
  }

  return wrapper;
};

const buildObservationList = (values, getGroupsForLabel, observationGroups) => {
  const list = createEl('div', {
    className: 'weekly-table__observation-list',
  });
  if (!values.length) {
    list.append(
      createEl('span', {
        className: 'text-muted small',
        text: '—',
      }),
    );
    return list;
  }

  values.forEach((value, index) => {
    const groups = typeof getGroupsForLabel === 'function' ? getGroupsForLabel(value) : [];
    const dots = buildObservationGroupDots(groups, observationGroups);
    const item = createEl('span', { className: 'weekly-table__observation-item' });
    if (dots) {
      item.append(dots);
    }
    const isLast = index === values.length - 1;
    const textValue = isLast ? value : `${value},`;
    item.append(
      createEl('span', { className: 'weekly-table__observation-text', text: textValue }),
    );
    list.append(item);
  });

  return list;
};

const buildObservationNoteIcon = () =>
  createEl('span', {
    className: 'weekly-table__note-icon',
    text: '📝',
    attrs: {
      title: 'Notizen vorhanden',
      'aria-label': 'Notizen vorhanden',
    },
  });

const buildAbsenceBadge = () =>
  createEl('span', {
    className:
      'badge text-bg-light text-secondary observation-absent-badge weekly-table__absence-badge',
    text: 'Abwesend',
  });

const buildCellContent = ({
  content,
  child,
  dateKey,
  displayDate,
  isEditMode,
  onEditCell,
  isFreeDay,
  isAbsent,
  editLabel,
  editPayload,
}) => {
  const wrapper = createEl('div', { className: 'weekly-table__cell-content' });
  if (content) {
    wrapper.append(content);
  }

  const canEdit =
    isEditMode &&
    typeof onEditCell === 'function' &&
    dateKey &&
    !isFreeDay &&
    !isAbsent &&
    (editPayload || child);
  if (canEdit) {
    wrapper.classList.add('weekly-table__cell-content--editable');
    const label = editLabel || child;
    const payload =
      editPayload ||
      (child
        ? {
            child,
            dateKey,
          }
        : null);
    const editButton = createEl('button', {
      className: 'btn btn-light btn-sm weekly-table__edit-button',
      attrs: {
        type: 'button',
        'aria-label': `Bearbeiten: ${label} – ${displayDate || dateKey}`,
      },
      text: '✎',
    });
    editButton.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (payload) {
        onEditCell(payload);
      }
    });
    wrapper.append(editButton);
  }

  return wrapper;
};

const buildWeeklyTable = ({
  week,
  days,
  children,
  getGroupsForLabel,
  observationGroups,
  onEditCell,
  onOpenFilters,
  onToggleEdit,
  isEditMode,
  freeDays,
  timetableSchedule,
  timetableLessons,
  visibleDateKeys,
  typeFilters,
  freeDayFilters,
}) => {
  const table = createEl('table', {
    className: 'table table-bordered table-sm align-middle weekly-table',
  });
  const thead = createEl('thead');
  const headerRow = createEl('tr');
  const cornerCell = createEl('th', { scope: 'col', className: 'weekly-table__corner' });
  const cornerControls = createEl('div', { className: 'weekly-table__corner-controls' });
  const filterButton = createEl('button', {
    className: 'btn btn-light btn-sm weekly-table__corner-button weekly-table__filter-button',
    attrs: { type: 'button', 'aria-label': 'Filter öffnen' },
    text: '⚙️',
  });
  filterButton.addEventListener('click', () => {
    if (typeof onOpenFilters === 'function') {
      onOpenFilters();
    }
  });
  const editButton = createEl('button', {
    className: [
      'btn btn-light btn-sm weekly-table__corner-button weekly-table__edit-toggle',
      isEditMode ? 'is-active' : '',
    ]
      .filter(Boolean)
      .join(' '),
    attrs: {
      type: 'button',
      'aria-label': isEditMode ? 'Bearbeiten deaktivieren' : 'Bearbeiten aktivieren',
      'aria-pressed': isEditMode ? 'true' : 'false',
    },
    text: '✎',
  });
  editButton.addEventListener('click', () => {
    if (typeof onToggleEdit === 'function') {
      onToggleEdit();
    }
  });
  cornerControls.append(filterButton, editButton);
  cornerCell.append(cornerControls);
  headerRow.append(cornerCell);
  const weekDays = getVisibleWeekDays(
    week,
    visibleDateKeys,
    freeDays,
    freeDayFilters,
  );
  weekDays.forEach((item) => {
    const cell = createEl('th', { scope: 'col' });
    const headerContent = createEl('div', { className: 'd-flex flex-column gap-1' });
    headerContent.append(
      createEl('div', { className: 'fw-semibold', text: item.label }),
      createEl('div', { className: 'text-muted small', text: item.displayDate }),
    );
    if (item.holidayLabel) {
      headerContent.append(
        createEl('span', {
          className: 'badge weekly-table__holiday-badge',
          text: item.holidayLabel,
        }),
      );
    }
    cell.append(headerContent);
    headerRow.append(cell);
  });
  thead.append(headerRow);

  const tbody = createEl('tbody');

  const showOffers = typeFilters?.offers !== false;
  const showObservations = typeFilters?.observations !== false;
  const showAbsence = typeFilters?.absence !== false;

  const angeboteRow = createEl('tr', {
    className: 'weekly-table__offers-row',
  });
  angeboteRow.append(
    createEl('th', { scope: 'row', className: 'text-nowrap', text: 'Angebote' }),
  );
  const dayEntryByDateKey = new Map();
  const getDayEntry = (dateKey) => {
    if (!dayEntryByDateKey.has(dateKey)) {
      dayEntryByDateKey.set(
        dateKey,
        normalizeDayEntry(days, dateKey, timetableSchedule, timetableLessons),
      );
    }
    return dayEntryByDateKey.get(dateKey);
  };
  weekDays.forEach((item) => {
    const dayEntry = getDayEntry(item.dateKey);
    const freeInfo = item.freeInfo;
    angeboteRow.append(
      createEl('td', {
        className: freeInfo ? 'weekly-table__cell--free-day' : '',
        children: [
          buildCellContent({
            content: showOffers
              ? buildOfferCell({
                  modules: dayEntry.freizeitModules,
                  assignments: dayEntry.angebotModules,
                  extras: dayEntry.angebote,
                  note: dayEntry.angebotNotes,
                })
              : null,
            dateKey: item.dateKey,
            displayDate: item.displayDate,
            isEditMode,
            onEditCell,
            isFreeDay: Boolean(freeInfo),
            editLabel: 'Angebote',
            editPayload: {
              type: 'offers',
              dateKey: item.dateKey,
            },
          }),
        ],
      }),
    );
  });
  if (showOffers) {
    tbody.append(angeboteRow);
  }

  const sortedChildren = [...children].sort((a, b) => a.localeCompare(b, 'de'));

  if (!showObservations && !showAbsence) {
    table.append(thead, tbody);
    return table;
  }

  sortedChildren.forEach((child) => {
    const row = createEl('tr');
    row.append(createEl('th', { scope: 'row', className: 'text-nowrap', text: child }));
    weekDays.forEach((item) => {
      const dayEntry = getDayEntry(item.dateKey);
      const obs = dayEntry.observations[child] || [];
      const note = dayEntry.observationNotes?.[child] || '';
      const freeInfo = item.freeInfo;
      const isAbsent = dayEntry.absentChildren.includes(child);
      const cellClasses = [
        freeInfo ? 'weekly-table__cell--free-day' : '',
        isAbsent ? 'weekly-table__cell--absent' : '',
      ]
        .filter(Boolean)
        .join(' ');
      const bodyChildren = [];
      if (showAbsence && isAbsent) {
        bodyChildren.push(buildAbsenceBadge());
      }
      if (note) {
        bodyChildren.push(buildObservationNoteIcon());
      }
      if (showObservations) {
        bodyChildren.push(buildObservationList(obs, getGroupsForLabel, observationGroups));
      }
      if (!bodyChildren.length) {
        bodyChildren.push(
          createEl('span', {
            className: 'text-muted small',
            text: '—',
          }),
        );
      }
      const cellBody = createEl('div', {
        className: 'weekly-table__cell-body',
        children: bodyChildren,
      });
      row.append(
        createEl('td', {
          className: cellClasses,
          children: [
            buildCellContent({
              content: cellBody,
              child,
              dateKey: item.dateKey,
              displayDate: item.displayDate,
              isEditMode,
              onEditCell,
              isFreeDay: Boolean(freeInfo),
              isAbsent,
              editPayload: {
                type: 'observations',
                child,
                dateKey: item.dateKey,
              },
            }),
          ],
        }),
      );
    });
    tbody.append(row);
  });

  table.append(thead, tbody);
  return table;
};

const buildSelectGroup = ({ id, label }) => {
  const select = createEl('select', {
    className: 'form-select',
    attrs: { id },
  });
  const wrapper = createEl('div', {
    className: 'weekly-table__control',
  });
  const labelEl = createEl('label', { className: 'form-label mb-1', attrs: { for: id }, text: label });
  wrapper.append(labelEl, select);
  return { wrapper, select };
};

const buildTypeFilterGroup = ({ id, label, options }) => {
  const wrapper = createEl('div', {
    className: 'weekly-table__control',
  });
  const labelEl = createEl('span', { className: 'form-label mb-1', text: label });
  const optionsWrapper = createEl('div', {
    className: 'weekly-table__type-options',
    attrs: { id },
  });
  const inputs = new Map();
  options.forEach((option) => {
    const optionId = `${id}-${option.value}`;
    const input = createEl('input', {
      className: 'form-check-input',
      attrs: { type: 'checkbox', id: optionId, checked: option.checked ? 'checked' : null },
    });
    const labelNode = createEl('label', {
      className: 'form-check-label',
      attrs: { for: optionId },
      text: option.label,
    });
    const optionWrapper = createEl('div', {
      className: 'form-check form-check-inline weekly-table__type-option',
      children: [input, labelNode],
    });
    optionsWrapper.append(optionWrapper);
    inputs.set(option.value, input);
  });
  wrapper.append(labelEl, optionsWrapper);
  return { wrapper, inputs };
};

export const createWeeklyTableView = ({
  days = {},
  children = [],
  observationCatalog = [],
  observationGroups = {},
  freeDays = [],
  timetableSchedule = {},
  timetableLessons = [],
} = {}) => {
  let schoolYears = getSchoolWeeks(days);
  let selectedYear = schoolYears.length ? schoolYears[schoolYears.length - 1].label : null;
  let selectedWeekId = selectedYear ? getLatestWeekForYear(schoolYears, selectedYear)?.id : null;
  let currentDays = days || {};
  let currentChildren = Array.isArray(children) ? [...children] : [];
  let currentObservationCatalog = Array.isArray(observationCatalog) ? [...observationCatalog] : [];
  let currentObservationGroups = observationGroups || {};
  let currentFreeDays = Array.isArray(freeDays) ? [...freeDays] : [];
  let currentTimetableSchedule = timetableSchedule || {};
  let currentTimetableLessons = Array.isArray(timetableLessons) ? [...timetableLessons] : [];
  let observationGroupMap = buildObservationCatalogGroupMap(currentObservationCatalog);
  let isEditMode = false;
  let selectedTimeFilter = 'week';
  let selectedDay = null;
  let selectedMonth = null;
  let selectedChild = 'all';
  let selectableDateKeys = [];
  let typeFilters = {
    observations: true,
    offers: true,
    absence: true,
  };
  let freeDayFilters = {
    weekend: false,
    holidays: true,
  };
  let daySelectionFilters = {
    working: true,
    holidays: true,
  };
  const getGroupsForLabel = (label) =>
    observationGroupMap.get(normalizeObservationKey(label)) || [];

  const overlay = createEl('div', {
    className: 'weekly-table-overlay',
    attrs: { 'aria-hidden': 'true' },
  });
  const panel = createEl('div', { className: 'weekly-table-overlay__panel' });
  const header = createEl('div', { className: 'weekly-table-overlay__header' });
  const title = createEl('h3', { className: 'h4 mb-0', text: UI_LABELS.weeklyTable });
  const closeButton = createEl('button', {
    className: 'btn-close weekly-table-overlay__close',
    attrs: { type: 'button', 'aria-label': 'Schließen' },
  });
  header.append(title, closeButton);

  const content = createEl('div', { className: 'weekly-table-overlay__content' });
  const filterOverlay = createEl('div', {
    className: 'weekly-table-filter-overlay',
    attrs: { 'aria-hidden': 'true' },
  });
  const filterPanel = createEl('div', { className: 'weekly-table-filter-overlay__panel' });
  const filterHeader = createEl('div', { className: 'weekly-table-filter-overlay__header' });
  const filterTitle = createEl('h3', { className: 'h4 mb-0', text: 'Filter' });
  const filterCloseButton = createEl('button', {
    className: 'btn-close weekly-table-filter-overlay__close',
    attrs: { type: 'button', 'aria-label': 'Schließen' },
  });
  filterHeader.append(filterTitle, filterCloseButton);
  const controls = createEl('div', {
    className: 'weekly-table__controls',
  });
  const filterContent = createEl('div', { className: 'weekly-table-filter-overlay__content' });
  const timeSelectGroup = buildSelectGroup({
    id: 'weekly-table-time',
    label: 'Zeit',
  });
  const yearSelectGroup = buildSelectGroup({
    id: 'weekly-table-year',
    label: 'Schuljahr wählen',
  });
  const weekSelectGroup = buildSelectGroup({
    id: 'weekly-table-week',
    label: 'Schulwoche wählen',
  });
  const daySelectGroup = buildSelectGroup({
    id: 'weekly-table-day',
    label: 'Tag wählen',
  });
  const monthSelectGroup = buildSelectGroup({
    id: 'weekly-table-month',
    label: 'Monat wählen',
  });
  const childSelectGroup = buildSelectGroup({
    id: 'weekly-table-child',
    label: 'Kind',
  });
  const typeFilterGroup = buildTypeFilterGroup({
    id: 'weekly-table-type',
    label: 'Art',
    options: [
      { value: 'observations', label: 'Beobachtungen', checked: true },
      { value: 'offers', label: 'Angebote', checked: true },
      { value: 'absence', label: 'Abwesenheit', checked: true },
    ],
  });
  controls.append(
    timeSelectGroup.wrapper,
    yearSelectGroup.wrapper,
    weekSelectGroup.wrapper,
    daySelectGroup.wrapper,
    monthSelectGroup.wrapper,
    childSelectGroup.wrapper,
    typeFilterGroup.wrapper,
  );
  filterContent.append(controls);
  filterPanel.append(filterHeader, filterContent);
  filterOverlay.append(filterPanel);

  const infoText = createEl('div', { className: 'text-muted small' });
  const pdfButton = createEl('button', {
    className: 'btn btn-outline-primary d-inline-flex align-items-center gap-2 weekly-table__pdf',
    attrs: { type: 'button' },
    children: [createEl('span', { text: '📄' }), createEl('span', { text: 'Generuj PDF...' })],
  });
  const infoRow = createEl('div', {
    className: 'weekly-table__info-row d-flex align-items-center justify-content-between gap-2 flex-wrap',
    children: [infoText, pdfButton],
  });
  const tableContainer = createEl('div', { className: 'weekly-table__container' });

  content.append(infoRow, tableContainer);
  panel.append(header, content);
  overlay.append(panel, filterOverlay);

  const isOpen = () => overlay.classList.contains('is-open');

  const findSelectedYear = () => schoolYears.find((item) => item.label === selectedYear);

  const findSelectedWeek = () => {
    const year = findSelectedYear();
    if (!year || !year.weeks.length) {
      return null;
    }
    const match = year.weeks.find((week) => week.id === selectedWeekId);
    if (match) {
      return match;
    }
    return year.weeks[year.weeks.length - 1];
  };

  const getAllWeeks = () => schoolYears.flatMap((year) => year.weeks || []);

  const findWeekForDate = (dateKey) => {
    if (!dateKey) {
      return null;
    }
    const weeks = getAllWeeks();
    return (
      weeks.find((week) => week.startYmd <= dateKey && week.endYmd >= dateKey) || null
    );
  };

  const getWeeksForMonth = (monthKey) => {
    const range = getMonthRange(monthKey);
    if (!range) {
      return [];
    }
    const weeks = getAllWeeks();
    return weeks.filter(
      (week) => week.endYmd >= range.startYmd && week.startYmd <= range.endYmd,
    );
  };

  const getSelectableDateKeys = () => {
    const baseKeys = getSortedDateKeys(currentDays);
    const includeHolidays = daySelectionFilters.holidays || freeDayFilters.holidays;
    const holidayKeys = includeHolidays ? getFreeDayDateKeys(currentFreeDays) : [];
    const keySet = new Set([...baseKeys, ...holidayKeys].filter((key) => isValidYmd(key)));

    if (daySelectionFilters.working) {
      const range = getDateRangeFromKeys([...keySet]);
      if (range) {
        const startDate = toUtcDate(range.startYmd);
        const endDate = toUtcDate(range.endYmd);
        if (startDate && endDate) {
          let cursor = startDate;
          while (cursor <= endDate) {
            const ymd = formatYmd(cursor);
            if (!keySet.has(ymd)) {
              const freeInfo = getFreeDayInfo(ymd, currentFreeDays);
              if (!isWeekend(ymd) && freeInfo?.type !== 'holiday') {
                keySet.add(ymd);
              }
            }
            cursor = addUtcDays(cursor, 1);
          }
        }
      }
    }

    return [...keySet].sort((a, b) => a.localeCompare(b));
  };

  const renderTimeOptions = () => {
    const options = [
      { value: 'day', label: 'Tag' },
      { value: 'week', label: 'Woche' },
      { value: 'month', label: 'Monat' },
      { value: 'year', label: 'Jahr' },
    ];
    if (!options.some((option) => option.value === selectedTimeFilter)) {
      selectedTimeFilter = 'week';
    }
    clearElement(timeSelectGroup.select);
    options.forEach((option) => {
      timeSelectGroup.select.append(
        createEl('option', { attrs: { value: option.value }, text: option.label }),
      );
    });
    timeSelectGroup.select.value = selectedTimeFilter;
  };

  const renderYearOptions = () => {
    clearElement(yearSelectGroup.select);
    schoolYears.forEach((year) => {
      yearSelectGroup.select.append(
        createEl('option', { attrs: { value: year.label }, text: year.label }),
      );
    });
    const hasMultipleYears = schoolYears.length > 1;
    if (selectedYear && schoolYears.some((year) => year.label === selectedYear)) {
      yearSelectGroup.select.value = selectedYear;
    } else if (schoolYears.length) {
      yearSelectGroup.select.value = schoolYears[schoolYears.length - 1].label;
      selectedYear = yearSelectGroup.select.value;
    } else {
      selectedYear = null;
    }
    return hasMultipleYears;
  };

  const renderWeekOptions = () => {
    const desiredWeekId = selectedWeekId || weekSelectGroup.select.value || null;
    clearElement(weekSelectGroup.select);
    const year = findSelectedYear();
    if (!year || !year.weeks.length) {
      weekSelectGroup.select.append(
        createEl('option', { value: '', text: 'Keine Wochen verfügbar' }),
      );
      weekSelectGroup.select.disabled = true;
      selectedWeekId = null;
      return;
    }
    weekSelectGroup.select.disabled = false;
    year.weeks.forEach((week) => {
      const optionText = `${week.label} (${formatDisplayDate(week.startYmd)} – ${formatDisplayDate(week.endYmd)})`;
      weekSelectGroup.select.append(
        createEl('option', { attrs: { value: week.id }, text: optionText }),
      );
    });
    if (desiredWeekId && year.weeks.some((week) => week.id === desiredWeekId)) {
      selectedWeekId = desiredWeekId;
      weekSelectGroup.select.value = selectedWeekId;
    } else {
      const latest = getLatestWeekForYear(schoolYears, selectedYear);
      selectedWeekId = latest ? latest.id : year.weeks[0].id;
      weekSelectGroup.select.value = selectedWeekId || '';
    }
  };

  const renderDayOptions = () => {
    const dateKeys = selectableDateKeys;
    clearElement(daySelectGroup.select);
    dateKeys.forEach((dateKey) => {
      daySelectGroup.select.append(
        createEl('option', { attrs: { value: dateKey }, text: formatDisplayDate(dateKey) }),
      );
    });
    if (!dateKeys.length) {
      daySelectGroup.select.append(
        createEl('option', { attrs: { value: '' }, text: 'Keine Tage verfügbar' }),
      );
      daySelectGroup.select.disabled = true;
      selectedDay = null;
      return;
    }
    daySelectGroup.select.disabled = false;
    if (selectedDay && dateKeys.includes(selectedDay)) {
      daySelectGroup.select.value = selectedDay;
    } else {
      selectedDay = dateKeys[dateKeys.length - 1];
      daySelectGroup.select.value = selectedDay;
    }
  };

  const renderMonthOptions = () => {
    const dateKeys = selectableDateKeys;
    const monthKeys = [...new Set(dateKeys.map((key) => getMonthKey(key)).filter(Boolean))];
    clearElement(monthSelectGroup.select);
    monthKeys.forEach((monthKey) => {
      monthSelectGroup.select.append(
        createEl('option', { attrs: { value: monthKey }, text: formatMonthLabel(monthKey) }),
      );
    });
    if (!monthKeys.length) {
      monthSelectGroup.select.append(
        createEl('option', { attrs: { value: '' }, text: 'Keine Monate verfügbar' }),
      );
      monthSelectGroup.select.disabled = true;
      selectedMonth = null;
      return;
    }
    monthSelectGroup.select.disabled = false;
    if (selectedMonth && monthKeys.includes(selectedMonth)) {
      monthSelectGroup.select.value = selectedMonth;
    } else {
      selectedMonth = monthKeys[monthKeys.length - 1];
      monthSelectGroup.select.value = selectedMonth;
    }
  };

  const renderChildOptions = () => {
    clearElement(childSelectGroup.select);
    childSelectGroup.select.append(
      createEl('option', { attrs: { value: 'all' }, text: 'Alle Kinder' }),
    );
    const sortedChildren = [...currentChildren].sort((a, b) => a.localeCompare(b, 'de'));
    sortedChildren.forEach((child) => {
      childSelectGroup.select.append(
        createEl('option', { attrs: { value: child }, text: child }),
      );
    });
    if (!selectedChild) {
      selectedChild = 'all';
    }
    childSelectGroup.select.value = selectedChild;
  };

  const getInfoLabel = () => {
    if (selectedTimeFilter === 'day') {
      if (!selectedDay) {
        return { text: 'Kein Tag mit Daten vorhanden.', muted: true };
      }
      return { text: formatDisplayDate(selectedDay), muted: false };
    }
    if (selectedTimeFilter === 'month') {
      if (!selectedMonth) {
        return { text: 'Kein Monat mit Daten vorhanden.', muted: true };
      }
      return { text: formatMonthLabel(selectedMonth), muted: false };
    }
    if (selectedTimeFilter === 'year') {
      if (!selectedYear) {
        return { text: 'Kein Schuljahr mit Daten vorhanden.', muted: true };
      }
      return { text: selectedYear, muted: false };
    }

    const week = findSelectedWeek();
    if (!week) {
      return { text: 'Keine Wochen mit Daten vorhanden.', muted: true };
    }
    return {
      text: `${week.label} · ${formatDisplayDate(week.startYmd)} – ${formatDisplayDate(week.endYmd)}`,
      muted: false,
    };
  };

  const renderInfo = () => {
    clearElement(infoText);
    const info = getInfoLabel();
    infoText.append(
      createEl('span', {
        className: info.muted ? 'text-muted' : '',
        text: info.text,
      }),
    );
  };

  const renderTable = () => {
    clearElement(tableContainer);
    const visibleChildren =
      selectedChild && selectedChild !== 'all'
        ? [selectedChild]
        : currentChildren;
    const sharedProps = {
      days: currentDays,
      children: visibleChildren,
      getGroupsForLabel,
      observationGroups: currentObservationGroups,
      onEditCell: ({ child, dateKey }) => {
        if (!dateKey) {
          return;
        }
        const safeDate = dateKey;
        setSelectedDate(safeDate);

        if (child) {
          window.setTimeout(() => {
            window.dispatchEvent(
              new CustomEvent('freilog:observation-open', {
                detail: { child, focusNote: true },
              }),
            );
          }, 120);
          return;
        }
        window.setTimeout(() => {
          window.dispatchEvent(
            new CustomEvent('freilog:angebot-open', {
              detail: { dateKey },
            }),
          );
        }, 120);
      },
      isEditMode,
      freeDays: currentFreeDays,
      timetableSchedule: currentTimetableSchedule,
      timetableLessons: currentTimetableLessons,
      typeFilters,
      freeDayFilters,
      onOpenFilters: () => {
        openFilterOverlay();
      },
      onToggleEdit: () => {
        setEditMode(!isEditMode);
      },
    };

    const hasVisibleDays = (week, visibleDateKeys = null) =>
      getVisibleWeekDays(week, visibleDateKeys, currentFreeDays, freeDayFilters).length > 0;

    const buildWeekGroup = (week, visibleDateKeys, showHeading = false) => {
      if (!hasVisibleDays(week, visibleDateKeys)) {
        return null;
      }
      const group = createEl('div', { className: 'weekly-table__week-group' });
      if (showHeading) {
        group.append(
          createEl('div', {
            className: 'fw-semibold weekly-table__week-heading',
            text: `${week.label} (${formatDisplayDate(week.startYmd)} – ${formatDisplayDate(week.endYmd)})`,
          }),
        );
      }
      group.append(
        buildWeeklyTable({
          week,
          visibleDateKeys,
          ...sharedProps,
        }),
      );
      return group;
    };

    const tableGroups = [];

    if (selectedTimeFilter === 'day') {
      const week = selectedDay ? findWeekForDate(selectedDay) : null;
      if (week) {
        const group = buildWeekGroup(week, [selectedDay]);
        if (group) {
          tableGroups.push(group);
        }
      }
    } else if (selectedTimeFilter === 'month') {
      const weeks = selectedMonth ? getWeeksForMonth(selectedMonth) : [];
      weeks.forEach((week) => {
        const visible = getVisibleWeekDays(
          week,
          null,
          currentFreeDays,
          freeDayFilters,
        )
          .map((day) => day.dateKey)
          .filter((dateKey) => getMonthKey(dateKey) === selectedMonth);
        if (visible.length) {
          const group = buildWeekGroup(week, visible, true);
          if (group) {
            tableGroups.push(group);
          }
        }
      });
    } else if (selectedTimeFilter === 'year') {
      const year = findSelectedYear();
      if (year && year.weeks.length) {
        year.weeks.forEach((week) => {
          const group = buildWeekGroup(week, null, true);
          if (group) {
            tableGroups.push(group);
          }
        });
      }
    } else {
      const week = findSelectedWeek();
      if (week) {
        const group = buildWeekGroup(week);
        if (group) {
          tableGroups.push(group);
        }
      }
    }

    if (!tableGroups.length) {
      tableContainer.append(
        createEl('div', {
          className: 'alert alert-light border',
          text: 'Keine Daten für den gewählten Zeitraum vorhanden.',
        }),
      );
      return;
    }

    tableGroups.forEach((group) => tableContainer.append(group));
  };

  const render = () => {
    selectableDateKeys = getSelectableDateKeys();
    schoolYears = getSchoolWeeks(buildDaysIndex(selectableDateKeys, currentDays));
    renderTimeOptions();
    const hasMultipleYears = renderYearOptions();
    renderWeekOptions();
    renderDayOptions();
    renderMonthOptions();
    renderChildOptions();
    selectedWeekId = weekSelectGroup.select.value || selectedWeekId;

    const showWeekControls = selectedTimeFilter === 'week';
    const showYearControls = selectedTimeFilter === 'week' || selectedTimeFilter === 'year';
    const showDayControls = selectedTimeFilter === 'day';
    const showMonthControls = selectedTimeFilter === 'month';

    yearSelectGroup.wrapper.classList.toggle('d-none', !showYearControls || !hasMultipleYears);
    weekSelectGroup.wrapper.classList.toggle('d-none', !showWeekControls);
    daySelectGroup.wrapper.classList.toggle('d-none', !showDayControls);
    monthSelectGroup.wrapper.classList.toggle('d-none', !showMonthControls);
    renderInfo();
    renderTable();
  };

  timeSelectGroup.select.addEventListener('change', (event) => {
    selectedTimeFilter = event.target.value || 'week';
    render();
  });

  yearSelectGroup.select.addEventListener('change', (event) => {
    selectedYear = event.target.value || null;
    const latest = selectedYear ? getLatestWeekForYear(schoolYears, selectedYear) : null;
    selectedWeekId = latest ? latest.id : null;
    render();
  });

  weekSelectGroup.select.addEventListener('change', (event) => {
    selectedWeekId = event.target.value || null;
    render();
  });

  daySelectGroup.select.addEventListener('change', (event) => {
    selectedDay = event.target.value || null;
    render();
  });

  monthSelectGroup.select.addEventListener('change', (event) => {
    selectedMonth = event.target.value || null;
    render();
  });

  childSelectGroup.select.addEventListener('change', (event) => {
    selectedChild = event.target.value || 'all';
    renderTable();
  });

  typeFilterGroup.inputs.forEach((input, key) => {
    input.addEventListener('change', () => {
      typeFilters = {
        ...typeFilters,
        [key]: input.checked,
      };
      renderTable();
    });
  });

  const setEditMode = (nextValue) => {
    isEditMode = Boolean(nextValue);
    renderTable();
  };

  const openFilterOverlay = () => {
    filterOverlay.classList.add('is-open');
    filterOverlay.setAttribute('aria-hidden', 'false');
  };

  const closeFilterOverlay = () => {
    filterOverlay.classList.remove('is-open');
    filterOverlay.setAttribute('aria-hidden', 'true');
  };

  const open = () => {
    if (!schoolYears.length) {
      render();
    }
    overlay.classList.add('is-open');
    overlay.setAttribute('aria-hidden', 'false');
    document.body.classList.add('weekly-table-overlay-open');
    closeFilterOverlay();
    render();
  };

  const close = () => {
    overlay.classList.remove('is-open');
    overlay.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('weekly-table-overlay-open');
    closeFilterOverlay();
  };

  closeButton.addEventListener('click', () => {
    close();
  });

  filterCloseButton.addEventListener('click', () => {
    closeFilterOverlay();
  });

  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) {
      close();
    }
  });

  filterOverlay.addEventListener('click', (event) => {
    if (event.target === filterOverlay) {
      closeFilterOverlay();
    }
  });

  const escapeHtml = (value) =>
    String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

  const buildPrintHtml = () => {
    const info = getInfoLabel();
    const visibleChildren =
      selectedChild && selectedChild !== 'all'
        ? [selectedChild]
        : currentChildren;
    const sortedChildren = [...visibleChildren].sort((a, b) => a.localeCompare(b, 'de'));
    const showOffers = typeFilters?.offers !== false;
    const showObservations = typeFilters?.observations !== false;
    const showAbsence = typeFilters?.absence !== false;
    const timeFilterLabels = {
      day: 'Tag',
      week: 'Woche',
      month: 'Monat',
      year: 'Jahr',
    };
    const activeTypes = [
      showObservations ? 'Beobachtungen' : null,
      showOffers ? 'Angebote' : null,
      showAbsence ? 'Abwesenheit' : null,
    ]
      .filter(Boolean)
      .join(', ');
    const activeFreeDays = [
      freeDayFilters.holidays ? 'Ferien' : null,
      freeDayFilters.weekend ? 'Wochenenden' : null,
    ]
      .filter(Boolean)
      .join(', ');

    const metaItems = [
      `Zeitraum: ${timeFilterLabels[selectedTimeFilter] || 'Woche'}`,
      `Kind: ${selectedChild && selectedChild !== 'all' ? selectedChild : 'Alle Kinder'}`,
      `Art: ${activeTypes || 'Keine'}`,
    ];
    if (activeFreeDays) {
      metaItems.push(`Freie Tage: ${activeFreeDays}`);
    }

    const weekGroups = [];
    const addWeekGroup = (week, visibleDateKeys, includeHeading) => {
      const days = getVisibleWeekDays(week, visibleDateKeys, currentFreeDays, freeDayFilters);
      if (!days.length) {
        return;
      }
      weekGroups.push({
        heading: includeHeading
          ? `${week.label} (${formatDisplayDate(week.startYmd)} – ${formatDisplayDate(week.endYmd)})`
          : null,
        days,
      });
    };

    if (selectedTimeFilter === 'day') {
      const week = selectedDay ? findWeekForDate(selectedDay) : null;
      if (week) {
        addWeekGroup(week, [selectedDay], false);
      }
    } else if (selectedTimeFilter === 'month') {
      const weeks = selectedMonth ? getWeeksForMonth(selectedMonth) : [];
      weeks.forEach((week) => {
        const visible = getVisibleWeekDays(week, null, currentFreeDays, freeDayFilters)
          .map((day) => day.dateKey)
          .filter((dateKey) => getMonthKey(dateKey) === selectedMonth);
        if (visible.length) {
          addWeekGroup(week, visible, true);
        }
      });
    } else if (selectedTimeFilter === 'year') {
      const year = findSelectedYear();
      if (year && year.weeks.length) {
        year.weeks.forEach((week) => {
          addWeekGroup(week, null, true);
        });
      }
    } else {
      const week = findSelectedWeek();
      if (week) {
        addWeekGroup(week, null, false);
      }
    }

    const groupsHtml = weekGroups.length
      ? weekGroups
          .map((group) => {
            const rows = group.days
              .map((day) => {
                const dayEntry = normalizeDayEntry(
                  currentDays,
                  day.dateKey,
                  currentTimetableSchedule,
                  currentTimetableLessons,
                );
                const holidayBadge = day.holidayLabel
                  ? ` <span class="badge">${escapeHtml(day.holidayLabel)}</span>`
                  : '';
                const dateCell = `${escapeHtml(day.label)} · ${escapeHtml(day.displayDate)}${holidayBadge}`;

                const offerLines = [];
                if (showOffers) {
                  if (dayEntry.angebote?.length) {
                    offerLines.push(
                      ...dayEntry.angebote.map((offer) => escapeHtml(offer)),
                    );
                  } else {
                    offerLines.push('<span class="muted">Keine Angebote</span>');
                  }
                  if (dayEntry.angebotNotes) {
                    offerLines.push(
                      `Notiz: ${escapeHtml(dayEntry.angebotNotes)}`,
                    );
                  }
                }
                const offersCell = showOffers
                  ? `<ul>${offerLines.map((line) => `<li>${line}</li>`).join('')}</ul>`
                  : '<span class="muted">–</span>';

                const observationLines = [];
                if (showObservations) {
                  sortedChildren.forEach((child) => {
                    const obs = dayEntry.observations[child] || [];
                    const note = dayEntry.observationNotes?.[child] || '';
                    if (!obs.length && !note) {
                      return;
                    }
                    const parts = [];
                    if (obs.length) {
                      parts.push(obs.map((item) => escapeHtml(item)).join(', '));
                    }
                    if (note) {
                      parts.push(`Notiz: ${escapeHtml(note)}`);
                    }
                    observationLines.push(
                      `<strong>${escapeHtml(child)}:</strong> ${parts.join(' · ')}`,
                    );
                  });
                }
                const observationsCell = showObservations
                  ? observationLines.length
                    ? `<ul>${observationLines.map((line) => `<li>${line}</li>`).join('')}</ul>`
                    : '<span class="muted">Keine Beobachtungen</span>'
                  : '<span class="muted">–</span>';

                const absenceLines = showAbsence
                  ? dayEntry.absentChildren.map((child) => escapeHtml(child))
                  : [];
                const absenceCell = showAbsence
                  ? absenceLines.length
                    ? `<ul>${absenceLines.map((line) => `<li>${line}</li>`).join('')}</ul>`
                    : '<span class="muted">Keine Abwesenheit</span>'
                  : '<span class="muted">–</span>';

                return `<tr>
                  <td>${dateCell}</td>
                  <td>${offersCell}</td>
                  <td>${observationsCell}</td>
                  <td>${absenceCell}</td>
                </tr>`;
              })
              .join('');
            const heading = group.heading
              ? `<h3 class="group-title">${escapeHtml(group.heading)}</h3>`
              : '';
            const tableHead = `<thead><tr><th>Tag</th><th>Angebote</th><th>Beobachtungen</th><th>Abwesenheit</th></tr></thead>`;
            return `<section class="group">${heading}<table>${tableHead}<tbody>${rows}</tbody></table></section>`;
          })
          .join('')
      : '<div class="muted">Keine Daten für den gewählten Zeitraum vorhanden.</div>';

    return `<!doctype html>
<html lang="de">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(UI_LABELS.weeklyTable)} – PDF</title>
    <style>
      * { box-sizing: border-box; }
      body { font-family: Arial, sans-serif; margin: 0; padding: 24px; color: #0f172a; }
      h1 { font-size: 20px; margin: 0 0 4px; }
      h2 { font-size: 16px; margin: 0 0 12px; }
      h3 { font-size: 13px; margin: 16px 0 8px; text-transform: uppercase; color: #475569; }
      .muted { color: #64748b; }
      .meta { margin: 0 0 16px; padding: 0; list-style: none; display: grid; gap: 4px; }
      .group { margin-bottom: 16px; }
      .badge { display: inline-block; border-radius: 999px; padding: 2px 8px; background: #e2e8f0; font-size: 12px; }
      table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
      th, td { border: 1px solid #e2e8f0; padding: 8px; vertical-align: top; text-align: left; }
      th { background: #f1f5f9; font-weight: 600; }
      ul { margin: 0; padding-left: 18px; }
      @media print {
        body { padding: 12px; }
      }
    </style>
  </head>
  <body>
    <h1>${escapeHtml(UI_LABELS.weeklyTable)}</h1>
    <h2 class="${info.muted ? 'muted' : ''}">${escapeHtml(info.text)}</h2>
    <ul class="meta">
      ${metaItems.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}
    </ul>
    ${groupsHtml}
  </body>
</html>`;
  };

  pdfButton.addEventListener('click', () => {
    const printWindow = window.open('', '_blank', 'noopener,noreferrer');
    if (!printWindow) {
      return;
    }
    const html = buildPrintHtml();
    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
    printWindow.close();
  });

  const update = ({
    days: nextDays = {},
    children: nextChildren = [],
    observationCatalog: nextObservationCatalog = [],
    observationGroups: nextObservationGroups = {},
    freeDays: nextFreeDays = [],
    timetableSchedule: nextTimetableSchedule = {},
    timetableLessons: nextTimetableLessons = [],
  } = {}) => {
    currentDays = nextDays || {};
    currentChildren = Array.isArray(nextChildren) ? [...nextChildren] : [];
    currentObservationCatalog = Array.isArray(nextObservationCatalog)
      ? [...nextObservationCatalog]
      : [];
    currentObservationGroups = nextObservationGroups || {};
    currentFreeDays = Array.isArray(nextFreeDays) ? [...nextFreeDays] : [];
    currentTimetableSchedule = nextTimetableSchedule || {};
    currentTimetableLessons = Array.isArray(nextTimetableLessons) ? [...nextTimetableLessons] : [];
    observationGroupMap = buildObservationCatalogGroupMap(currentObservationCatalog);
    selectableDateKeys = getSelectableDateKeys();
    schoolYears = getSchoolWeeks(buildDaysIndex(selectableDateKeys, currentDays));
    if (!schoolYears.length) {
      selectedYear = null;
      selectedWeekId = null;
    }
    if (selectedYear && !schoolYears.some((year) => year.label === selectedYear)) {
      selectedYear = schoolYears.length ? schoolYears[schoolYears.length - 1].label : null;
      selectedWeekId = selectedYear ? getLatestWeekForYear(schoolYears, selectedYear)?.id : null;
    } else if (!selectedYear && schoolYears.length) {
      selectedYear = schoolYears[schoolYears.length - 1].label;
      selectedWeekId = getLatestWeekForYear(schoolYears, selectedYear)?.id || null;
    }
    const activeYear = findSelectedYear();
    if (activeYear && activeYear.weeks.length && !activeYear.weeks.some((week) => week.id === selectedWeekId)) {
      const latest = getLatestWeekForYear(schoolYears, selectedYear);
      selectedWeekId = latest ? latest.id : activeYear.weeks[activeYear.weeks.length - 1].id;
    }
    const dateKeys = selectableDateKeys;
    if (!selectedDay || !dateKeys.includes(selectedDay)) {
      selectedDay = dateKeys.length ? dateKeys[dateKeys.length - 1] : null;
    }
    const monthKeys = [...new Set(dateKeys.map((key) => getMonthKey(key)).filter(Boolean))];
    if (!selectedMonth || !monthKeys.includes(selectedMonth)) {
      selectedMonth = monthKeys.length ? monthKeys[monthKeys.length - 1] : null;
    }
    if (selectedChild && selectedChild !== 'all' && !currentChildren.includes(selectedChild)) {
      selectedChild = 'all';
    }
    if (isOpen()) {
      render();
    }
  };

  render();

  return {
    element: overlay,
    open,
    close,
    update,
  };
};
