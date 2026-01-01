import {
  saveTimetableLessons,
  saveTimetableSchedule,
  saveTimetableSubjects,
} from '../db/dbRepository.js';
import { createEl } from '../ui/dom.js';
import { TIMETABLE_DAY_ORDER, formatSubjectsList } from '../utils/timetable.js';

const MAX_SUBJECT_LENGTH = 80;
const LESSONS_COUNT = 10;

const cloneLessons = (lessons) =>
  Array.isArray(lessons) ? lessons.map((item, index) => ({ ...item, period: index + 1 })) : [];

const cloneSchedule = (schedule) => {
  const cloned = {};
  TIMETABLE_DAY_ORDER.forEach(({ key }) => {
    const entries = Array.isArray(schedule?.[key]) ? schedule[key] : [];
    cloned[key] = entries.map((cell) => [...(cell || [])]);
  });
  return cloned;
};

const buildSubjectOption = (subject, isMissing = false) =>
  createEl('option', {
    attrs: { value: subject },
    text: isMissing ? `${subject} (entfernt)` : subject,
  });

export const createTimetableSettingsView = ({ subjects = [], lessons = [], schedule = {} } = {}) => {
  let localSubjects = [...subjects];
  let localLessons = cloneLessons(lessons);
  let localSchedule = cloneSchedule(schedule);
  let isOpen = false;
  let isEditing = false;
  let subjectRemoveButtons = [];
  let lessonInputs = [];

  const status = {
    subjects: null,
    lessons: null,
    schedule: null,
  };

  const overlay = createEl('div', {
    className: 'timetable-overlay',
    attrs: { 'aria-hidden': 'true' },
  });
  const panel = createEl('div', { className: 'timetable-overlay__panel' });

  const header = createEl('div', { className: 'timetable-overlay__header' });
  const title = createEl('h3', { className: 'h4 mb-0', text: 'Stundenplan' });
  const closeButton = createEl('button', {
    className: 'btn-close timetable-overlay__close',
    attrs: { type: 'button', 'aria-label': 'Stundenplan schließen' },
  });
  header.append(title, closeButton);

  const content = createEl('div', { className: 'timetable-overlay__content d-flex flex-column gap-3' });

  const subjectsCard = createEl('section', { className: 'card border-0 shadow-sm' });
  const subjectsBody = createEl('div', { className: 'card-body d-flex flex-column gap-3' });
  subjectsCard.append(subjectsBody);

  const lessonsCard = createEl('section', { className: 'card border-0 shadow-sm' });
  const lessonsBody = createEl('div', { className: 'card-body d-flex flex-column gap-3' });
  lessonsCard.append(lessonsBody);

  const gridCard = createEl('section', { className: 'card border-0 shadow-sm' });
  const gridBody = createEl('div', { className: 'card-body d-flex flex-column gap-3' });
  gridCard.append(gridBody);

  content.append(gridCard, subjectsCard, lessonsCard);
  panel.append(header, content);
  overlay.append(panel);

  const setStatus = (key, message, tone = 'muted') => {
    const target = status[key];
    if (!target) {
      return;
    }
    target.textContent = message || '';
    target.classList.remove('text-success', 'text-danger', 'text-muted');
    if (tone === 'success') {
      target.classList.add('text-success');
    } else if (tone === 'error') {
      target.classList.add('text-danger');
    } else {
      target.classList.add('text-muted');
    }
  };

  const subjectsList = createEl('div', { className: 'd-flex flex-wrap gap-2' });
  const subjectInput = createEl('input', {
    className: 'form-control',
    attrs: { type: 'text', placeholder: 'Neues Fach hinzufügen' },
  });
  const addSubjectButton = createEl('button', {
    className: 'btn btn-primary',
    attrs: { type: 'button' },
    text: 'Hinzufügen',
  });
  const subjectFormRow = createEl('div', {
    className: 'd-flex flex-wrap gap-2 align-items-center',
    children: [subjectInput, addSubjectButton],
  });
  status.subjects = createEl('div', { className: 'small text-muted', text: '' });

  const refreshSubjectsList = () => {
    subjectRemoveButtons = [];
    subjectsList.replaceChildren();
    localSubjects.forEach((subject) => {
      const pill = createEl('span', {
        className: 'badge rounded-pill text-bg-secondary d-inline-flex align-items-center gap-2 timetable-pill',
      });
      pill.append(createEl('span', { text: subject }));
      const removeBtn = createEl('button', {
        className: 'btn btn-link btn-sm text-white p-0',
        attrs: { type: 'button', 'aria-label': `${subject} entfernen` },
        text: '✕',
      });
      removeBtn.addEventListener('click', () => {
        localSubjects = localSubjects.filter((item) => item !== subject);
        localSchedule = cloneSchedule(localSchedule);
        TIMETABLE_DAY_ORDER.forEach(({ key }) => {
          localSchedule[key] = (localSchedule[key] || []).map((cell) =>
            cell.filter((entry) => entry !== subject),
          );
        });
        saveTimetableSubjects(localSubjects);
        saveTimetableSchedule(localSchedule);
        refreshSubjectsList();
        refreshGridOptions();
        setStatus('subjects', 'Fach entfernt.', 'success');
      });
      removeBtn.disabled = !isEditing;
      subjectRemoveButtons.push(removeBtn);
      pill.append(removeBtn);
      subjectsList.append(pill);
    });
    applyEditingState();
  };

  const handleAddSubject = () => {
    const value = subjectInput.value.trim();
    if (!value) {
      setStatus('subjects', 'Bitte einen Fachnamen eingeben.', 'error');
      return;
    }
    if (value.length > MAX_SUBJECT_LENGTH) {
      setStatus('subjects', `Maximale Länge: ${MAX_SUBJECT_LENGTH} Zeichen.`, 'error');
      return;
    }
    if (localSubjects.includes(value)) {
      setStatus('subjects', 'Fach ist bereits vorhanden.', 'error');
      return;
    }
    localSubjects = [...localSubjects, value].sort((a, b) =>
      a.localeCompare(b, 'de', { sensitivity: 'base' }),
    );
    saveTimetableSubjects(localSubjects);
    refreshSubjectsList();
    refreshGridOptions();
    subjectInput.value = '';
    setStatus('subjects', 'Fach hinzugefügt.', 'success');
  };

  addSubjectButton.addEventListener('click', handleAddSubject);
  subjectInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      handleAddSubject();
    }
  });

  const lessonsTable = createEl('table', {
    className: 'table table-sm align-middle mb-0 timetable-lessons',
  });
  const lessonsTbody = createEl('tbody');
  lessonsTable.append(lessonsTbody);
  status.lessons = createEl('div', { className: 'small text-muted pt-1', text: '' });

  const validateTime = (value) => /^\d{2}:\d{2}$/.test(value);

  const refreshLessons = () => {
    lessonInputs = [];
    lessonsTbody.replaceChildren();
    for (let i = 0; i < LESSONS_COUNT; i += 1) {
      const lesson = localLessons[i] || { period: i + 1, start: '', end: '' };
      const row = createEl('tr');
      const periodCell = createEl('td', {
        className: 'text-muted small',
        text: `${lesson.period}.`,
      });
      const startInput = createEl('input', {
        className: 'form-control form-control-sm',
        attrs: { type: 'time', value: lesson.start || '' },
      });
      const endInput = createEl('input', {
        className: 'form-control form-control-sm',
        attrs: { type: 'time', value: lesson.end || '' },
      });
      startInput.disabled = !isEditing;
      endInput.disabled = !isEditing;
      lessonInputs.push(startInput, endInput);

      const syncLessons = () => {
        const nextLessons = [...localLessons];
        nextLessons[i] = {
          period: lesson.period,
          start: startInput.value || '',
          end: endInput.value || '',
        };
        if (!validateTime(startInput.value) || !validateTime(endInput.value)) {
          setStatus('lessons', 'Bitte das Format HH:MM verwenden.', 'error');
        } else {
          localLessons = nextLessons;
          saveTimetableLessons(localLessons);
          refreshTimeRow();
          setStatus('lessons', 'Zeit aktualisiert.', 'success');
        }
      };

      startInput.addEventListener('change', syncLessons);
      endInput.addEventListener('change', syncLessons);

      row.append(
        periodCell,
        createEl('td', { children: [startInput] }),
        createEl('td', { children: [endInput] }),
      );
      lessonsTbody.append(row);
    }
  };

  const gridTable = createEl('table', {
    className: 'table table-bordered table-sm timetable-grid mb-0',
  });
  const gridTableWrapper = createEl('div', {
    className: 'timetable-grid-wrapper',
    children: [gridTable],
  });
  const gridThead = createEl('thead');
  const gridTbody = createEl('tbody');
  gridTable.append(gridThead, gridTbody);
  status.schedule = createEl('div', { className: 'small text-muted pt-1', text: '' });

  const selectRefs = new Map();
  const summaryRefs = new Map();

  const getSubjectColorClass = (subject) => {
    const lower = subject.toLocaleLowerCase('de');
    if (lower.startsWith('rel.')) {
      return 'timetable-badge--purple';
    }
    if (lower === 'freizeit') {
      return 'timetable-badge--green';
    }
    if (lower === 'mittagsessen') {
      return 'timetable-badge--red';
    }
    if (lower === 'lernzeit') {
      return 'timetable-badge--blue';
    }
    if (lower === 'bus') {
      return 'timetable-badge--sky';
    }
    if (lower === 'ted') {
      return 'timetable-badge--yellow';
    }
    if (lower === 'spätdienst' || lower === 'sd' || lower === 'spatdienst') {
      return 'timetable-badge--darkred';
    }
    return 'timetable-badge--neutral';
  };

  const buildBadgeList = (subjectsForCell) => {
    const list = createEl('div', { className: 'd-flex flex-wrap gap-1 timetable-badge-list' });
    if (!subjectsForCell.length) {
      list.append(createEl('span', { className: 'text-muted small', text: '—' }));
      return list;
    }
    subjectsForCell.forEach((subject) => {
      list.append(
        createEl('span', {
          className: `timetable-badge ${getSubjectColorClass(subject)}`,
          text: subject,
        }),
      );
    });
    return list;
  };

  const refreshTimeRow = () => {
    gridThead.replaceChildren();
    const numberRow = createEl('tr');
    numberRow.append(createEl('th', { text: '' }));
    for (let i = 0; i < LESSONS_COUNT; i += 1) {
      numberRow.append(createEl('th', { className: 'text-center text-muted', text: `${i + 1}` }));
    }

    const timeRow = createEl('tr');
    timeRow.append(createEl('th', { className: 'text-muted small', text: 'Zeit' }));
    for (let i = 0; i < LESSONS_COUNT; i += 1) {
      const lesson = localLessons[i] || {};
      timeRow.append(
        createEl('th', {
          className: 'text-center timetable-time-header',
          text: lesson.start && lesson.end ? `${lesson.start}-${lesson.end}` : '—',
        }),
      );
    }

    gridThead.append(numberRow, timeRow);
  };

  const refreshGridOptions = () => {
    selectRefs.forEach((rows, dayKey) => {
      rows.forEach(({ selectEl, summaryEl }, index) => {
        const currentValues = Array.from(selectEl.selectedOptions).map((option) => option.value);
        selectEl.replaceChildren();
        localSubjects.forEach((subject) => selectEl.append(buildSubjectOption(subject)));
        currentValues.forEach((value) => {
          if (!localSubjects.includes(value)) {
            selectEl.append(buildSubjectOption(value, true));
          }
        });
        Array.from(selectEl.options).forEach((option) => {
          option.selected = currentValues.includes(option.value);
        });
        const summaryText = formatSubjectsList(localSchedule[dayKey]?.[index] || []);
        selectEl.title = summaryText;
        if (summaryEl) {
          summaryEl.textContent = summaryText || '—';
        }
      });
    });
    summaryRefs.forEach((dayMap, dayKey) => {
      const daySchedule = localSchedule[dayKey] || [];
      dayMap.forEach((summaryNode, periodIndex) => {
        const badges = buildBadgeList(daySchedule[periodIndex] || []);
        summaryNode.replaceChildren(...badges.children);
      });
    });
  };

  const handleCellChange = (dayKey, index, selectEl, summaryEl, summaryContainer) => {
    const selected = Array.from(selectEl.selectedOptions).map((option) => option.value);
    const nextSchedule = cloneSchedule(localSchedule);
    if (!nextSchedule[dayKey]) {
      nextSchedule[dayKey] = [];
    }
    nextSchedule[dayKey][index] = selected;
    localSchedule = nextSchedule;
    saveTimetableSchedule(localSchedule);
    const summaryText = formatSubjectsList(selected);
    selectEl.title = summaryText;
    if (summaryEl) {
      summaryEl.textContent = summaryText || '—';
    }
    if (summaryContainer) {
      summaryContainer.replaceChildren(...buildBadgeList(selected).children);
    }
    setStatus('schedule', 'Stundenplan aktualisiert.', 'success');
  };

  const refreshGrid = () => {
    gridTbody.replaceChildren();
    selectRefs.clear();
    summaryRefs.clear();
    TIMETABLE_DAY_ORDER.forEach(({ key, label }) => {
      const row = createEl('tr');
      row.append(createEl('th', { className: 'text-muted', text: label }));
      const selects = [];
      const daySummaryRefs = new Map();
      for (let i = 0; i < LESSONS_COUNT; i += 1) {
        const cell = createEl('td');
        const select = createEl('select', {
          className: 'form-select form-select-sm timetable-select',
          attrs: { multiple: 'multiple', 'aria-label': `${label} Stunde ${i + 1}` },
        });
        localSubjects.forEach((subject) => select.append(buildSubjectOption(subject)));
        const cellValues = localSchedule[key]?.[i] || [];
        cellValues.forEach((value) => {
          if (!localSubjects.includes(value)) {
            select.append(buildSubjectOption(value, true));
          }
        });
        Array.from(select.options).forEach((option) => {
          option.selected = cellValues.includes(option.value);
        });
        const summaryText = formatSubjectsList(cellValues);
        const summary = createEl('div', {
          className: 'form-text small text-muted mt-1 timetable-cell-summary',
          text: summaryText || '—',
        });
        const badgeSummary = buildBadgeList(cellValues);
        const badgeWrapper = createEl('div', {
          className: 'timetable-cell-badges',
          children: badgeSummary.children,
        });
        select.title = summaryText;
        select.addEventListener('change', () => handleCellChange(key, i, select, summary, badgeWrapper));
        const selectWrapper = createEl('div', { className: 'timetable-select-wrapper', children: [select] });
        cell.append(selectWrapper, badgeWrapper, summary);
        row.append(cell);
        selects.push({ selectEl: select, summaryEl: summary, badgeWrapper });
        daySummaryRefs.set(i, badgeWrapper);
      }
      selectRefs.set(key, selects);
      summaryRefs.set(key, daySummaryRefs);
      gridTbody.append(row);
    });
  };

  const applyEditingState = () => {
    const disable = !isEditing;
    subjectInput.disabled = disable;
    addSubjectButton.disabled = disable;
    subjectFormRow.classList.toggle('d-none', disable);
    subjectRemoveButtons.forEach((btn) => {
      btn.disabled = disable;
      btn.classList.toggle('d-none', disable);
      btn.classList.toggle('disabled', disable);
    });
    lessonInputs.forEach((input) => {
      input.disabled = disable;
    });
    selectRefs.forEach((rows) => {
      rows.forEach(({ selectEl, summaryEl, badgeWrapper }) => {
        selectEl.closest('.timetable-select-wrapper').classList.toggle('d-none', disable);
        selectEl.disabled = disable;
        if (summaryEl) {
          summaryEl.classList.toggle('d-none', !disable);
        }
        if (badgeWrapper) {
          badgeWrapper.classList.toggle('timetable-cell-badges--inactive', !disable);
        }
      });
    });
  };

  const editToggle = createEl('div', {
    className: 'form-check form-switch d-inline-flex align-items-center gap-2',
  });
  const editInput = createEl('input', {
    className: 'form-check-input',
    attrs: { type: 'checkbox', id: 'timetable-edit-toggle' },
  });
  const editLabel = createEl('label', {
    className: 'form-check-label fw-semibold',
    attrs: { for: 'timetable-edit-toggle' },
    text: 'Bearbeitungsmodus',
  });
  editToggle.append(editInput, editLabel);

  editInput.addEventListener('change', () => {
    isEditing = editInput.checked;
    applyEditingState();
  });

  gridBody.append(
    createEl('div', {
      className: 'd-flex align-items-center justify-content-between flex-wrap gap-2',
      children: [
        createEl('div', {
          className: 'd-flex flex-column',
          children: [
            createEl('h4', { className: 'h5 mb-0', text: 'Wochenübersicht' }),
            createEl('p', {
              className: 'text-muted small mb-0',
              text: 'In den Bearbeitungsmodus wechseln, um Stunden anzupassen. Mehrfachauswahl kombiniert Fächer.',
            }),
          ],
        }),
        editToggle,
      ],
    }),
    gridTableWrapper,
    status.schedule,
  );

  subjectsBody.append(
    createEl('h4', { className: 'h5 mb-1', text: 'Fächer' }),
    createEl('p', {
      className: 'text-muted small mb-0',
      text: 'Verwalte die Liste verfügbarer Fächer. Die Liste ist alphabetisch sortiert.',
    }),
    subjectFormRow,
    subjectsList,
    status.subjects,
  );

  lessonsBody.append(
    createEl('h4', { className: 'h5 mb-1', text: 'Stundenzeiten' }),
    createEl('p', {
      className: 'text-muted small mb-0',
      text: 'Start- und Endzeiten für jede Stunde bearbeiten (HH:MM).',
    }),
    lessonsTable,
    status.lessons,
  );

  const open = () => {
    if (isOpen) return;
    overlay.classList.add('is-open');
    overlay.setAttribute('aria-hidden', 'false');
    document.body.classList.add('timetable-overlay-open');
    isOpen = true;
  };

  const close = () => {
    overlay.classList.remove('is-open');
    overlay.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('timetable-overlay-open');
    isOpen = false;
  };

  closeButton.addEventListener('click', close);
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) {
      close();
    }
  });

  const update = ({
    subjects: nextSubjects = [],
    lessons: nextLessons = [],
    schedule: nextSchedule = {},
  } = {}) => {
    localSubjects = [...nextSubjects];
    localLessons = cloneLessons(nextLessons);
    localSchedule = cloneSchedule(nextSchedule);
    refreshSubjectsList();
    refreshLessons();
    refreshTimeRow();
    refreshGrid();
    applyEditingState();
    editInput.checked = isEditing;
    setStatus('subjects', '');
    setStatus('lessons', '');
    setStatus('schedule', '');
  };

  refreshSubjectsList();
  refreshLessons();
  refreshTimeRow();
  refreshGrid();
  applyEditingState();

  return {
    element: overlay,
    open,
    close,
    update,
  };
};
