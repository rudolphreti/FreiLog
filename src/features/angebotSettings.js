import { saveFixedAngeboteConfig, applyFixedAngeboteForDate } from '../db/dbRepository.js';
import { createEl } from '../ui/dom.js';
import { UI_LABELS } from '../ui/labels.js';
import { normalizeAngebotText } from '../utils/angebotCatalog.js';
import { todayYmd } from '../utils/date.js';
import {
  getFreizeitModulesByDay,
  getTimetableDayKey,
  normalizeFixedAngeboteConfig,
  normalizeAngebotListForModules,
} from '../utils/angebotModules.js';
import {
  DEFAULT_TIMETABLE_LESSONS,
  TIMETABLE_DAY_ORDER,
  buildSubjectKey,
  formatSubjectsList,
} from '../utils/timetable.js';

const FREIZEIT_KEY = buildSubjectKey('Freizeit');
const createText = (text, className = 'text-muted small mb-0') =>
  createEl('p', { className, text });

const hasFreizeit = (cell = []) =>
  Array.isArray(cell) && cell.some((subject) => buildSubjectKey(subject) === FREIZEIT_KEY);

export const createAngebotSettingsView = ({
  title = UI_LABELS.angebotSettings,
  timetableLessons = DEFAULT_TIMETABLE_LESSONS,
  timetableSchedule = {},
  fixedAssignments = {},
  angebotPresets = [],
  selectedDate = todayYmd(),
} = {}) => {
  let currentLessons = Array.isArray(timetableLessons) && timetableLessons.length
    ? timetableLessons
    : DEFAULT_TIMETABLE_LESSONS;
  let currentSchedule =
    timetableSchedule && typeof timetableSchedule === 'object'
      ? timetableSchedule
      : {};
  let currentFixed = normalizeFixedAngeboteConfig(
    fixedAssignments,
    currentSchedule,
    currentLessons,
  );
  let currentModulesByDay = getFreizeitModulesByDay(currentSchedule, currentLessons);
  let currentPresets = Array.isArray(angebotPresets) ? angebotPresets : [];
  let selectedDateRef = selectedDate || todayYmd();

  const overlay = createEl('div', {
    className: 'timetable-overlay angebot-settings-overlay',
    attrs: { 'aria-hidden': 'true' },
  });
  const panel = createEl('div', { className: 'timetable-overlay__panel angebot-settings-overlay__panel' });
  const header = createEl('div', { className: 'timetable-overlay__header angebot-settings-overlay__header' });
  const titleEl = createEl('h3', { className: 'h4 mb-0', text: title });
  const closeButton = createEl('button', {
    className: 'btn-close timetable-overlay__close',
    attrs: { type: 'button', 'aria-label': `${title} schließen` },
  });
  header.append(titleEl, closeButton);

  const content = createEl('div', {
    className: 'timetable-overlay__content angebot-settings-overlay__content d-flex flex-column gap-3',
  });

  const presetListId = 'angebot-settings-presets';
  const presetDatalist = createEl('datalist', { attrs: { id: presetListId } });

  const renderPresets = () => {
    presetDatalist.replaceChildren(
      ...Array.from(new Set(currentPresets))
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b, 'de', { sensitivity: 'base' }))
        .map((value) => createEl('option', { attrs: { value } })),
    );
  };

  const persistFixedAssignments = (dayKey) => {
    saveFixedAngeboteConfig(currentFixed);
    const selectedDayKey = getTimetableDayKey(selectedDateRef);
    if (selectedDayKey && selectedDayKey === dayKey) {
      applyFixedAngeboteForDate(selectedDateRef);
    }
  };

  const setModuleAssignments = (dayKey, moduleId, list) => {
    const dayAssignments = { ...(currentFixed[dayKey] || {}) };
    const normalized = normalizeAngebotListForModules(list);
    if (normalized.length) {
      dayAssignments[moduleId] = normalized;
    } else {
      delete dayAssignments[moduleId];
    }
    const nextFixed = { ...currentFixed };
    if (Object.keys(dayAssignments).length) {
      nextFixed[dayKey] = dayAssignments;
    } else {
      delete nextFixed[dayKey];
    }
    currentFixed = normalizeFixedAngeboteConfig(
      nextFixed,
      currentSchedule,
      currentLessons,
    );
    persistFixedAssignments(dayKey);
  };

  const addAssignment = (dayKey, moduleId, value) => {
    const normalized = normalizeAngebotText(value);
    if (!normalized) {
      return;
    }
    const currentList =
      (currentFixed[dayKey] && currentFixed[dayKey][moduleId]) || [];
    const merged = normalizeAngebotListForModules([...currentList, normalized]);
    setModuleAssignments(dayKey, moduleId, merged);
  };

  const removeAssignment = (dayKey, moduleId, value) => {
    const normalized = normalizeAngebotText(value);
    if (!normalized) {
      return;
    }
    const currentList =
      (currentFixed[dayKey] && currentFixed[dayKey][moduleId]) || [];
    const filtered = currentList.filter((item) => normalizeAngebotText(item) !== normalized);
    setModuleAssignments(dayKey, moduleId, filtered);
  };

  const buildScheduleTable = (dayKey) => {
    const scheduleDay = Array.isArray(currentSchedule?.[dayKey])
      ? currentSchedule[dayKey]
      : [];
    const table = createEl('table', {
      className: 'table table-sm align-middle mb-0 angebot-settings__schedule',
    });
    const tbody = createEl('tbody');
    table.appendChild(tbody);

    scheduleDay.forEach((cell, index) => {
      const period = index + 1;
      const lesson = currentLessons[period - 1] || {};
      const row = createEl('tr', {
        className: hasFreizeit(cell) ? 'angebot-settings__freizeit-row' : '',
      });
      row.append(
        createEl('th', { className: 'text-nowrap', text: `${period}. Std.` }),
        createEl('td', {
          className: 'text-muted small text-nowrap',
          text: lesson.start && lesson.end ? `${lesson.start} – ${lesson.end}` : '',
        }),
        createEl('td', {
          children: [
            createEl('span', {
              className: 'angebot-settings__subject',
              text: formatSubjectsList(cell),
            }),
          ],
        }),
      );
      tbody.appendChild(row);
    });

    return table;
  };

  const buildModuleBlock = (dayKey, module) => {
    const wrapper = createEl('div', {
      className: 'angebot-settings__module card',
    });
    const body = createEl('div', { className: 'card-body d-flex flex-column gap-2' });
    const headerRow = createEl('div', {
      className: 'd-flex flex-wrap justify-content-between align-items-center gap-2',
      children: [
        createEl('div', {
          className: 'd-flex flex-column',
          children: [
            createEl('span', { className: 'fw-semibold', text: module.descriptor }),
            module.timeLabel
              ? createText(module.timeLabel, 'text-muted small mb-0')
              : null,
          ].filter(Boolean),
        }),
        createEl('span', {
          className: 'badge text-bg-warning-subtle text-warning-emphasis',
          text: 'Freizeit',
        }),
      ],
    });

    const currentList =
      (currentFixed[dayKey] && currentFixed[dayKey][module.id]) || [];
    const pillList = createEl('div', {
      className: 'd-flex flex-wrap gap-2',
    });
    if (!currentList.length) {
      pillList.append(
        createText('Noch keine fixen Angebote hinterlegt.', 'text-muted small mb-0'),
      );
    } else {
      currentList.forEach((item) => {
        const pill = createEl('span', {
          className:
            'badge rounded-pill text-bg-secondary d-inline-flex align-items-center angebot-settings__pill',
          children: [
            createEl('span', { text: item }),
            createEl('button', {
              className: 'btn btn-link btn-sm text-white p-0 ms-2',
              attrs: { type: 'button', 'aria-label': `${item} entfernen` },
              text: '✕',
              dataset: { value: item },
            }),
          ],
        });
        pillList.appendChild(pill);
      });
    }

    const input = createEl('input', {
      className: 'form-control form-control-sm',
      attrs: {
        type: 'text',
        placeholder: `${UI_LABELS.angebotCreate}…`,
        list: presetListId,
      },
    });
    const addButton = createEl('button', {
      className: 'btn btn-primary btn-sm',
      attrs: { type: 'button' },
      text: 'Hinzufügen',
    });
    const controls = createEl('div', {
      className: 'd-flex flex-wrap align-items-center gap-2',
      children: [input, addButton],
    });

    addButton.addEventListener('click', () => {
      addAssignment(dayKey, module.id, input.value);
      input.value = '';
    });
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        addAssignment(dayKey, module.id, input.value);
        input.value = '';
      }
    });
    pillList.addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }
      const button = target.closest('button');
      const value = button?.dataset?.value;
      if (value) {
        removeAssignment(dayKey, module.id, value);
      }
    });

    body.append(headerRow, pillList, controls);
    wrapper.append(body);
    return wrapper;
  };

  const buildDaySection = ({ key, label }) => {
    const dayCard = createEl('section', { className: 'card border-0 shadow-sm' });
    const body = createEl('div', { className: 'card-body d-flex flex-column gap-3' });
    const headingRow = createEl('div', {
      className: 'd-flex justify-content-between align-items-center gap-2 flex-wrap',
      children: [
        createEl('h4', { className: 'h6 mb-0', text: label }),
        createText(UI_LABELS.fixedOffers, 'text-uppercase text-muted fw-semibold small mb-0'),
      ],
    });

    const scheduleTable = buildScheduleTable(key);
    const modules = currentModulesByDay[key] || [];
    const modulesContainer = createEl('div', {
      className: 'd-flex flex-column gap-2',
    });

    if (!modules.length) {
      modulesContainer.append(
        createText('Kein Freizeit-Block in diesem Stundenplan.', 'text-muted small mb-0'),
      );
    } else {
      modules.forEach((module) => {
        modulesContainer.append(buildModuleBlock(key, module));
      });
    }

    body.append(
      headingRow,
      createText('Stundenplan', 'text-muted small fw-semibold mb-0'),
      scheduleTable,
      createText(
        'Fixe Angebote können nur in Freizeit-Blöcken gepflegt werden. Sie werden täglich automatisch dem passenden Datum hinzugefügt.',
      ),
      modulesContainer,
    );
    dayCard.append(body);
    return dayCard;
  };

  const render = () => {
    const intro = createEl('section', { className: 'card border-0 shadow-sm' });
    const introBody = createEl('div', {
      className: 'card-body d-flex flex-column gap-2',
      children: [
        createEl('h3', { className: 'h5 mb-0', text: UI_LABELS.fixedOffers }),
        createText(
          'Nutze den Stundenplan, um fixe Angebote für Freizeit-Blöcke festzulegen. Sie erscheinen automatisch als reguläre Einträge im Tagesprotokoll.',
        ),
      ],
    });
    intro.append(introBody);

    const daySections = TIMETABLE_DAY_ORDER.map((day) => buildDaySection(day));
    content.replaceChildren(intro, ...daySections, presetDatalist);
    renderPresets();
  };

  const open = () => {
    overlay.classList.add('is-open');
    overlay.setAttribute('aria-hidden', 'false');
    document.body.classList.add('angebot-settings-overlay-open');
  };

  const close = () => {
    overlay.classList.remove('is-open');
    overlay.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('angebot-settings-overlay-open');
  };

  closeButton.addEventListener('click', close);
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) {
      close();
    }
  });

  const update = ({
    timetableLessons: nextLessons = currentLessons,
    timetableSchedule: nextSchedule = currentSchedule,
    fixedAssignments: nextFixed = currentFixed,
    angebotPresets: nextPresets = currentPresets,
    selectedDate: nextSelectedDate = selectedDateRef,
  } = {}) => {
    currentLessons =
      Array.isArray(nextLessons) && nextLessons.length
        ? nextLessons
        : DEFAULT_TIMETABLE_LESSONS;
    currentSchedule =
      nextSchedule && typeof nextSchedule === 'object' ? nextSchedule : {};
    currentFixed = normalizeFixedAngeboteConfig(
      nextFixed,
      currentSchedule,
      currentLessons,
    );
    currentModulesByDay = getFreizeitModulesByDay(currentSchedule, currentLessons);
    currentPresets = Array.isArray(nextPresets) ? nextPresets : [];
    selectedDateRef = nextSelectedDate || todayYmd();
    render();
  };

  panel.append(header, content);
  overlay.append(panel);
  render();

  return {
    element: overlay,
    open,
    close,
    update,
  };
};
