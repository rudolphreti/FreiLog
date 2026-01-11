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
import { getFreeDayInfo, isWeekend } from '../utils/freeDays.js';
import { UI_LABELS } from '../ui/labels.js';
import {
  flattenModuleAssignments,
  getFreizeitModulesForDate,
  normalizeModuleAssignments,
} from '../utils/angebotModules.js';

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
  const observations = typeof entry.observations === 'object' ? entry.observations : {};
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
    observations: normalizedObs,
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
}) => {
  const wrapper = createEl('div', { className: 'weekly-table__cell-content' });
  if (content) {
    wrapper.append(content);
  }

  const canEdit =
    isEditMode &&
    typeof onEditCell === 'function' &&
    child &&
    dateKey &&
    !isFreeDay &&
    !isAbsent;
  if (canEdit) {
    wrapper.classList.add('weekly-table__cell-content--editable');
    const editButton = createEl('button', {
      className: 'btn btn-light btn-sm weekly-table__edit-button',
      attrs: {
        type: 'button',
        'aria-label': `Bearbeiten: ${child} – ${displayDate || dateKey}`,
      },
      text: '✎',
    });
    editButton.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      onEditCell({ child, dateKey });
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
  headerRow.append(createEl('th', { scope: 'col', text: '' }));
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
              ? buildModuleOfferList(
                  dayEntry.freizeitModules,
                  dayEntry.angebotModules,
                  dayEntry.angebote,
                )
              : null,
            dateKey: item.dateKey,
            displayDate: item.displayDate,
            isEditMode,
            onEditCell,
            isFreeDay: Boolean(freeInfo),
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
  let typeFilters = {
    observations: true,
    offers: true,
    absence: true,
  };
  let freeDayFilters = {
    weekend: false,
    holidays: false,
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
  const controls = createEl('div', {
    className: 'weekly-table__controls',
  });
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
  const freeDayFilterGroup = buildTypeFilterGroup({
    id: 'weekly-table-free-days',
    label: 'Freie Tage',
    options: [
      { value: 'weekend', label: 'Wochenende', checked: false },
      { value: 'holidays', label: 'Feiertage', checked: false },
    ],
  });
  const editToggleId = 'weekly-table-edit-toggle';
  const editToggle = createEl('input', {
    className: 'form-check-input',
    attrs: { type: 'checkbox', id: editToggleId },
  });
  const editToggleLabel = createEl('label', {
    className: 'form-check-label',
    attrs: { for: editToggleId },
    text: 'Bearbeiten',
  });
  const editToggleWrapper = createEl('div', {
    className: 'form-check form-switch weekly-table__control weekly-table__toggle',
    children: [editToggle, editToggleLabel],
  });
  controls.append(
    timeSelectGroup.wrapper,
    yearSelectGroup.wrapper,
    weekSelectGroup.wrapper,
    daySelectGroup.wrapper,
    monthSelectGroup.wrapper,
    childSelectGroup.wrapper,
    typeFilterGroup.wrapper,
    freeDayFilterGroup.wrapper,
    editToggleWrapper,
  );

  const infoText = createEl('div', { className: 'text-muted small' });
  const tableContainer = createEl('div', { className: 'weekly-table__container' });

  content.append(controls, infoText, tableContainer);
  panel.append(header, content);
  overlay.append(panel);

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
    if (selectedYear) {
      yearSelectGroup.select.value = selectedYear;
    } else if (schoolYears.length) {
      yearSelectGroup.select.value = schoolYears[schoolYears.length - 1].label;
      selectedYear = yearSelectGroup.select.value;
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
    const dateKeys = getSortedDateKeys(currentDays);
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
    const dateKeys = getSortedDateKeys(currentDays);
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

  const renderInfo = () => {
    clearElement(infoText);
    if (selectedTimeFilter === 'day') {
      if (!selectedDay) {
        infoText.append(
          createEl('span', {
            className: 'text-muted',
            text: 'Kein Tag mit Daten vorhanden.',
          }),
        );
        return;
      }
      infoText.append(
        createEl('span', {
          text: formatDisplayDate(selectedDay),
        }),
      );
      return;
    }
    if (selectedTimeFilter === 'month') {
      if (!selectedMonth) {
        infoText.append(
          createEl('span', {
            className: 'text-muted',
            text: 'Kein Monat mit Daten vorhanden.',
          }),
        );
        return;
      }
      infoText.append(
        createEl('span', {
          text: formatMonthLabel(selectedMonth),
        }),
      );
      return;
    }
    if (selectedTimeFilter === 'year') {
      if (!selectedYear) {
        infoText.append(
          createEl('span', {
            className: 'text-muted',
            text: 'Kein Schuljahr mit Daten vorhanden.',
          }),
        );
        return;
      }
      infoText.append(
        createEl('span', {
          text: selectedYear,
        }),
      );
      return;
    }

    const week = findSelectedWeek();
    if (!week) {
      infoText.append(
        createEl('span', {
          className: 'text-muted',
          text: 'Keine Wochen mit Daten vorhanden.',
        }),
      );
      return;
    }
    infoText.append(
      createEl('span', {
        text: `${week.label} · ${formatDisplayDate(week.startYmd)} – ${formatDisplayDate(week.endYmd)}`,
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
        if (!child || !dateKey) {
          return;
        }
        const safeDate = dateKey;
        setSelectedDate(safeDate);

        const safeChildSelector = (() => {
          if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
            return CSS.escape(child);
          }
          return child;
        })();

        const openChild = (remaining = 8) => {
          const button = document.querySelector(
            `[data-role="observation-child"][data-child="${safeChildSelector}"]`,
          );
          if (button) {
            button.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            button.click();
            return;
          }
          if (remaining > 0) {
            window.setTimeout(() => openChild(remaining - 1), 80);
          }
        };

        window.setTimeout(() => openChild(8), 120);
      },
      isEditMode,
      freeDays: currentFreeDays,
      timetableSchedule: currentTimetableSchedule,
      timetableLessons: currentTimetableLessons,
      typeFilters,
      freeDayFilters,
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

  freeDayFilterGroup.inputs.forEach((input, key) => {
    input.addEventListener('change', () => {
      freeDayFilters = {
        ...freeDayFilters,
        [key]: input.checked,
      };
      renderTable();
    });
  });

  editToggle.addEventListener('change', (event) => {
    isEditMode = event.target.checked;
    renderTable();
  });

  const open = () => {
    if (!schoolYears.length) {
      render();
    }
    overlay.classList.add('is-open');
    overlay.setAttribute('aria-hidden', 'false');
    document.body.classList.add('weekly-table-overlay-open');
    render();
  };

  const close = () => {
    overlay.classList.remove('is-open');
    overlay.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('weekly-table-overlay-open');
  };

  closeButton.addEventListener('click', () => {
    close();
  });

  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) {
      close();
    }
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
    schoolYears = getSchoolWeeks(currentDays);
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
    const dateKeys = getSortedDateKeys(currentDays);
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
