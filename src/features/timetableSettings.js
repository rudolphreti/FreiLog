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
    text: isMissing ? `${subject} (removed)` : subject,
  });

export const createTimetableSettingsView = ({ subjects = [], lessons = [], schedule = {} } = {}) => {
  let localSubjects = [...subjects];
  let localLessons = cloneLessons(lessons);
  let localSchedule = cloneSchedule(schedule);
  let isOpen = false;

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
  const title = createEl('h3', { className: 'h4 mb-0', text: 'Timetable' });
  const closeButton = createEl('button', {
    className: 'btn-close timetable-overlay__close',
    attrs: { type: 'button', 'aria-label': 'Close timetable' },
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
    attrs: { type: 'text', placeholder: 'Add new subject' },
  });
  const addSubjectButton = createEl('button', {
    className: 'btn btn-primary',
    attrs: { type: 'button' },
    text: 'Add',
  });
  const subjectFormRow = createEl('div', {
    className: 'd-flex flex-wrap gap-2 align-items-center',
    children: [subjectInput, addSubjectButton],
  });
  status.subjects = createEl('div', { className: 'small text-muted', text: '' });

  const refreshSubjectsList = () => {
    subjectsList.replaceChildren();
    localSubjects.forEach((subject) => {
      const pill = createEl('span', {
        className: 'badge rounded-pill text-bg-secondary d-inline-flex align-items-center gap-2 timetable-pill',
      });
      pill.append(createEl('span', { text: subject }));
      const removeBtn = createEl('button', {
        className: 'btn btn-link btn-sm text-white p-0',
        attrs: { type: 'button', 'aria-label': `Remove ${subject}` },
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
        setStatus('subjects', 'Subject removed.', 'success');
      });
      pill.append(removeBtn);
      subjectsList.append(pill);
    });
  };

  const handleAddSubject = () => {
    const value = subjectInput.value.trim();
    if (!value) {
      setStatus('subjects', 'Please enter a subject name.', 'error');
      return;
    }
    if (value.length > MAX_SUBJECT_LENGTH) {
      setStatus('subjects', `Maximum length is ${MAX_SUBJECT_LENGTH} characters.`, 'error');
      return;
    }
    if (localSubjects.includes(value)) {
      setStatus('subjects', 'Subject already exists.', 'error');
      return;
    }
    localSubjects = [...localSubjects, value].sort((a, b) =>
      a.localeCompare(b, 'de', { sensitivity: 'base' }),
    );
    saveTimetableSubjects(localSubjects);
    refreshSubjectsList();
    refreshGridOptions();
    subjectInput.value = '';
    setStatus('subjects', 'Subject added.', 'success');
  };

  addSubjectButton.addEventListener('click', handleAddSubject);
  subjectInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      handleAddSubject();
    }
  });

  const lessonsTable = createEl('table', { className: 'table table-sm align-middle mb-0 timetable-lessons' });
  const lessonsTbody = createEl('tbody');
  lessonsTable.append(lessonsTbody);
  status.lessons = createEl('div', { className: 'small text-muted pt-1', text: '' });

  const validateTime = (value) => /^\d{2}:\d{2}$/.test(value);

  const refreshLessons = () => {
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

      const syncLessons = () => {
        const nextLessons = [...localLessons];
        nextLessons[i] = {
          period: lesson.period,
          start: startInput.value || '',
          end: endInput.value || '',
        };
        if (!validateTime(startInput.value) || !validateTime(endInput.value)) {
          setStatus('lessons', 'Please use HH:MM format.', 'error');
        } else {
          localLessons = nextLessons;
          saveTimetableLessons(localLessons);
          refreshTimeRow();
          setStatus('lessons', 'Time updated.', 'success');
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

  const gridTable = createEl('table', { className: 'table table-bordered table-sm timetable-grid mb-0' });
  const gridThead = createEl('thead');
  const gridTbody = createEl('tbody');
  gridTable.append(gridThead, gridTbody);
  status.schedule = createEl('div', { className: 'small text-muted pt-1', text: '' });

  const selectRefs = new Map();

  const refreshTimeRow = () => {
    gridThead.replaceChildren();
    const numberRow = createEl('tr');
    numberRow.append(createEl('th', { text: '' }));
    for (let i = 0; i < LESSONS_COUNT; i += 1) {
      numberRow.append(createEl('th', { className: 'text-center text-muted', text: `${i + 1}` }));
    }

    const timeRow = createEl('tr');
    timeRow.append(createEl('th', { className: 'text-muted small', text: 'Time' }));
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
  };

  const handleCellChange = (dayKey, index, selectEl, summaryEl) => {
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
    setStatus('schedule', 'Timetable updated.', 'success');
  };

  const refreshGrid = () => {
    gridTbody.replaceChildren();
    selectRefs.clear();
    TIMETABLE_DAY_ORDER.forEach(({ key, label }) => {
      const row = createEl('tr');
      row.append(createEl('th', { className: 'text-muted', text: label }));
      const selects = [];
      for (let i = 0; i < LESSONS_COUNT; i += 1) {
        const cell = createEl('td');
        const select = createEl('select', {
          className: 'form-select form-select-sm timetable-select',
          attrs: { multiple: 'multiple', 'aria-label': `${label} lesson ${i + 1}` },
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
        select.title = summaryText;
        select.addEventListener('change', () => handleCellChange(key, i, select, summary));
        cell.append(select, summary);
        row.append(cell);
        selects.push({ selectEl: select, summaryEl: summary });
      }
      selectRefs.set(key, selects);
      gridTbody.append(row);
    });
  };

  gridBody.append(
    createEl('h4', { className: 'h5 mb-1', text: 'Weekly schedule' }),
    createEl('p', {
      className: 'text-muted small mb-0',
      text: 'Select subjects for each lesson. Use multi-select (Ctrl/Cmd) to combine subjects with "+" in the view.',
    }),
    gridTable,
    status.schedule,
  );

  subjectsBody.append(
    createEl('h4', { className: 'h5 mb-1', text: 'Subjects' }),
    createEl('p', {
      className: 'text-muted small mb-0',
      text: 'Manage the list of available subjects. The list is sorted alphabetically.',
    }),
    subjectFormRow,
    subjectsList,
    status.subjects,
  );

  lessonsBody.append(
    createEl('h4', { className: 'h5 mb-1', text: 'Lesson times' }),
    createEl('p', {
      className: 'text-muted small mb-0',
      text: 'Edit start and end times for each lesson (HH:MM).',
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

  const update = ({ subjects: nextSubjects = [], lessons: nextLessons = [], schedule: nextSchedule = {} } = {}) => {
    localSubjects = [...nextSubjects];
    localLessons = cloneLessons(nextLessons);
    localSchedule = cloneSchedule(nextSchedule);
    refreshSubjectsList();
    refreshLessons();
    refreshTimeRow();
    refreshGrid();
    setStatus('subjects', '');
    setStatus('lessons', '');
    setStatus('schedule', '');
  };

  refreshSubjectsList();
  refreshLessons();
  refreshTimeRow();
  refreshGrid();

  return {
    element: overlay,
    open,
    close,
    update,
  };
};
