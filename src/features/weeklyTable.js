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

const normalizeDayEntry = (days, dateKey) => {
  const entry = days?.[dateKey] && typeof days[dateKey] === 'object' ? days[dateKey] : {};
  const angebote = normalizeValueList(entry.angebote);
  const observations = typeof entry.observations === 'object' ? entry.observations : {};
  const normalizedObs = Object.entries(observations || {}).reduce((acc, [child, value]) => {
    const normalized = normalizeObservationEntry(value);
    if (normalized.length) {
      acc[child] = normalized;
    }
    return acc;
  }, {});

  return {
    angebote,
    observations: normalizedObs,
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

const buildWeeklyTable = ({
  week,
  days,
  children,
  getGroupsForLabel,
  observationGroups,
}) => {
  const table = createEl('table', {
    className: 'table table-bordered table-sm align-middle weekly-table',
  });
  const thead = createEl('thead');
  const headerRow = createEl('tr');
  headerRow.append(createEl('th', { scope: 'col', text: '' }));
  const weekDays = getWeekDays(week);
  weekDays.forEach((item) => {
    const cell = createEl('th', { scope: 'col' });
    cell.append(
      createEl('div', { className: 'fw-semibold', text: item.label }),
      createEl('div', { className: 'text-muted small', text: item.displayDate }),
    );
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
  weekDays.forEach((item) => {
    const dayEntry = normalizeDayEntry(days, item.dateKey);
    angeboteRow.append(createEl('td', { children: [buildPillList(dayEntry.angebote)] }));
  });
  tbody.append(angeboteRow);

  const sortedChildren = [...children].sort((a, b) => a.localeCompare(b, 'de'));

  sortedChildren.forEach((child) => {
    const row = createEl('tr');
    row.append(createEl('th', { scope: 'row', className: 'text-nowrap', text: child }));
    weekDays.forEach((item) => {
      const dayEntry = normalizeDayEntry(days, item.dateKey);
      const obs = dayEntry.observations[child] || [];
      row.append(
        createEl('td', {
          children: [buildObservationList(obs, getGroupsForLabel, observationGroups)],
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
} = {}) => {
  let schoolYears = getSchoolWeeks(days);
  let selectedYear = schoolYears.length ? schoolYears[schoolYears.length - 1].label : null;
  let selectedWeekId = selectedYear ? getLatestWeekForYear(schoolYears, selectedYear)?.id : null;
  let currentDays = days || {};
  let currentChildren = Array.isArray(children) ? [...children] : [];
  let currentObservationCatalog = Array.isArray(observationCatalog) ? [...observationCatalog] : [];
  let currentObservationGroups = observationGroups || {};
  let observationGroupMap = buildObservationCatalogGroupMap(currentObservationCatalog);
  const getGroupsForLabel = (label) =>
    observationGroupMap.get(normalizeObservationKey(label)) || [];

  const overlay = createEl('div', {
    className: 'weekly-table-overlay',
    attrs: { 'aria-hidden': 'true' },
  });
  const panel = createEl('div', { className: 'weekly-table-overlay__panel' });
  const header = createEl('div', { className: 'weekly-table-overlay__header' });
  const title = createEl('h3', { className: 'h4 mb-0', text: 'Wochentabelle' });
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
  controls.append(yearSelectGroup.wrapper, weekSelectGroup.wrapper);

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
    console.log('weekly-table: week-select-change', {
      selectedYear,
      selectedWeekId,
    });
    render();
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
  } = {}) => {
    currentDays = nextDays || {};
    currentChildren = Array.isArray(nextChildren) ? [...nextChildren] : [];
    currentObservationCatalog = Array.isArray(nextObservationCatalog)
      ? [...nextObservationCatalog]
      : [];
    currentObservationGroups = nextObservationGroups || {};
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
