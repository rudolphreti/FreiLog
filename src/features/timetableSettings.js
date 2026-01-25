import {
  saveTimetableLessons,
  saveTimetableSchedule,
  saveTimetableSubjectColors,
  saveTimetableSubjects,
} from '../db/dbRepository.js';
import { createEl } from '../ui/dom.js';
import { UI_LABELS } from '../ui/labels.js';
import {
  DEFAULT_TIMETABLE_SUBJECT_COLORS,
  TIMETABLE_DAY_ORDER,
  buildSubjectKey,
  formatSubjectsList,
  getAccessibleTextColor,
  getSubjectColor,
  normalizeSubjectName,
  normalizeTimetableSubjectColors,
} from '../utils/timetable.js';

const MAX_SUBJECT_LENGTH = 80;
const MIN_SUBJECT_INPUT_PX = 100;
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

const hasSubjectKey = (subjects, key, excludeKey = '') =>
  Array.isArray(subjects)
    ? subjects.some((item) => {
        const itemKey = buildSubjectKey(item);
        if (!itemKey || (excludeKey && itemKey === excludeKey)) {
          return false;
        }
        return itemKey === key;
      })
    : false;

const renameSubjectInSchedule = (schedule, fromValue, toValue) => {
  const fromKey = buildSubjectKey(fromValue);
  const toName = normalizeSubjectName(toValue);
  const toKey = buildSubjectKey(toName);

  if (!fromKey || !toKey) {
    return cloneSchedule(schedule);
  }

  const updatedSchedule = cloneSchedule(schedule);
  TIMETABLE_DAY_ORDER.forEach(({ key }) => {
    updatedSchedule[key] = (updatedSchedule[key] || []).map((cell) => {
      if (!Array.isArray(cell)) {
        return [];
      }
      const nextCell = [];
      cell.forEach((entry) => {
        const entryKey = buildSubjectKey(entry);
        if (!entryKey || entryKey === fromKey) {
          if (!hasSubjectKey(nextCell, toKey)) {
            nextCell.push(toName);
          }
          return;
        }
        if (!hasSubjectKey(nextCell, entryKey)) {
          nextCell.push(entry);
        }
      });
      return nextCell;
    });
  });

  return updatedSchedule;
};

const removeSubjectFromSchedule = (schedule, subjectValue) => {
  const targetKey = buildSubjectKey(subjectValue);
  const updatedSchedule = cloneSchedule(schedule);
  if (!targetKey) {
    return updatedSchedule;
  }

  TIMETABLE_DAY_ORDER.forEach(({ key }) => {
    updatedSchedule[key] = (updatedSchedule[key] || []).map((cell) =>
      Array.isArray(cell) ? cell.filter((entry) => buildSubjectKey(entry) !== targetKey) : [],
    );
  });

  return updatedSchedule;
};

const buildSubjectOption = (subject, isMissing = false) =>
  createEl('option', {
    attrs: { value: subject },
    text: isMissing ? `${subject} (entfernt)` : subject,
  });

export const createTimetableSettingsView = ({
  subjects = [],
  subjectColors = {},
  lessons = [],
  schedule = {},
} = {}) => {
  let localSubjects = [...subjects];
  let localSubjectColors = normalizeTimetableSubjectColors(
    subjectColors,
    localSubjects,
    DEFAULT_TIMETABLE_SUBJECT_COLORS,
  );
  let localLessons = cloneLessons(lessons);
  let localSchedule = cloneSchedule(schedule);
  let isOpen = false;
  let isEditing = false;
  let subjectInputs = [];
  let subjectColorInputs = [];
  let subjectColorClearButtons = [];
  let lessonInputs = [];
  let deleteSubjectName = '';
  let deleteSubjectFeedbackMessage = '';
  let deleteSubjectFeedbackState = 'idle';
  let deleteSubjectConfirmationTarget = '';
  let deleteSubjectConfirmationLabel = '';

  const status = {
    subjects: null,
    lessons: null,
    schedule: null,
  };

  const syncSubjectColors = (nextColors = localSubjectColors) => {
    localSubjectColors = normalizeTimetableSubjectColors(
      nextColors,
      localSubjects,
      DEFAULT_TIMETABLE_SUBJECT_COLORS,
    );
    saveTimetableSubjectColors(localSubjectColors);
  };

  const getColorForSubject = (subject) =>
    getSubjectColor(subject, localSubjectColors, DEFAULT_TIMETABLE_SUBJECT_COLORS);

  const NEUTRAL_COLOR = '#e2e8f0';

  const buildColorStyle = (subject) => {
    const color = getColorForSubject(subject);
    const displayColor = color || NEUTRAL_COLOR;
    const textColor = getAccessibleTextColor(displayColor);
    return { color, displayColor, textColor, hasColor: Boolean(color) };
  };

  const autosizeSubjectInput = (inputEl) => {
    if (!inputEl) return;
    const valueLength = (inputEl.value || '').length;
    const desiredCh = Math.max(valueLength + 1, 1);
    inputEl.style.width = `${desiredCh}ch`;
    inputEl.style.minWidth = `${MIN_SUBJECT_INPUT_PX}px`;
  };

  const overlay = createEl('div', {
    className: 'timetable-overlay',
    attrs: { 'aria-hidden': 'true' },
  });
  const panel = createEl('div', { className: 'timetable-overlay__panel' });

  const header = createEl('div', { className: 'timetable-overlay__header' });
  const title = createEl('h3', { className: 'h4 mb-0', text: UI_LABELS.timetable });
  const closeButton = createEl('button', {
    className: 'btn-close timetable-overlay__close',
    attrs: { type: 'button', 'aria-label': 'Stundenplan schließen' },
  });
  header.append(title, closeButton);

  const content = createEl('div', { className: 'timetable-overlay__content d-flex flex-column gap-3' });

  const subjectsCard = createEl('section', { className: 'card border-0' });
  const subjectsBody = createEl('div', { className: 'card-body d-flex flex-column gap-3' });
  subjectsCard.append(subjectsBody);

  const lessonsCard = createEl('section', { className: 'card border-0' });
  const lessonsBody = createEl('div', { className: 'card-body d-flex flex-column gap-3' });
  lessonsCard.append(lessonsBody);

  const cautionCard = createEl('section', { className: 'card border-0' });
  const cautionBody = createEl('div', { className: 'card-body d-flex flex-column gap-3' });
  cautionCard.append(cautionBody);

  const gridCard = createEl('section', { className: 'card border-0' });
  const gridBody = createEl('div', { className: 'card-body d-flex flex-column gap-3' });
  gridCard.append(gridBody);

  content.append(gridCard, subjectsCard, lessonsCard, cautionCard);
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

  const subjectsList = createEl('div', {
    className: 'd-flex flex-wrap align-items-stretch gap-2 timetable-subject-list-inline',
  });
  const subjectInput = createEl('input', {
    className: 'form-control timetable-subject-name-input',
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

  const renderDeleteSubjectFeedback = () => {
    if (!deleteSubjectFeedback) {
      return;
    }
    deleteSubjectFeedback.textContent = deleteSubjectFeedbackMessage;
    deleteSubjectFeedback.classList.toggle('d-none', !deleteSubjectFeedbackMessage);
    deleteSubjectFeedback.classList.toggle('text-success', deleteSubjectFeedbackState === 'success');
    deleteSubjectFeedback.classList.toggle('text-danger', deleteSubjectFeedbackState === 'error');
    deleteSubjectFeedback.classList.toggle('text-muted', deleteSubjectFeedbackState === 'idle');
  };

  const resetDeleteSubjectFeedback = () => {
    deleteSubjectFeedbackMessage = '';
    deleteSubjectFeedbackState = 'idle';
    renderDeleteSubjectFeedback();
  };

  const handleSubjectColorChange = (subject, inputEl, clearButton) => {
    const key = buildSubjectKey(subject);
    if (!key) {
      return;
    }
    const nextColor = typeof inputEl?.value === 'string' ? inputEl.value.trim() : '';
    if (!/^#([0-9a-fA-F]{6})$/.test(nextColor)) {
      const fallback = getColorForSubject(subject);
      const safeColor = fallback || NEUTRAL_COLOR;
      if (inputEl) {
        inputEl.value = safeColor;
      }
      clearButton?.classList.toggle('d-none', !fallback);
      setStatus('subjects', 'Bitte eine gültige Farbe (#RRGGBB) wählen.', 'error');
      return;
    }
    const updatedColors = { ...localSubjectColors, [key]: nextColor };
    syncSubjectColors(updatedColors);
    refreshGridOptions();
    clearButton?.classList.remove('d-none');
    setStatus('subjects', 'Farbe aktualisiert.', 'success');
  };

  const handleClearSubjectColor = (subject, inputEl, clearButton) => {
    const key = buildSubjectKey(subject);
    if (!key) {
      return;
    }
    const updatedColors = { ...localSubjectColors };
    delete updatedColors[key];
    syncSubjectColors(updatedColors);
    if (inputEl) {
      inputEl.value = NEUTRAL_COLOR;
    }
    clearButton?.classList.add('d-none');
    refreshGridOptions();
    setStatus('subjects', 'Farbe entfernt.', 'success');
  };

  const handleRenameSubject = (originalSubject, inputEl) => {
    const originalKey = buildSubjectKey(originalSubject);
    const nextValue = normalizeSubjectName(inputEl.value);
    const nextKey = buildSubjectKey(nextValue);

    if (!originalKey) {
      inputEl.value = '';
      autosizeSubjectInput(inputEl);
      return;
    }
    if (!nextKey) {
      inputEl.value = originalSubject;
      autosizeSubjectInput(inputEl);
      setStatus('subjects', 'Bitte einen Fachnamen eingeben.', 'error');
      return;
    }
    if (nextValue.length > MAX_SUBJECT_LENGTH) {
      inputEl.value = originalSubject;
      autosizeSubjectInput(inputEl);
      setStatus('subjects', `Maximale Länge: ${MAX_SUBJECT_LENGTH} Zeichen.`, 'error');
      return;
    }
    if (hasSubjectKey(localSubjects, nextKey, originalKey)) {
      inputEl.value = originalSubject;
      autosizeSubjectInput(inputEl);
      setStatus('subjects', 'Fach ist bereits vorhanden.', 'error');
      return;
    }
    if (normalizeSubjectName(originalSubject) === nextValue) {
      inputEl.value = originalSubject;
      autosizeSubjectInput(inputEl);
      return;
    }

    const updatedSubjects = [
      ...localSubjects.filter((item) => buildSubjectKey(item) !== originalKey),
      nextValue,
    ].sort((a, b) => a.localeCompare(b, 'de', { sensitivity: 'base' }));
    const updatedSchedule = renameSubjectInSchedule(localSchedule, originalSubject, nextValue);
    const updatedColors = { ...localSubjectColors };
    const existingColor = updatedColors[originalKey];
    if (existingColor) {
      updatedColors[nextKey] = existingColor;
    }
    delete updatedColors[originalKey];

    localSubjects = updatedSubjects;
    localSubjectColors = normalizeTimetableSubjectColors(
      updatedColors,
      localSubjects,
      DEFAULT_TIMETABLE_SUBJECT_COLORS,
    );
    localSchedule = updatedSchedule;
    saveTimetableSubjects(localSubjects);
    saveTimetableSubjectColors(localSubjectColors);
    saveTimetableSchedule(localSchedule);
    refreshSubjectsList();
    refreshGridOptions();
    setStatus('subjects', 'Fach umbenannt.', 'success');
    setStatus('schedule', 'Stundenplan aktualisiert.', 'success');
    autosizeSubjectInput(inputEl);
  };

  const refreshSubjectsList = () => {
    subjectInputs = [];
    subjectColorInputs = [];
    subjectColorClearButtons = [];
    subjectsList.replaceChildren();
    if (!localSubjects.length) {
      subjectsList.append(
        createEl('div', { className: 'text-muted small', text: 'Noch keine Fächer hinzugefügt.' }),
      );
      applyEditingState();
      return;
    }

    localSubjects.forEach((subject) => {
      const subjectRow = createEl('div', {
        className: 'timetable-subject-row d-flex flex-wrap gap-2 align-items-center',
      });
      const { displayColor, hasColor } = buildColorStyle(subject);
      const colorInput = createEl('input', {
        className: 'form-control form-control-color timetable-color-input',
        attrs: {
          type: 'color',
          value: displayColor,
          'aria-label': `Farbe für ${subject}`,
        },
      });
      const clearColorButton = createEl('button', {
        className: 'btn btn-outline-secondary btn-sm timetable-color-clear',
        attrs: {
          type: 'button',
          title: 'Farbe entfernen',
          'aria-label': `Farbe für ${subject} entfernen`,
        },
        children: [createEl('span', { text: '🗑️', attrs: { 'aria-hidden': 'true' } })],
      });
      clearColorButton.classList.toggle('d-none', !hasColor);

      const input = createEl('input', {
        className: 'form-control timetable-subject-name-input',
        attrs: {
          type: 'text',
          value: subject,
          'aria-label': `Fach ${subject}`,
        },
      });
      autosizeSubjectInput(input);

      const colorChangeHandler = () => handleSubjectColorChange(subject, colorInput, clearColorButton);
      colorInput.addEventListener('input', () => {});
      colorInput.addEventListener('change', colorChangeHandler);
      clearColorButton.addEventListener('click', () =>
        handleClearSubjectColor(subject, colorInput, clearColorButton),
      );

      input.addEventListener('blur', () => handleRenameSubject(subject, input));
      input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          handleRenameSubject(subject, input);
        }
        if (event.key === 'Escape') {
          input.value = subject;
          autosizeSubjectInput(input);
        }
      });
      input.addEventListener('input', () => autosizeSubjectInput(input));

      subjectInputs.push(input);
      subjectColorInputs.push(colorInput);
      subjectColorClearButtons.push(clearColorButton);
      subjectRow.append(input, colorInput, clearColorButton);
      subjectsList.append(subjectRow);
    });
    applyEditingState();
  };

  const handleAddSubject = () => {
    const value = normalizeSubjectName(subjectInput.value);
    const valueKey = buildSubjectKey(value);
    if (!valueKey) {
      setStatus('subjects', 'Bitte einen Fachnamen eingeben.', 'error');
      return;
    }
    if (value.length > MAX_SUBJECT_LENGTH) {
      setStatus('subjects', `Maximale Länge: ${MAX_SUBJECT_LENGTH} Zeichen.`, 'error');
      return;
    }
    if (hasSubjectKey(localSubjects, valueKey)) {
      setStatus('subjects', 'Fach ist bereits vorhanden.', 'error');
      return;
    }
    localSubjects = [...localSubjects, value].sort((a, b) =>
      a.localeCompare(b, 'de', { sensitivity: 'base' }),
    );
    localSubjectColors = normalizeTimetableSubjectColors(
      localSubjectColors,
      localSubjects,
      DEFAULT_TIMETABLE_SUBJECT_COLORS,
    );
    saveTimetableSubjects(localSubjects);
    saveTimetableSubjectColors(localSubjectColors);
    refreshSubjectsList();
    refreshGridOptions();
    subjectInput.value = '';
    autosizeSubjectInput(subjectInput);
    setStatus('subjects', 'Fach hinzugefügt.', 'success');
  };

  addSubjectButton.addEventListener('click', handleAddSubject);
  subjectInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      handleAddSubject();
    }
  });
  subjectInput.addEventListener('input', () => autosizeSubjectInput(subjectInput));
  autosizeSubjectInput(subjectInput);

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

  const buildColorSegments = (subjectsForCell) => {
    const wrapper = createEl('div', { className: 'timetable-cell-visual' });
    if (!subjectsForCell.length) {
      wrapper.append(
        createEl('div', {
          className: 'timetable-cell-visual__segment timetable-cell-visual__segment--empty',
          text: '—',
        }),
      );
      return wrapper;
    }
    subjectsForCell.forEach((subject) => {
      const { displayColor, textColor } = buildColorStyle(subject);
      wrapper.append(
        createEl('div', {
          className: 'timetable-cell-visual__segment',
          attrs: {
            style: `--segment-color:${displayColor};--segment-text:${textColor};`,
            title: subject,
          },
          children: [
            createEl('span', { className: 'timetable-cell-visual__label', text: subject }),
          ],
        }),
      );
    });
    return wrapper;
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
        const preview = buildColorSegments(daySchedule[periodIndex] || []);
        summaryNode.replaceChildren(...preview.children);
      });
    });
  };

  const handleCellChange = (dayKey, index, selectEl, summaryEl, visualContainer) => {
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
    if (visualContainer) {
      const preview = buildColorSegments(selected);
      visualContainer.replaceChildren(...preview.children);
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
        const colorPreview = buildColorSegments(cellValues);
        const visualWrapper = createEl('div', {
          className: 'timetable-cell-visual-wrapper',
          children: [colorPreview],
        });
        select.title = summaryText;
        select.addEventListener('change', () =>
          handleCellChange(key, i, select, summary, visualWrapper),
        );
        const selectWrapper = createEl('div', {
          className: 'timetable-select-wrapper mt-2',
          children: [select],
        });
        cell.append(visualWrapper, selectWrapper, summary);
        row.append(cell);
        selects.push({ selectEl: select, summaryEl: summary, visualWrapper });
        daySummaryRefs.set(i, visualWrapper);
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
    subjectInputs.forEach((input) => {
      input.disabled = disable;
    });
    subjectColorInputs.forEach((input) => {
      input.disabled = disable;
    });
    subjectColorClearButtons.forEach((button) => {
      button.disabled = disable;
    });
    lessonInputs.forEach((input) => {
      input.disabled = disable;
    });
    selectRefs.forEach((rows) => {
      rows.forEach(({ selectEl, summaryEl, visualWrapper }) => {
        selectEl.closest('.timetable-select-wrapper').classList.toggle('d-none', disable);
        selectEl.disabled = disable;
        if (summaryEl) {
          summaryEl.classList.toggle('d-none', !disable);
        }
        if (visualWrapper) {
          visualWrapper.classList.toggle('timetable-cell-visual--inactive', !disable);
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
    subjectFormRow,
    subjectsList,
    status.subjects,
  );

  lessonsBody.append(
    createEl('h4', { className: 'h5 mb-1', text: 'Stundenzeiten' }),
    lessonsTable,
    status.lessons,
  );

  const deleteSubjectInput = createEl('input', {
    className: 'form-control',
    attrs: {
      type: 'text',
      placeholder: 'Name des Fachs',
      'aria-label': 'Name des Fachs',
    },
  });
  const deleteSubjectFeedback = createEl('div', { className: 'small d-none' });
  const deleteSubjectButton = createEl('button', {
    className: 'btn btn-outline-danger d-inline-flex align-items-center gap-2',
    attrs: { type: 'button' },
    children: [createEl('span', { text: '⚠️' }), createEl('span', { text: 'Löschen…' })],
  });

  cautionBody.append(
    createEl('h4', { className: 'h5 mb-1 text-danger', text: 'Vorsicht' }),
    createEl('p', {
      className: 'text-muted small mb-0',
      text: 'Ein Fach zu löschen entfernt es aus der Liste und aus allen Stundenplan-Einträgen.',
    }),
    createEl('div', {
      className: 'd-flex flex-column gap-2',
      children: [
        createEl('label', {
          className: 'form-label mb-0',
          attrs: { for: 'delete-subject-name' },
          text: 'Fachname zum Löschen',
        }),
        Object.assign(deleteSubjectInput, { id: 'delete-subject-name' }),
      ],
    }),
    deleteSubjectButton,
    deleteSubjectFeedback,
  );

  const deleteSubjectConfirmDialog = createEl('div', {
    className: 'class-settings-confirm d-none',
    attrs: {
      role: 'dialog',
      'aria-modal': 'true',
      'aria-labelledby': 'delete-subject-confirm-title',
      'aria-describedby': 'delete-subject-confirm-message',
      'aria-hidden': 'true',
      tabIndex: '-1',
    },
  });
  const deleteSubjectConfirmPanel = createEl('div', {
    className: 'class-settings-confirm__panel',
  });
  const deleteSubjectConfirmTitle = createEl('h4', {
    className: 'h6 mb-2 text-danger',
    attrs: { id: 'delete-subject-confirm-title' },
    text: 'Warnung',
  });
  const deleteSubjectConfirmMessage = createEl('p', {
    className: 'mb-2',
    attrs: { id: 'delete-subject-confirm-message' },
    text: 'Beim Löschen dieses Fachs werden alle zugehörigen Stundenplan-Einträge entfernt.',
  });
  const deleteSubjectConfirmName = createEl('p', {
    className: 'fw-semibold mb-3 text-danger',
  });
  const deleteSubjectConfirmActions = createEl('div', {
    className: 'class-settings-confirm__actions',
  });
  const deleteSubjectConfirmSubmit = createEl('button', {
    className: 'btn btn-danger',
    attrs: { type: 'button' },
    text: 'Ich bin mir des Risikos bewusst und möchte löschen',
  });
  const deleteSubjectConfirmCancel = createEl('button', {
    className: 'btn btn-outline-secondary',
    attrs: { type: 'button' },
    text: 'Abbrechen',
  });
  deleteSubjectConfirmActions.append(deleteSubjectConfirmSubmit, deleteSubjectConfirmCancel);
  deleteSubjectConfirmPanel.append(
    deleteSubjectConfirmTitle,
    deleteSubjectConfirmMessage,
    deleteSubjectConfirmName,
    deleteSubjectConfirmActions,
  );
  deleteSubjectConfirmDialog.append(deleteSubjectConfirmPanel);
  overlay.append(deleteSubjectConfirmDialog);

  const updateDeleteConfirmationDialog = () => {
    const hasLabel = Boolean(deleteSubjectConfirmationLabel);
    deleteSubjectConfirmName.textContent = hasLabel ? `„${deleteSubjectConfirmationLabel}“` : '';
    deleteSubjectConfirmName.classList.toggle('d-none', !hasLabel);
  };

  const hideDeleteSubjectConfirmation = () => {
    deleteSubjectConfirmDialog.classList.add('d-none');
    deleteSubjectConfirmDialog.setAttribute('aria-hidden', 'true');
  };

  const clearDeleteSubjectConfirmation = () => {
    deleteSubjectConfirmationTarget = '';
    deleteSubjectConfirmationLabel = '';
  };

  const closeDeleteSubjectConfirmation = () => {
    hideDeleteSubjectConfirmation();
    clearDeleteSubjectConfirmation();
  };

  const showDeleteSubjectConfirmation = () => {
    updateDeleteConfirmationDialog();
    deleteSubjectConfirmDialog.classList.remove('d-none');
    deleteSubjectConfirmDialog.setAttribute('aria-hidden', 'false');
    window.requestAnimationFrame(() => {
      deleteSubjectConfirmSubmit?.focus();
    });
  };

  const performDeleteSubject = (normalizedTarget) => {
    if (!normalizedTarget) {
      return;
    }
    const remainingSubjects = localSubjects.filter(
      (subject) => buildSubjectKey(subject) !== normalizedTarget,
    );
    const targetLabel =
      localSubjects.find((subject) => buildSubjectKey(subject) === normalizedTarget) || '';
    const updatedColors = { ...localSubjectColors };
    delete updatedColors[normalizedTarget];
    localSubjects = remainingSubjects;
    localSubjectColors = normalizeTimetableSubjectColors(
      updatedColors,
      localSubjects,
      DEFAULT_TIMETABLE_SUBJECT_COLORS,
    );
    localSchedule = removeSubjectFromSchedule(localSchedule, normalizedTarget);
    saveTimetableSubjects(localSubjects);
    saveTimetableSubjectColors(localSubjectColors);
    saveTimetableSchedule(localSchedule);
    refreshSubjectsList();
    refreshGridOptions();
    deleteSubjectName = '';
    deleteSubjectInput.value = '';
    deleteSubjectFeedbackMessage = targetLabel
      ? `„${targetLabel}“ wurde gelöscht.`
      : 'Fach gelöscht.';
    deleteSubjectFeedbackState = 'success';
    renderDeleteSubjectFeedback();
    setStatus('subjects', 'Fach entfernt.', 'success');
    setStatus('schedule', 'Stundenplan aktualisiert.', 'success');
  };

  const handleDeleteSubject = () => {
    const normalizedTarget = buildSubjectKey(deleteSubjectName);
    if (!normalizedTarget) {
      deleteSubjectFeedbackMessage = 'Bitte gib einen gültigen Fachnamen ein.';
      deleteSubjectFeedbackState = 'error';
      renderDeleteSubjectFeedback();
      return;
    }
    const existingSubject = localSubjects.find(
      (subject) => buildSubjectKey(subject) === normalizedTarget,
    );
    if (!existingSubject) {
      deleteSubjectFeedbackMessage = 'Kein Fach mit diesem Namen gefunden.';
      deleteSubjectFeedbackState = 'error';
      renderDeleteSubjectFeedback();
      return;
    }
    deleteSubjectConfirmationTarget = normalizedTarget;
    deleteSubjectConfirmationLabel = existingSubject;
    resetDeleteSubjectFeedback();
    showDeleteSubjectConfirmation();
  };

  deleteSubjectInput.addEventListener('input', (event) => {
    deleteSubjectName = event.target.value;
    resetDeleteSubjectFeedback();
  });
  deleteSubjectInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      handleDeleteSubject();
    }
  });
  deleteSubjectButton.addEventListener('click', handleDeleteSubject);
  deleteSubjectConfirmCancel.addEventListener('click', closeDeleteSubjectConfirmation);
  deleteSubjectConfirmSubmit.addEventListener('click', () => {
    performDeleteSubject(deleteSubjectConfirmationTarget);
    closeDeleteSubjectConfirmation();
  });
  deleteSubjectConfirmDialog.addEventListener('click', (event) => {
    if (event.target === deleteSubjectConfirmDialog) {
      closeDeleteSubjectConfirmation();
    }
  });
  deleteSubjectConfirmDialog.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeDeleteSubjectConfirmation();
    }
  });

  const open = () => {
    if (isOpen) return;
    overlay.classList.add('is-open');
    overlay.setAttribute('aria-hidden', 'false');
    document.body.classList.add('timetable-overlay-open');
    isOpen = true;
  };

  const close = () => {
    closeDeleteSubjectConfirmation();
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
    subjectColors: nextSubjectColors = {},
    lessons: nextLessons = [],
    schedule: nextSchedule = {},
  } = {}) => {
    localSubjects = [...nextSubjects];
    localSubjectColors = normalizeTimetableSubjectColors(
      nextSubjectColors,
      localSubjects,
      DEFAULT_TIMETABLE_SUBJECT_COLORS,
    );
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
    deleteSubjectName = '';
    deleteSubjectInput.value = '';
    closeDeleteSubjectConfirmation();
    resetDeleteSubjectFeedback();
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
