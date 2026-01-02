import { clearElement, createEl } from '../ui/dom.js';
import {
  formatDisplayDate,
  getLatestWeekForYear,
  getSchoolWeeks,
} from '../utils/schoolWeeks.js';
import {
  normalizeObservationGroups,
  normalizeObservationKey,
} from '../utils/observationCatalog.js';
import { setSelectedDate } from '../state/store.js';
import { getFreeDayInfo } from '../utils/freeDays.js';
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

const getWeekDays = (week) =>
  WEEKDAY_LABELS.map((info) => {
    const date = new Date(week.startDate);
    date.setUTCDate(date.getUTCDate() + info.offset);
    const ymd = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
    return {
      ...info,
      dateKey: ymd,
      displayDate: formatDisplayDate(ymd),
    };
  });

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
    const moduleWrapper = createEl('div', { className: 'weekly-table__module' });
    const label =
      module.descriptor || module.tabLabel || module.periodLabel || 'Freizeit';
    moduleWrapper.append(
      createEl('div', {
        className: 'text-muted small weekly-table__module-label',
        text: label,
      }),
      buildPillList(safeAssignments[module.id] || []),
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
}) => {
  const table = createEl('table', {
    className: 'table table-bordered table-sm align-middle weekly-table',
  });
  const thead = createEl('thead');
  const headerRow = createEl('tr');
  headerRow.append(createEl('th', { scope: 'col', text: '' }));
  const weekDays = getWeekDays(week).map((item) => {
    const freeInfo = getFreeDayInfo(item.dateKey, freeDays);
    const holidayLabel = freeInfo?.type === 'holiday' && freeInfo.label ? freeInfo.label : null;
    return { ...item, freeInfo, holidayLabel };
  });
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
            content: buildModuleOfferList(
              dayEntry.freizeitModules,
              dayEntry.angebotModules,
              dayEntry.angebote,
            ),
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
  tbody.append(angeboteRow);

  const sortedChildren = [...children].sort((a, b) => a.localeCompare(b, 'de'));

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
      const cellBody = createEl('div', {
        className: 'weekly-table__cell-body',
        children: [
          isAbsent ? buildAbsenceBadge() : null,
          buildObservationList(obs, getGroupsForLabel, observationGroups),
        ],
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
  const yearSelectGroup = buildSelectGroup({
    id: 'weekly-table-year',
    label: 'Schuljahr wählen',
  });
  const weekSelectGroup = buildSelectGroup({
    id: 'weekly-table-week',
    label: 'Schulwoche wählen',
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
  controls.append(yearSelectGroup.wrapper, weekSelectGroup.wrapper, editToggleWrapper);

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

  const renderYearOptions = () => {
    clearElement(yearSelectGroup.select);
    schoolYears.forEach((year) => {
      yearSelectGroup.select.append(
        createEl('option', { attrs: { value: year.label }, text: year.label }),
      );
    });
    const hasMultipleYears = schoolYears.length > 1;
    yearSelectGroup.wrapper.classList.toggle('d-none', !hasMultipleYears);
    if (selectedYear) {
      yearSelectGroup.select.value = selectedYear;
    } else if (schoolYears.length) {
      yearSelectGroup.select.value = schoolYears[schoolYears.length - 1].label;
      selectedYear = yearSelectGroup.select.value;
    }
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

  const renderInfo = () => {
    const week = findSelectedWeek();
    clearElement(infoText);
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
    const week = findSelectedWeek();
    if (!week) {
      tableContainer.append(
        createEl('div', {
          className: 'alert alert-light border',
          text: 'Keine Daten für die ausgewählte Schulwoche vorhanden.',
        }),
      );
      return;
    }
    const table = buildWeeklyTable({
      week,
      days: currentDays,
      children: currentChildren,
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
    });
    tableContainer.append(table);
  };

  const render = () => {
    renderYearOptions();
    renderWeekOptions();
    selectedWeekId = weekSelectGroup.select.value || selectedWeekId;
    renderInfo();
    renderTable();
  };

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
