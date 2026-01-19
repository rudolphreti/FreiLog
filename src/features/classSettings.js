import {
  saveClassChildren,
  saveClassCourses,
  saveClassEntlassung,
  saveClassProfileFields,
} from '../db/dbRepository.js';
import { normalizeChildName, normalizeCourses, normalizeEntlassung } from '../db/dbSchema.js';
import { createEl } from '../ui/dom.js';
import { UI_LABELS } from '../ui/labels.js';
import { todayYmd } from '../utils/date.js';
import { debounce } from '../utils/debounce.js';
import { TIMETABLE_DAY_ORDER } from '../utils/timetable.js';

const SEPARATORS = [' ', '-', '\u2010', "'", '’', 'ʼ', '.'];
const isLatinLetter = (ch) => /\p{Letter}/u.test(ch) && /\p{Script=Latin}/u.test(ch);
const isCombiningMark = (ch) => /\p{M}/u.test(ch);
const isSeparator = (ch) => SEPARATORS.includes(ch);

const COURSE_ICON_OPTIONS = [
  '🎨',
  '🎵',
  '🎭',
  '⚽',
  '🤸',
  '📚',
  '🧩',
  '🧪',
  '🎯',
  '🧘',
  '🎤',
  '🧵',
];

const normalizeNameInput = (value) => {
  if (typeof value !== 'string') {
    return '';
  }
  return value
    .normalize('NFC')
    .trim()
    .replace(/\s+/g, ' ');
};

const getFirstLetter = (text) => {
  for (let i = 0; i < text.length; i += 1) {
    if (isLatinLetter(text[i])) {
      return text[i];
    }
  }
  return '';
};

const hasInvalidCharacters = (text) => !/^[\p{Script=Latin}\p{M}\s\-\u2010'’ʼ.]*$/u.test(text);

const findSeparatorIssues = (text) => {
  let previousWasSeparator = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (!isSeparator(ch)) {
      previousWasSeparator = false;
      continue;
    }

    if (i === 0 || i === text.length - 1) {
      return true;
    }
    if (previousWasSeparator) {
      return true;
    }
    if (ch === '.') {
      const prevChar = text[i - 1];
      const nextChar = text[i + 1];
      if (!isLatinLetter(prevChar)) {
        return true;
      }
      if (nextChar && nextChar !== ' ' && !isSeparator(nextChar) && !isLatinLetter(nextChar)) {
        return true;
      }
      if (nextChar === '.') {
        return true;
      }
    }

    previousWasSeparator = true;
  }
  return false;
};

const validateParts = (parts) => {
  const errors = [];
  if (parts.length > 6) {
    errors.push('Name darf höchstens 6 Teile haben.');
  }

  parts.forEach((part) => {
    if (!part) {
      errors.push('Ungültige Trennzeichen im Namen.');
      return;
    }
    const first = getFirstLetter(part);
    if (!first || !/\p{Lu}/u.test(first)) {
      errors.push('Jeder Teil muss mit einem Großbuchstaben beginnen.');
    }
    const segments = part.split(/[-\u2010'’ʼ]/);
    segments.forEach((segment) => {
      const initial = getFirstLetter(segment);
      if (segment && !(/\p{Lu}/u.test(initial))) {
        errors.push('Jeder Teil muss mit einem Großbuchstaben beginnen.');
      }
    });
  });

  return errors;
};

const validateName = (rawName, otherNames = []) => {
  const normalized = normalizeNameInput(rawName);
  const errors = [];

  if (!normalized) {
    errors.push('Name darf nicht leer sein.');
    return { normalized, errors };
  }

  if (normalized.length > 100) {
    errors.push('Name darf höchstens 100 Zeichen haben.');
  }

  if (hasInvalidCharacters(normalized)) {
    errors.push('Only Latin letters are allowed.');
  }

  if (findSeparatorIssues(normalized)) {
    errors.push('Invalid separator usage.');
  }

  const parts = normalized.split(' ');
  errors.push(...validateParts(parts));

  const firstLetter = getFirstLetter(normalized);
  if (!firstLetter || !/\p{Lu}/u.test(firstLetter)) {
    errors.push('Name must start with a capital letter.');
  }

  const canonical = normalized.toLocaleLowerCase();
  if (canonical && otherNames.includes(canonical)) {
    errors.push('Duplicate name already exists.');
  }

  return { normalized, errors };
};

const createFormGroup = ({ id, label, control }) => {
  const wrapper = createEl('div', { className: 'd-flex flex-column gap-1' });
  const labelEl = createEl('label', {
    className: 'form-label mb-0 small text-muted',
    attrs: { for: id },
    text: label,
  });
  wrapper.append(labelEl, control);
  return wrapper;
};

const buildAccordionItem = ({ id, title, content, accordionId, defaultOpen = false }) => {
  const item = createEl('div', { className: 'accordion-item' });
  const headerId = `${id}-heading`;
  const collapseId = `${id}-collapse`;

  const header = createEl('h2', {
    className: 'accordion-header',
    attrs: { id: headerId },
  });
  const toggle = createEl('button', {
    className: `accordion-button${defaultOpen ? '' : ' collapsed'}`,
    attrs: {
      type: 'button',
      'data-bs-toggle': 'collapse',
      'data-bs-target': `#${collapseId}`,
      'aria-expanded': defaultOpen ? 'true' : 'false',
      'aria-controls': collapseId,
    },
    text: title,
  });
  header.append(toggle);

  const collapse = createEl('div', {
    className: `accordion-collapse collapse${defaultOpen ? ' show' : ''}`,
    attrs: {
      id: collapseId,
      'aria-labelledby': headerId,
      'data-bs-parent': `#${accordionId}`,
    },
  });
  const body = createEl('div', { className: 'accordion-body' });
  body.append(content);
  collapse.append(body);

  item.append(header, collapse);
  return {
    element: item,
    collapse,
  };
};

const createRowState = (counter) => ({
  id: `class-row-${counter}`,
  name: '',
  originalName: '',
  note: '',
  persisted: false,
  validationMessages: [],
});

export const createClassSettingsView = ({ profile = {}, children = [] } = {}) => {
  let rowCounter = 0;
  let rows = [];
  const childButtonRefs = new Map();
  let toastContainer = null;
  let activeChildId = '';
  let childFormErrors = [];
  let childFormName = '';
  let childFormNote = '';
  let deleteChildName = '';
  let deleteChildFeedbackMessage = '';
  let deleteChildFeedbackState = 'idle';
  let deleteChildConfirmationTarget = '';
  let deleteChildConfirmationLabel = '';
  let entlassungState = normalizeEntlassung({}, []);
  let coursesState = normalizeCourses([], []);
  let emojiPickerReady = false;
  let emojiPickerPromise = null;
  let courseIdCounter = 0;
  const courseCardRefs = new Map();
  const entlassungRegularErrors = {};
  const entlassungSpecialErrors = {};

  const overlay = createEl('div', {
    className: 'class-settings-overlay',
    attrs: { 'aria-hidden': 'true' },
  });
  const panel = createEl('div', { className: 'class-settings-overlay__panel' });
  const header = createEl('div', { className: 'class-settings-overlay__header' });
  const title = createEl('h3', { className: 'h4 mb-0', text: UI_LABELS.classSettings });
  const closeButton = createEl('button', {
    className: 'btn-close class-settings-overlay__close',
    attrs: { type: 'button', 'aria-label': 'Schließen' },
  });
  header.append(title, closeButton);

  const content = createEl('div', { className: 'class-settings-overlay__content' });

  const accordionId = 'classSettingsAccordion';
  const accordion = createEl('div', {
    className: 'accordion',
    attrs: { id: accordionId },
  });

  const teacherNameInput = createEl('input', {
    className: 'form-control',
    attrs: { type: 'text', id: 'class-teacher-name', placeholder: 'z. B. Frau Müller' },
  });
  const nameInput = createEl('input', {
    className: 'form-control',
    attrs: { type: 'text', id: 'class-name', placeholder: 'z. B. Sonnengruppe' },
  });
  const badgeInput = createEl('input', {
    className: 'form-control',
    attrs: { type: 'text', id: 'class-badge', placeholder: 'z. B. 🐻' },
  });
  const mottoInput = createEl('input', {
    className: 'form-control',
    attrs: { type: 'text', id: 'class-motto', placeholder: 'z. B. Gemeinsam stark' },
  });
  const notesInput = createEl('textarea', {
    className: 'form-control',
    attrs: { id: 'class-notes', rows: '3', placeholder: 'Weitere Hinweise…' },
  });

  const generalContent = createEl('div', {
    className: 'd-flex flex-column gap-3',
    children: [
      createFormGroup({ id: 'class-teacher-name', label: 'Meine Name', control: teacherNameInput }),
      createFormGroup({ id: 'class-name', label: 'Klassenname', control: nameInput }),
      createFormGroup({ id: 'class-badge', label: 'Klassenschild', control: badgeInput }),
      createFormGroup({ id: 'class-motto', label: 'Klassenmotto', control: mottoInput }),
      createFormGroup({ id: 'class-notes', label: 'Notizen', control: notesInput }),
    ],
  });

  const generalItem = buildAccordionItem({
    id: 'class-general',
    title: 'Allgemein',
    content: generalContent,
    accordionId,
    defaultOpen: true,
  });

  const addRowButton = createEl('button', {
    className: 'btn btn-outline-primary btn-sm d-inline-flex align-items-center gap-2',
    attrs: { type: 'button' },
    children: [
      createEl('span', { text: '＋' }),
      createEl('span', { text: 'Neues Kind hinzufügen' }),
    ],
  });
  const childrenHeader = createEl('div', {
    className: 'd-flex justify-content-between align-items-center gap-2',
    children: [createEl('h4', { className: 'h6 mb-0 text-muted', text: 'Kinderliste' }), addRowButton],
  });

  const childList = createEl('div', {
    className: 'd-flex flex-wrap gap-2 observation-child-list',
    dataset: { role: 'child-pill-list' },
  });
  const emptyChildren = createEl('div', {
    className: 'text-muted small ps-1',
    dataset: { role: 'child-pill-empty' },
    text: 'Noch keine Kinder hinzugefügt.',
  });

  const buildToastContainer = () => {
    if (toastContainer) {
      return toastContainer;
    }
    toastContainer = createEl('div', {
      className: 'toast-container position-fixed top-0 start-50 translate-middle-x p-3',
      attrs: { style: 'z-index: 2000;' },
    });
    overlay.append(toastContainer);
    return toastContainer;
  };

  const showChildAddedToast = (message) => {
    const container = buildToastContainer();
    const toastEl = createEl('div', {
      className: 'toast align-items-center text-bg-success border-0',
      attrs: { role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' },
    });
    const body = createEl('div', {
      className: 'd-flex',
      children: [
        createEl('div', { className: 'toast-body', text: message }),
        createEl('button', {
          className: 'btn-close btn-close-white me-2 m-auto',
          attrs: { type: 'button', 'data-bs-dismiss': 'toast', 'aria-label': 'Schließen' },
        }),
      ],
    });
    toastEl.append(body);
    container.append(toastEl);

    let toastInstance = null;
    if (window.bootstrap?.Toast) {
      toastInstance = new window.bootstrap.Toast(toastEl, { autohide: true, delay: 2500 });
      toastInstance.show();
    } else {
      toastEl.classList.add('show');
      window.setTimeout(() => toastEl.classList.remove('show'), 2500);
    }
    toastEl.addEventListener('hidden.bs.toast', () => {
      toastEl.remove();
    });
  };

  const childrenContent = createEl('div', {
    className: 'd-flex flex-column gap-3',
    children: [
      childrenHeader,
      childList,
      emptyChildren,
    ],
  });

  const childrenItem = buildAccordionItem({
    id: 'class-children',
    title: 'Kinderliste',
    content: childrenContent,
    accordionId,
  });

  const addCourseButton = createEl('button', {
    className: 'btn btn-outline-primary btn-sm d-inline-flex align-items-center gap-2',
    attrs: { type: 'button' },
    children: [
      createEl('span', { text: '＋' }),
      createEl('span', { text: 'Neuen Kurs hinzufügen' }),
    ],
  });
  const coursesHeader = createEl('div', {
    className: 'd-flex justify-content-between align-items-center gap-2',
    children: [createEl('h4', { className: 'h6 mb-0 text-muted', text: 'Kurse' }), addCourseButton],
  });
  const coursesList = createEl('div', {
    className: 'd-flex flex-column gap-3',
    dataset: { role: 'course-list' },
  });
  const emptyCourses = createEl('div', {
    className: 'text-muted small ps-1',
    dataset: { role: 'course-empty' },
    text: 'Noch keine Kurse angelegt.',
  });
  const courseHint = createEl('div', {
    className: 'text-muted small',
    text: 'Kurse erscheinen später in der Entlassung beim jeweiligen Kind.',
  });
  const coursesContent = createEl('div', {
    className: 'd-flex flex-column gap-3',
    children: [coursesHeader, coursesList, emptyCourses, courseHint],
  });
  const coursesItem = buildAccordionItem({
    id: 'class-courses',
    title: 'Kurse',
    content: coursesContent,
    accordionId,
  });

  const entlassungContent = createEl('div', {
    className: 'd-flex flex-column gap-2',
  });

  const entlassungTabListId = 'entlassung-tabs';
  const entlassungRegularTabId = 'entlassung-regular-tab';
  const entlassungSpecialTabId = 'entlassung-special-tab';
  const entlassungRegularPaneId = 'entlassung-regular';
  const entlassungSpecialPaneId = 'entlassung-special';

  const entlassungRegularContainer = createEl('div', {
    className: 'd-flex flex-column gap-3',
    dataset: { role: 'entlassung-regular' },
  });
  const entlassungSpecialContainer = createEl('div', {
    className: 'd-flex flex-column gap-3',
    dataset: { role: 'entlassung-special' },
  });

  const entlassungCard = createEl('div', {
    className: 'card border-0 shadow-sm',
    children: [
      createEl('div', {
        className: 'card-body d-flex flex-column gap-3',
        children: [
          createEl('div', {
            className: 'd-flex flex-column gap-1',
            children: [
              createEl('div', { className: 'h6 mb-0', text: 'Entlassung' }),
            ],
          }),
          createEl('ul', {
            className: 'nav nav-tabs',
            attrs: { id: entlassungTabListId, role: 'tablist' },
            children: [
              createEl('li', {
                className: 'nav-item',
                attrs: { role: 'presentation' },
                children: [
                  createEl('button', {
                    className: 'nav-link active',
                    attrs: {
                      id: entlassungRegularTabId,
                      type: 'button',
                      role: 'tab',
                      'data-bs-toggle': 'tab',
                      'data-bs-target': `#${entlassungRegularPaneId}`,
                      'aria-controls': entlassungRegularPaneId,
                      'aria-selected': 'true',
                    },
                    text: 'Ordentliche Entlassung',
                  }),
                ],
              }),
              createEl('li', {
                className: 'nav-item',
                attrs: { role: 'presentation' },
                children: [
                  createEl('button', {
                    className: 'nav-link',
                    attrs: {
                      id: entlassungSpecialTabId,
                      type: 'button',
                      role: 'tab',
                      'data-bs-toggle': 'tab',
                      'data-bs-target': `#${entlassungSpecialPaneId}`,
                      'aria-controls': entlassungSpecialPaneId,
                      'aria-selected': 'false',
                    },
                    text: 'Sonderentlassung',
                  }),
                ],
              }),
            ],
          }),
          createEl('div', {
            className: 'tab-content border border-top-0 rounded-bottom bg-white p-3',
            children: [
              createEl('div', {
                className: 'tab-pane fade show active',
                attrs: {
                  id: entlassungRegularPaneId,
                  role: 'tabpanel',
                  'aria-labelledby': entlassungRegularTabId,
                },
                children: [entlassungRegularContainer],
              }),
              createEl('div', {
                className: 'tab-pane fade',
                attrs: {
                  id: entlassungSpecialPaneId,
                  role: 'tabpanel',
                  'aria-labelledby': entlassungSpecialTabId,
                },
                children: [entlassungSpecialContainer],
              }),
            ],
          }),
        ],
      }),
    ],
  });

  const deleteChildInput = createEl('input', {
    className: 'form-control',
    attrs: {
      type: 'text',
      id: 'delete-child-name',
      placeholder: 'Name des Kindes',
      'aria-label': 'Name des Kindes',
    },
    dataset: { role: 'delete-child-name' },
  });
  const deleteChildFeedback = createEl('div', {
    className: 'small d-none',
    dataset: { role: 'delete-child-feedback' },
  });
  const deleteChildButton = createEl('button', {
    className: 'btn btn-outline-danger d-inline-flex align-items-center gap-2',
    attrs: { type: 'button' },
    dataset: { role: 'delete-child-submit' },
    children: [createEl('span', { text: '⚠️' }), createEl('span', { text: 'Löschen…' })],
  });
  const deleteChildCard = createEl('div', {
    className: 'card border-0 shadow-sm',
    children: [
      createEl('div', {
        className: 'card-body d-flex flex-column gap-2',
        children: [
          createEl('div', {
            className: 'd-flex flex-column gap-1',
            children: [
              createEl('div', {
                className: 'h6 mb-0 text-danger',
                text: 'Kinder aus der Liste löschen',
              }),
              createEl('p', {
                className: 'small mb-0 text-muted',
                text: 'Beim Löschen eines Kindes werden alle verknüpften Einträge und Daten entfernt.',
              }),
            ],
          }),
          createFormGroup({
            id: 'delete-child-name',
            label: 'Name des Kindes',
            control: deleteChildInput,
          }),
          deleteChildButton,
          deleteChildFeedback,
        ],
      }),
    ],
  });
  entlassungContent.append(entlassungCard);
  const cautionContent = createEl('div', {
    className: 'd-flex flex-column gap-2',
    children: [deleteChildCard],
  });

  const deleteChildConfirmDialog = createEl('div', {
    className: 'class-settings-confirm d-none',
    attrs: {
      role: 'dialog',
      'aria-modal': 'true',
      'aria-labelledby': 'delete-child-confirm-title',
      'aria-describedby': 'delete-child-confirm-message',
      'aria-hidden': 'true',
      tabIndex: '-1',
    },
  });
  const deleteChildConfirmPanel = createEl('div', {
    className: 'class-settings-confirm__panel',
  });
  const deleteChildConfirmTitle = createEl('h4', {
    className: 'h6 mb-2 text-danger',
    attrs: { id: 'delete-child-confirm-title' },
    text: 'Warnung',
  });
  const deleteChildConfirmMessage = createEl('p', {
    className: 'mb-2',
    attrs: { id: 'delete-child-confirm-message' },
    text: 'Beim Löschen dieses Kindes werden alle Daten zu diesem Kind gelöscht.',
  });
  const deleteChildConfirmName = createEl('p', {
    className: 'fw-semibold mb-3 text-danger',
  });
  const deleteChildConfirmActions = createEl('div', {
    className: 'class-settings-confirm__actions',
  });
  const deleteChildConfirmSubmit = createEl('button', {
    className: 'btn btn-danger',
    attrs: { type: 'button' },
    text: 'Ich bin mir des Risikos bewusst und möchte diese Daten löschen',
  });
  const deleteChildConfirmCancel = createEl('button', {
    className: 'btn btn-outline-secondary',
    attrs: { type: 'button' },
    text: 'Abbrechen',
  });
  deleteChildConfirmActions.append(deleteChildConfirmSubmit, deleteChildConfirmCancel);
  deleteChildConfirmPanel.append(
    deleteChildConfirmTitle,
    deleteChildConfirmMessage,
    deleteChildConfirmName,
    deleteChildConfirmActions,
  );
  deleteChildConfirmDialog.append(deleteChildConfirmPanel);

  const entlassungConfirmDialog = createEl('div', {
    className: 'class-settings-confirm d-none',
    attrs: {
      role: 'dialog',
      'aria-modal': 'true',
      'aria-labelledby': 'entlassung-confirm-title',
      'aria-describedby': 'entlassung-confirm-message',
      'aria-hidden': 'true',
      tabIndex: '-1',
    },
  });
  const entlassungConfirmPanel = createEl('div', {
    className: 'class-settings-confirm__panel',
  });
  const entlassungConfirmTitle = createEl('h4', {
    className: 'h6 mb-2 text-danger',
    attrs: { id: 'entlassung-confirm-title' },
    text: 'Vorsicht',
  });
  const entlassungConfirmMessage = createEl('p', {
    className: 'mb-2',
    attrs: { id: 'entlassung-confirm-message' },
    text: 'Möchtest du diese Entlassungszeit wirklich löschen?',
  });
  const entlassungConfirmLabel = createEl('p', {
    className: 'fw-semibold mb-2 text-danger',
  });
  const entlassungConfirmInput = createEl('input', {
    className: 'form-control',
    attrs: {
      type: 'text',
      placeholder: 'ja',
      'aria-label': 'Bestätigung',
    },
  });
  const entlassungConfirmFeedback = createEl('div', {
    className: 'text-danger small d-none',
    text: 'Bitte "ja" eingeben, um zu bestätigen.',
  });
  const entlassungConfirmActions = createEl('div', {
    className: 'class-settings-confirm__actions',
  });
  const entlassungConfirmSubmit = createEl('button', {
    className: 'btn btn-danger',
    attrs: { type: 'button' },
    text: 'Bestätigen',
  });
  const entlassungConfirmCancel = createEl('button', {
    className: 'btn btn-outline-secondary',
    attrs: { type: 'button' },
    text: 'Abbrechen',
  });
  entlassungConfirmActions.append(entlassungConfirmSubmit, entlassungConfirmCancel);
  entlassungConfirmPanel.append(
    entlassungConfirmTitle,
    entlassungConfirmMessage,
    entlassungConfirmLabel,
    entlassungConfirmInput,
    entlassungConfirmFeedback,
    entlassungConfirmActions,
  );
  entlassungConfirmDialog.append(entlassungConfirmPanel);

  const childDetailOverlay = createEl('div', {
    className: 'child-detail-overlay d-none',
    attrs: { 'aria-hidden': 'true' },
  });
  const childDetailPanel = createEl('div', {
    className: 'child-detail-overlay__panel',
    attrs: { role: 'dialog', 'aria-modal': 'true' },
  });
  const childDetailHeader = createEl('div', { className: 'child-detail-overlay__header' });
  const childDetailTitle = createEl('h3', {
    className: 'h5 mb-0',
    dataset: { role: 'child-detail-title' },
    text: 'Kind Details',
  });
  const childDetailClose = createEl('button', {
    className: 'btn-close child-detail-overlay__close',
    attrs: { type: 'button', 'aria-label': 'Schließen' },
  });
  childDetailHeader.append(childDetailTitle, childDetailClose);

  const childDetailContent = createEl('div', { className: 'child-detail-overlay__content' });
  const childDetailForm = createEl('form', {
    className: 'd-flex flex-column gap-3',
    dataset: { role: 'child-detail-form' },
  });
  const childNameInput = createEl('input', {
    className: 'form-control',
    attrs: { type: 'text', placeholder: 'Name eingeben', 'aria-label': 'Kind' },
    dataset: { role: 'child-detail-name' },
  });
  const childNoteInput = createEl('textarea', {
    className: 'form-control',
    attrs: { rows: '3', placeholder: 'Notizen', 'aria-label': 'Notizen zum Kind' },
    dataset: { role: 'child-detail-note' },
  });
  const childErrorsBox = createEl('div', {
    className: 'text-danger small d-none',
    dataset: { role: 'child-detail-errors' },
  });
  const childDetailActions = createEl('div', {
    className: 'd-flex flex-column flex-sm-row gap-2',
  });
  const childSaveButton = createEl('button', {
    className: 'btn btn-primary',
    attrs: { type: 'submit' },
    text: 'Speichern',
    dataset: { role: 'child-detail-save' },
  });
  const childCancelButton = createEl('button', {
    className: 'btn btn-outline-secondary',
    attrs: { type: 'button' },
    text: 'Abbrechen',
    dataset: { role: 'child-detail-cancel' },
  });
  childDetailActions.append(childSaveButton, childCancelButton);
  childDetailForm.append(
    createFormGroup({ id: 'child-detail-name', label: 'Name', control: childNameInput }),
    createFormGroup({ id: 'child-detail-note', label: 'Notizen', control: childNoteInput }),
    childErrorsBox,
    childDetailActions,
  );
  childDetailContent.append(childDetailForm);
  childDetailPanel.append(childDetailHeader, childDetailContent);
  childDetailOverlay.append(childDetailPanel);

  const cautionItem = buildAccordionItem({
    id: 'class-caution',
    title: 'Vorsicht!',
    content: cautionContent,
    accordionId,
  });

  const entlassungItem = buildAccordionItem({
    id: 'class-entlassung',
    title: 'Entlassung',
    content: entlassungContent,
    accordionId,
  });

  accordion.append(
    generalItem.element,
    childrenItem.element,
    coursesItem.element,
    entlassungItem.element,
    cautionItem.element,
  );
  content.append(accordion);
  panel.append(header, content);
  overlay.append(panel, childDetailOverlay, deleteChildConfirmDialog, entlassungConfirmDialog);

  const updateProfileInputs = (nextProfile = {}) => {
    const nextTeacherName =
      typeof nextProfile.teacherName === 'string' ? nextProfile.teacherName : '';
    const nextName = typeof nextProfile.name === 'string' ? nextProfile.name : '';
    const nextBadge = typeof nextProfile.badge === 'string' ? nextProfile.badge : '';
    const nextMotto = typeof nextProfile.motto === 'string' ? nextProfile.motto : '';
    const nextNotes = typeof nextProfile.notes === 'string' ? nextProfile.notes : '';

    const isActive = (input) => document.activeElement === input;

    if (!isActive(teacherNameInput) && teacherNameInput.value !== nextTeacherName) {
      teacherNameInput.value = nextTeacherName;
    }
    if (!isActive(nameInput) && nameInput.value !== nextName) {
      nameInput.value = nextName;
    }
    if (!isActive(badgeInput) && badgeInput.value !== nextBadge) {
      badgeInput.value = nextBadge;
    }
    if (!isActive(mottoInput) && mottoInput.value !== nextMotto) {
      mottoInput.value = nextMotto;
    }
    if (!isActive(notesInput) && notesInput.value !== nextNotes) {
      notesInput.value = nextNotes;
    }
  };

  const persistProfile = debounce(() => {
    saveClassProfileFields({
      teacherName: teacherNameInput.value,
      name: nameInput.value,
      badge: badgeInput.value,
      motto: mottoInput.value,
      notes: notesInput.value,
    });
  }, 200);

  const childListEl = content.querySelector('[data-role="child-pill-list"]');
  const emptyChildrenEl = content.querySelector('[data-role="child-pill-empty"]');

  const renderChildFormErrors = () => {
    if (!childErrorsBox) {
      return;
    }
    childErrorsBox.replaceChildren();
    childFormErrors.forEach((msg) => {
      childErrorsBox.append(createEl('div', { text: msg }));
    });
    childErrorsBox.classList.toggle('d-none', !childFormErrors.length);
  };

  const closeChildDetailOverlay = () => {
    childDetailOverlay.classList.add('d-none');
    childDetailOverlay.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('child-detail-overlay-open');
    activeChildId = '';
    childFormName = '';
    childFormNote = '';
    childFormErrors = [];
    renderChildFormErrors();
  };

  let entlassungConfirmAction = null;
  const closeEntlassungConfirm = () => {
    entlassungConfirmDialog.classList.add('d-none');
    entlassungConfirmDialog.setAttribute('aria-hidden', 'true');
    entlassungConfirmInput.value = '';
    entlassungConfirmFeedback.classList.add('d-none');
    entlassungConfirmAction = null;
  };

  const openEntlassungConfirm = ({ label, time, onConfirm }) => {
    const timeLabel = time || 'ohne Uhrzeit';
    entlassungConfirmLabel.textContent = `${label} - ${timeLabel}`;
    entlassungConfirmMessage.textContent =
      `Möchtest du die Entlassungszeit ${label} - ${timeLabel} wirklich löschen? ` +
      'Bitte "ja" eingeben, um zu bestätigen, oder Abbrechen wählen.';
    entlassungConfirmInput.value = '';
    entlassungConfirmFeedback.classList.add('d-none');
    entlassungConfirmAction = onConfirm;
    entlassungConfirmDialog.classList.remove('d-none');
    entlassungConfirmDialog.setAttribute('aria-hidden', 'false');
    window.requestAnimationFrame(() => {
      entlassungConfirmInput?.focus();
    });
  };

  entlassungConfirmCancel.addEventListener('click', () => closeEntlassungConfirm());
  entlassungConfirmSubmit.addEventListener('click', () => {
    const value = entlassungConfirmInput.value.trim().toLowerCase();
    if (value !== 'ja') {
      entlassungConfirmFeedback.classList.remove('d-none');
      entlassungConfirmInput?.focus();
      return;
    }
    entlassungConfirmFeedback.classList.add('d-none');
    const action = entlassungConfirmAction;
    closeEntlassungConfirm();
    action?.();
  });

  const getExistingNames = (excludeId = '') =>
    rows
      .filter((row) => row.id !== excludeId)
      .map((row) => (row.name ? row.name.toLocaleLowerCase() : ''))
      .filter(Boolean);

  const openChildDetailOverlay = (row = null) => {
    activeChildId = row?.id || '';
    childFormName = row?.name || '';
    childFormNote = typeof row?.note === 'string' ? row.note : '';
    childFormErrors = [];

    childDetailTitle.textContent = row ? 'Kind bearbeiten' : 'Neues Kind';
    childNameInput.value = childFormName;
    childNoteInput.value = childFormNote;
    renderChildFormErrors();

    childDetailOverlay.classList.remove('d-none');
    childDetailOverlay.setAttribute('aria-hidden', 'false');
    document.body.classList.add('child-detail-overlay-open');
    window.requestAnimationFrame(() => {
      childNameInput?.focus();
    });
  };

  const persistRows = debounce((rowsToPersist) => {
    const normalizedRows = (Array.isArray(rowsToPersist) ? rowsToPersist : rows).map((row) => {
      const normalizedName = normalizeChildName(row.name);
      const normalizedNote = typeof row.note === 'string' ? row.note : '';
      if (!normalizedName) {
        return { ...row, note: normalizedNote };
      }
      return {
        ...row,
        name: normalizedName,
        note: normalizedNote,
      };
    });

    saveClassChildren(normalizedRows);
    rows = normalizedRows.map((row) => {
      const normalizedName = normalizeChildName(row.name);
      if (!normalizedName) {
        return row;
      }
      return {
        ...row,
        name: normalizedName,
        originalName: normalizedName,
        note: typeof row.note === 'string' ? row.note : '',
        persisted: true,
      };
    });
    renderChildPills();
  }, 200);

  const renderChildPills = () => {
    if (!childListEl) {
      return;
    }
    childListEl.replaceChildren();
    childButtonRefs.clear();
    const normalizedRows = rows
      .map((row) => ({
        ...row,
        normalizedName: normalizeChildName(row.name),
      }))
      .filter((row) => row.normalizedName);

    normalizedRows
      .sort((a, b) => a.normalizedName.localeCompare(b.normalizedName, 'de'))
      .forEach((row) => {
        const pill = createEl('button', {
          className: 'btn observation-child-button btn-outline-primary',
          attrs: { type: 'button' },
          dataset: { role: 'child-pill', child: row.normalizedName, id: row.id },
          children: [
            createEl('span', {
              className: 'fw-semibold observation-child-label',
              text: row.name || row.normalizedName,
            }),
          ],
        });
        pill.addEventListener('click', () => openChildDetailOverlay(row));
        childButtonRefs.set(row.id, pill);
        childListEl.append(pill);
      });

    emptyChildrenEl?.classList.toggle('d-none', normalizedRows.length > 0);
  };

  const getAvailableChildren = () => {
    const unique = new Set();
    rows.forEach((row) => {
      const normalized = normalizeChildName(row.name || row.originalName);
      if (normalized) {
        unique.add(normalized);
      }
    });
    return Array.from(unique).sort((a, b) => a.localeCompare(b, 'de'));
  };

  const ensureEntlassungStructure = (value = {}) => {
    const regular = {};
    TIMETABLE_DAY_ORDER.forEach(({ key }) => {
      regular[key] = Array.isArray(value?.regular?.[key]) ? value.regular[key] : [];
    });
    const special = Array.isArray(value?.special) ? value.special : [];
    return { regular, special };
  };

  const persistEntlassung = debounce(() => {
    saveClassEntlassung(entlassungState);
  }, 200);

  const persistCourses = debounce(() => {
    const normalized = coursesState.map(({ id, ...course }) => course);
    saveClassCourses(normalized);
  }, 200);

  const createCourseId = () => {
    const id = `course-${courseIdCounter}`;
    courseIdCounter += 1;
    return id;
  };

  const buildCourseCard = (course, childrenList) => {
    const nameValue = typeof course?.name === 'string' ? course.name : '';
    const iconValue = typeof course?.icon === 'string' ? course.icon : '';
    const dayValue = typeof course?.day === 'string' ? course.day : '';
    const timeValue = typeof course?.time === 'string' ? course.time : '';
    const selectedChildren = Array.isArray(course?.children) ? course.children : [];

    const removeButton = createEl('button', {
      className: 'btn btn-outline-danger btn-sm',
      attrs: { type: 'button' },
      text: 'Entfernen',
    });

    const headerTitle = createEl('div', { className: 'fw-semibold', text: nameValue || 'Kurs' });
    const headerRow = createEl('div', {
      className: 'd-flex justify-content-between align-items-center gap-2',
      children: [headerTitle, removeButton],
    });

    const nameInput = createEl('input', {
      className: 'form-control form-control-sm',
      attrs: { type: 'text', placeholder: 'z. B. Musik' },
    });
    nameInput.value = nameValue;

    const iconValueLabel = createEl('span', {
      className: 'badge text-bg-light border text-secondary',
      text: iconValue || '—',
    });
    const pickerToggle = createEl('button', {
      className: 'btn btn-outline-secondary btn-sm align-self-start',
      attrs: { type: 'button', 'aria-expanded': 'false' },
      text: 'Icon auswählen…',
    });
    const pickerPanel = createEl('div', {
      className: 'course-emoji-picker-panel d-none',
    });
    const emojiPicker = createEl('emoji-picker', {
      className: 'course-emoji-picker',
    });
    if (!emojiPickerReady) {
      emojiPicker.classList.add('d-none');
    }
    const emojiPickerHint = createEl('div', {
      className: `text-muted small${emojiPickerReady ? ' d-none' : ''}`,
      text: 'Emoji-Picker lädt…',
    });
    const fallbackPicker = createEl('div', {
      className: 'd-flex flex-wrap gap-1',
      children: COURSE_ICON_OPTIONS.map((icon) => {
        const button = createEl('button', {
          className: 'btn btn-outline-secondary btn-sm',
          attrs: { type: 'button', 'aria-label': `Icon ${icon}` },
          text: icon,
        });
        button.addEventListener('click', () => {
          course.icon = icon;
          iconValueLabel.textContent = icon;
          updateValidity();
          persistCourses();
          closePicker();
        });
        return button;
      }),
    });
    pickerPanel.append(emojiPicker, emojiPickerHint, fallbackPicker);

    const daySelect = createEl('select', {
      className: 'form-select form-select-sm',
      attrs: { 'aria-label': 'Wochentag' },
    });
    daySelect.append(
      createEl('option', { attrs: { value: '' }, text: 'Wochentag auswählen' }),
      ...TIMETABLE_DAY_ORDER.map(({ key, label }) =>
        createEl('option', { attrs: { value: key }, text: label }),
      ),
    );
    daySelect.value = dayValue;

    const timeInput = createEl('input', {
      className: 'form-control form-control-sm',
      attrs: { type: 'time', step: '300', 'aria-label': 'Kurszeit (optional)' },
    });
    timeInput.value = timeValue;

    const validationText = createEl('div', {
      className: 'text-danger small',
      text: 'Bitte Name, Icon und Wochentag auswählen.',
    });

    const childList = createEl('div', { className: 'd-flex flex-wrap gap-2' });
    const childButtonRefs = new Map();

    const updateChildButtons = (enabled) => {
      childButtonRefs.forEach((button) => {
        button.disabled = !enabled;
      });
    };

    const updateValidity = () => {
      const isValidCourse = Boolean(course.name && course.icon && course.day);
      validationText.classList.toggle('d-none', isValidCourse);
      updateChildButtons(isValidCourse);
    };

    const closePicker = () => {
      pickerPanel.classList.add('d-none');
      pickerToggle.setAttribute('aria-expanded', 'false');
    };

    const extractEmoji = (event) => {
      if (!event) {
        return '';
      }
      const detail = event.detail || {};
      if (typeof detail === 'string') {
        return detail;
      }
      return (
        detail.emoji ||
        detail.unicode ||
        detail.char ||
        detail.symbol ||
        detail.value ||
        event.target?.value ||
        ''
      );
    };

    const handleEmojiPick = (event) => {
      const emoji = extractEmoji(event);
      if (!emoji) {
        return;
      }
      course.icon = emoji;
      iconValueLabel.textContent = emoji;
      updateValidity();
      persistCourses();
      closePicker();
    };

    emojiPicker.addEventListener('emoji-click', handleEmojiPick);
    emojiPicker.addEventListener('emoji-selected', handleEmojiPick);
    emojiPicker.addEventListener('change', handleEmojiPick);

    pickerToggle.addEventListener('click', () => {
      const isOpen = !pickerPanel.classList.contains('d-none');
      pickerPanel.classList.toggle('d-none', isOpen);
      pickerToggle.setAttribute('aria-expanded', isOpen ? 'false' : 'true');
    });

    nameInput.addEventListener('input', (event) => {
      course.name = event.target.value;
      headerTitle.textContent = course.name || 'Kurs';
      updateValidity();
      persistCourses();
    });

    daySelect.addEventListener('change', (event) => {
      course.day = event.target.value;
      updateValidity();
      persistCourses();
    });

    timeInput.addEventListener('change', (event) => {
      course.time = event.target.value;
      persistCourses();
    });

    if (childrenList.length) {
      childrenList.forEach((child) => {
        const isSelected = selectedChildren.includes(child);
        const childButton = createEl('button', {
          className: `btn btn-sm ${isSelected ? 'btn-primary' : 'btn-outline-secondary'}`,
          attrs: {
            type: 'button',
            'aria-pressed': isSelected ? 'true' : 'false',
          },
          text: child,
        });
        childButton.addEventListener('click', () => {
          const currentSelection = Array.isArray(course.children) ? course.children : [];
          const nextSelected = currentSelection.includes(child);
          const nextChildren = nextSelected
            ? currentSelection.filter((name) => name !== child)
            : [...currentSelection, child];
          course.children = nextChildren;
          childButton.classList.toggle('btn-primary', !nextSelected);
          childButton.classList.toggle('btn-outline-secondary', nextSelected);
          childButton.setAttribute('aria-pressed', nextSelected ? 'false' : 'true');
          persistCourses();
        });
        childButtonRefs.set(child, childButton);
        childList.append(childButton);
      });
    } else {
      childList.append(
        createEl('span', {
          className: 'text-muted small',
          text: 'Noch keine Kinder hinzugefügt.',
        }),
      );
    }

    const fields = createEl('div', {
      className: 'd-flex flex-column gap-2',
      children: [
        createFormGroup({
          id: `course-name-${course.id}`,
          label: 'Name',
          control: nameInput,
        }),
        createFormGroup({
          id: `course-icon-${course.id}`,
          label: 'Icon',
          control: createEl('div', {
            className: 'd-flex flex-column gap-2',
            children: [
              createEl('div', {
                className: 'd-flex align-items-center gap-2',
                children: [iconValueLabel, pickerToggle],
              }),
              pickerPanel,
            ],
          }),
        }),
        createFormGroup({
          id: `course-day-${course.id}`,
          label: 'Wochentag',
          control: daySelect,
        }),
        createFormGroup({
          id: `course-time-${course.id}`,
          label: 'Uhrzeit (optional)',
          control: timeInput,
        }),
        validationText,
        createEl('div', {
          className: 'd-flex flex-column gap-2',
          children: [
            createEl('div', { className: 'text-muted small', text: 'Kinder' }),
            childList,
          ],
        }),
      ],
    });

    const card = createEl('div', {
      className: 'card border-0 shadow-sm',
      children: [
        createEl('div', {
          className: 'card-body d-flex flex-column gap-2',
          children: [headerRow, fields],
        }),
      ],
    });

    removeButton.addEventListener('click', () => {
      const index = coursesState.findIndex((entry) => entry.id === course.id);
      if (index !== -1) {
        coursesState.splice(index, 1);
      }
      card.remove();
      courseCardRefs.delete(course.id);
      emptyCourses.classList.toggle('d-none', coursesState.length > 0);
      persistCourses();
    });

    updateValidity();

    courseCardRefs.set(course.id, {
      element: card,
    });

    return card;
  };

  const setRegularError = (dayKey, message) => {
    if (!message) {
      delete entlassungRegularErrors[dayKey];
      renderEntlassung();
      return;
    }
    entlassungRegularErrors[dayKey] = message;
    renderEntlassung();
    window.setTimeout(() => {
      if (entlassungRegularErrors[dayKey] === message) {
        delete entlassungRegularErrors[dayKey];
        renderEntlassung();
      }
    }, 2500);
  };

  const setSpecialError = (dateKey, message) => {
    if (!message) {
      delete entlassungSpecialErrors[dateKey];
      renderEntlassung();
      return;
    }
    entlassungSpecialErrors[dateKey] = message;
    renderEntlassung();
    window.setTimeout(() => {
      if (entlassungSpecialErrors[dateKey] === message) {
        delete entlassungSpecialErrors[dateKey];
        renderEntlassung();
      }
    }, 2500);
  };

  const sortEntlassungSlots = (slots) => {
    slots.sort((a, b) => {
      const timeA = typeof a?.time === 'string' ? a.time : '';
      const timeB = typeof b?.time === 'string' ? b.time : '';
      if (!timeA && !timeB) {
        return 0;
      }
      if (!timeA) {
        return 1;
      }
      if (!timeB) {
        return -1;
      }
      return timeA.localeCompare(timeB);
    });
  };

  const renderCourses = () => {
    const childrenList = getAvailableChildren();
    coursesState = normalizeCourses(coursesState, childrenList).map((course) => ({
      ...course,
      id: createCourseId(),
    }));
    coursesList.replaceChildren();
    courseCardRefs.clear();
    emptyCourses.classList.toggle('d-none', coursesState.length > 0);

    if (!emojiPickerReady && window.customElements?.get('emoji-picker')) {
      emojiPickerReady = true;
    }
    if (!emojiPickerReady && window.customElements?.whenDefined && !emojiPickerPromise) {
      emojiPickerPromise = window.customElements
        .whenDefined('emoji-picker')
        .then(() => {
          emojiPickerReady = true;
          emojiPickerPromise = null;
          renderCourses();
        })
        .catch(() => {
          emojiPickerPromise = null;
        });
    }

    coursesState.forEach((course) => {
      coursesList.append(buildCourseCard(course, childrenList));
    });
  };

  const renderEntlassung = () => {
    const previousScrollTop = content.scrollTop;
    const previousScrollLeft = content.scrollLeft;
    const childrenList = getAvailableChildren();
    entlassungState = ensureEntlassungStructure(entlassungState);

    entlassungRegularContainer.replaceChildren();
    entlassungSpecialContainer.replaceChildren();

    TIMETABLE_DAY_ORDER.forEach(({ key, label }) => {
      const daySlots = Array.isArray(entlassungState.regular?.[key])
        ? entlassungState.regular[key]
        : [];
      sortEntlassungSlots(daySlots);
      const assignedMap = new Map();
      daySlots.forEach((slot, index) => {
        (slot?.children || []).forEach((child) => {
          if (!assignedMap.has(child)) {
            assignedMap.set(child, index);
          }
        });
      });

      const addButton = createEl('button', {
        className: 'btn btn-outline-primary btn-sm',
        attrs: { type: 'button' },
        text: 'Uhrzeit hinzufügen',
      });
      addButton.addEventListener('click', () => {
        daySlots.push({ time: '', children: [] });
        entlassungState.regular[key] = daySlots;
        renderEntlassung();
      });

      const dayHeader = createEl('div', {
        className: 'd-flex justify-content-between align-items-center gap-2',
        children: [createEl('div', { className: 'fw-semibold', text: label }), addButton],
      });

      const dayErrorText = entlassungRegularErrors[key]
        ? createEl('div', { className: 'text-danger small', text: entlassungRegularErrors[key] })
        : null;

      const dayNote = createEl('div', {
        className: 'small text-muted',
        text: 'Jedes Kind kann pro Tag nur einer Uhrzeit zugeordnet werden.',
      });

      const slotList = createEl('div', { className: 'd-flex flex-column gap-2' });

      daySlots.forEach((slot, index) => {
        const slotWrapper = createEl('div', {
          className: 'border rounded-3 p-2 d-flex flex-column gap-2',
        });
        const timeInput = createEl('input', {
          className: 'form-control form-control-sm',
          attrs: {
            type: 'time',
            step: '300',
            'aria-label': 'Entlassungszeit',
          },
        });
        if (slot?.time) {
          timeInput.value = slot.time;
        }

        const removeButton = createEl('button', {
          className: 'btn btn-outline-danger btn-sm',
          attrs: { type: 'button' },
          text: 'Entfernen',
        });

        const timeRow = createEl('div', {
          className: 'd-flex flex-column flex-sm-row align-items-start align-items-sm-center gap-2',
          children: [
            createEl('div', { className: 'flex-grow-1', children: [timeInput] }),
            removeButton,
          ],
        });

        const childList = createEl('div', { className: 'd-flex flex-wrap gap-2' });
        childrenList.forEach((child) => {
          const isSelected = Array.isArray(slot?.children) && slot.children.includes(child);
          const assignedElsewhere =
            assignedMap.has(child) && assignedMap.get(child) !== index;
          if (assignedElsewhere && !isSelected) {
            return;
          }
          const childButton = createEl('button', {
            className: `btn btn-sm ${isSelected ? 'btn-primary' : 'btn-outline-secondary'}`,
            attrs: { type: 'button', 'aria-pressed': isSelected ? 'true' : 'false' },
            text: child,
          });
          childButton.addEventListener('click', () => {
            if (!slot.time) {
              setRegularError(key, 'Bitte zuerst eine Uhrzeit festlegen.');
              return;
            }
            const currentIndex = daySlots.indexOf(slot);
            const nextChildren = Array.isArray(slot.children) ? [...slot.children] : [];
            if (isSelected) {
              slot.children = nextChildren.filter((name) => name !== child);
            } else {
              daySlots.forEach((otherSlot, otherIndex) => {
                if (otherIndex === currentIndex || !Array.isArray(otherSlot?.children)) {
                  return;
                }
                otherSlot.children = otherSlot.children.filter((name) => name !== child);
              });
              slot.children = [...nextChildren, child];
            }
            entlassungState.regular[key] = daySlots;
            persistEntlassung();
            renderEntlassung();
          });
          childList.append(childButton);
        });

        timeInput.addEventListener('change', (event) => {
          const nextValue = event.target.value;
          if (
            nextValue &&
            daySlots.some((other, otherIndex) => otherIndex !== index && other.time === nextValue)
          ) {
            setRegularError(key, 'Diese Uhrzeit existiert bereits für diesen Tag.');
            event.target.value = slot.time || '';
            return;
          }
          slot.time = nextValue;
          sortEntlassungSlots(daySlots);
          entlassungState.regular[key] = daySlots;
          persistEntlassung();
          renderEntlassung();
        });

        removeButton.addEventListener('click', () => {
          openEntlassungConfirm({
            label,
            time: slot.time,
            onConfirm: () => {
              const currentIndex = daySlots.indexOf(slot);
              if (currentIndex !== -1) {
                daySlots.splice(currentIndex, 1);
              }
              entlassungState.regular[key] = daySlots;
              persistEntlassung();
              renderEntlassung();
            },
          });
        });

        slotWrapper.append(timeRow, childList);
        slotList.append(slotWrapper);
      });

      const daySection = createEl('div', {
        className: 'd-flex flex-column gap-2',
        children: [dayHeader, dayErrorText, slotList, dayNote].filter(Boolean),
      });
      entlassungRegularContainer.append(daySection);
    });

    const specialHeader = createEl('div', {
      className: 'd-flex justify-content-between align-items-center gap-2',
      children: [
        createEl('div', { className: 'fw-semibold', text: 'Sonderentlassungen' }),
        createEl('button', {
          className: 'btn btn-outline-primary btn-sm',
          attrs: { type: 'button' },
          text: 'Datum hinzufügen',
        }),
      ],
    });
    const addSpecialButton = specialHeader.querySelector('button');
    addSpecialButton?.addEventListener('click', () => {
      const nextDate = todayYmd();
      if (entlassungState.special.some((entry) => entry?.date === nextDate)) {
        setSpecialError(nextDate, 'Für dieses Datum existiert bereits ein Eintrag.');
        return;
      }
      entlassungState.special.push({ date: nextDate, times: [] });
      persistEntlassung();
      renderEntlassung();
    });

    entlassungSpecialContainer.append(specialHeader);

    if (!entlassungState.special.length) {
      entlassungSpecialContainer.append(
        createEl('div', {
          className: 'text-muted small',
          text: 'Noch keine Sonderentlassungen festgelegt.',
        }),
      );
    }

    entlassungState.special.forEach((entry, entryIndex) => {
      const dateValue = typeof entry?.date === 'string' ? entry.date : '';
      const entrySlots = Array.isArray(entry?.times) ? entry.times : [];
      sortEntlassungSlots(entrySlots);
      const assignedMap = new Map();
      entrySlots.forEach((slot, index) => {
        (slot?.children || []).forEach((child) => {
          if (!assignedMap.has(child)) {
            assignedMap.set(child, index);
          }
        });
      });

      const dateInput = createEl('input', {
        className: 'form-control form-control-sm',
        attrs: { type: 'date', 'aria-label': 'Datum' },
      });
      if (dateValue) {
        dateInput.value = dateValue;
      }
      const removeDateButton = createEl('button', {
        className: 'btn btn-outline-danger btn-sm',
        attrs: { type: 'button' },
        text: 'Entfernen',
      });
      const addTimeButton = createEl('button', {
        className: 'btn btn-outline-primary btn-sm',
        attrs: { type: 'button' },
        text: 'Uhrzeit hinzufügen',
      });

      const headerRow = createEl('div', {
        className: 'd-flex flex-column flex-sm-row align-items-start align-items-sm-center gap-2',
        children: [
          createEl('div', { className: 'flex-grow-1', children: [dateInput] }),
          addTimeButton,
          removeDateButton,
        ],
      });

      const entryErrorText = entlassungSpecialErrors[dateValue]
        ? createEl('div', { className: 'text-danger small', text: entlassungSpecialErrors[dateValue] })
        : null;

      const slotList = createEl('div', { className: 'd-flex flex-column gap-2' });

      entrySlots.forEach((slot, index) => {
        const slotWrapper = createEl('div', {
          className: 'border rounded-3 p-2 d-flex flex-column gap-2',
        });
        const timeInput = createEl('input', {
          className: 'form-control form-control-sm',
          attrs: {
            type: 'time',
            step: '300',
            'aria-label': 'Entlassungszeit',
          },
        });
        if (slot?.time) {
          timeInput.value = slot.time;
        }
        const removeButton = createEl('button', {
          className: 'btn btn-outline-danger btn-sm',
          attrs: { type: 'button' },
          text: 'Entfernen',
        });

        const timeRow = createEl('div', {
          className: 'd-flex flex-column flex-sm-row align-items-start align-items-sm-center gap-2',
          children: [
            createEl('div', { className: 'flex-grow-1', children: [timeInput] }),
            removeButton,
          ],
        });

        const childList = createEl('div', { className: 'd-flex flex-wrap gap-2' });
        childrenList.forEach((child) => {
          const isSelected = Array.isArray(slot?.children) && slot.children.includes(child);
          const assignedElsewhere =
            assignedMap.has(child) && assignedMap.get(child) !== index;
          if (assignedElsewhere && !isSelected) {
            return;
          }
          const childButton = createEl('button', {
            className: `btn btn-sm ${isSelected ? 'btn-primary' : 'btn-outline-secondary'}`,
            attrs: { type: 'button', 'aria-pressed': isSelected ? 'true' : 'false' },
            text: child,
          });
          childButton.addEventListener('click', () => {
            if (!slot.time) {
              setSpecialError(dateValue, 'Bitte zuerst eine Uhrzeit festlegen.');
              return;
            }
            const currentIndex = entrySlots.indexOf(slot);
            const nextChildren = Array.isArray(slot.children) ? [...slot.children] : [];
            if (isSelected) {
              slot.children = nextChildren.filter((name) => name !== child);
            } else {
              entrySlots.forEach((otherSlot, otherIndex) => {
                if (otherIndex === currentIndex || !Array.isArray(otherSlot?.children)) {
                  return;
                }
                otherSlot.children = otherSlot.children.filter((name) => name !== child);
              });
              slot.children = [...nextChildren, child];
            }
            entlassungState.special[entryIndex] = { ...entry, times: entrySlots };
            persistEntlassung();
            renderEntlassung();
          });
          childList.append(childButton);
        });

        timeInput.addEventListener('change', (event) => {
          const nextValue = event.target.value;
          if (
            nextValue &&
            entrySlots.some((other, otherIndex) => otherIndex !== index && other.time === nextValue)
          ) {
            setSpecialError(dateValue, 'Diese Uhrzeit existiert bereits für dieses Datum.');
            event.target.value = slot.time || '';
            return;
          }
          slot.time = nextValue;
          sortEntlassungSlots(entrySlots);
          entlassungState.special[entryIndex] = { ...entry, times: entrySlots };
          persistEntlassung();
          renderEntlassung();
        });

        removeButton.addEventListener('click', () => {
          const dateLabel = dateValue || 'ohne Datum';
          openEntlassungConfirm({
            label: `Sonderentlassung ${dateLabel}`,
            time: slot.time,
            onConfirm: () => {
              const currentIndex = entrySlots.indexOf(slot);
              if (currentIndex !== -1) {
                entrySlots.splice(currentIndex, 1);
              }
              entlassungState.special[entryIndex] = { ...entry, times: entrySlots };
              persistEntlassung();
              renderEntlassung();
            },
          });
        });

        slotWrapper.append(timeRow, childList);
        slotList.append(slotWrapper);
      });

      addTimeButton.addEventListener('click', () => {
        entrySlots.push({ time: '', children: [] });
        entlassungState.special[entryIndex] = { ...entry, times: entrySlots };
        renderEntlassung();
      });

      removeDateButton.addEventListener('click', () => {
        entlassungState.special.splice(entryIndex, 1);
        persistEntlassung();
        renderEntlassung();
      });

      dateInput.addEventListener('change', (event) => {
        const nextDate = event.target.value;
        if (!nextDate) {
          setSpecialError(dateValue, 'Bitte ein gültiges Datum auswählen.');
          event.target.value = dateValue;
          return;
        }
        if (
          entlassungState.special.some(
            (other, otherIndex) => otherIndex !== entryIndex && other?.date === nextDate,
          )
        ) {
          setSpecialError(dateValue, 'Dieses Datum existiert bereits.');
          event.target.value = dateValue;
          return;
        }
        entlassungState.special[entryIndex] = { ...entry, date: nextDate, times: entrySlots };
        persistEntlassung();
        renderEntlassung();
      });

      const entrySection = createEl('div', {
        className: 'border rounded-3 p-3 d-flex flex-column gap-2',
        children: [headerRow, entryErrorText, slotList].filter(Boolean),
      });

      entlassungSpecialContainer.append(entrySection);
    });

    window.requestAnimationFrame(() => {
      content.scrollTop = previousScrollTop;
      content.scrollLeft = previousScrollLeft;
    });
  };

  const handleChildSave = () => {
    const existingNames = getExistingNames(activeChildId);
    const { normalized, errors } = validateName(childFormName, existingNames);
    const nextErrors = [...errors];
    if (!normalized) {
      nextErrors.push('Name darf nicht leer sein.');
    }
    childFormErrors = Array.from(new Set(nextErrors));
    renderChildFormErrors();
    if (childFormErrors.length) {
      return;
    }

    const normalizedNote = typeof childFormNote === 'string' ? childFormNote : '';
    let nextRows = [...rows];
    if (activeChildId) {
      const targetIndex = nextRows.findIndex((row) => row.id === activeChildId);
      if (targetIndex !== -1) {
        const targetRow = nextRows[targetIndex];
        nextRows[targetIndex] = {
          ...targetRow,
          name: normalized,
          note: normalizedNote,
          validationMessages: [],
          originalName: targetRow.originalName || targetRow.name || normalized,
        };
      }
    } else {
      const newRow = {
        id: `class-row-${++rowCounter}`,
        name: normalized,
        originalName: normalized,
        note: normalizedNote,
        persisted: true,
        validationMessages: [],
      };
      nextRows = [...nextRows, newRow];
      showChildAddedToast('Neues Kind wurde hinzugefügt.');
    }

    childFormErrors = [];
    persistRows(nextRows);
    closeChildDetailOverlay();
  };

  const syncRows = (nextProfile = {}, nextChildren = []) => {
    const notes = nextProfile.childrenNotes || {};
    const drafts = rows.filter(
      (row) => !normalizeChildName(row.name) && !normalizeChildName(row.originalName),
    );
    const nextRows = [];
    const uniqueChildren = Array.isArray(nextChildren) ? nextChildren : [];

    uniqueChildren.forEach((child) => {
      const normalizedChild = normalizeChildName(child);
      if (!normalizedChild) {
        return;
      }
      const existing =
        rows.find(
          (row) =>
            normalizeChildName(row.name) === normalizedChild ||
            normalizeChildName(row.originalName) === normalizedChild,
        ) || null;
      const note =
        typeof notes[normalizedChild] === 'string' ? notes[normalizedChild] : '';
      if (existing) {
        existing.name = normalizedChild;
        existing.originalName = normalizedChild;
        existing.note = note;
        existing.persisted = true;
        nextRows.push(existing);
      } else {
        nextRows.push({
          id: `class-row-${++rowCounter}`,
          name: normalizedChild,
          originalName: normalizedChild,
          note,
          persisted: true,
        });
      }
    });

    rows = [...nextRows, ...drafts];
    const maxId = rows.reduce((acc, row) => {
      const match = /class-row-(\d+)/.exec(row.id || '');
      const value = match ? Number.parseInt(match[1], 10) : 0;
      return Number.isNaN(value) ? acc : Math.max(acc, value);
    }, 0);
    rowCounter = Math.max(rowCounter, maxId);
    renderChildPills();
  };

  teacherNameInput.addEventListener('input', persistProfile);
  nameInput.addEventListener('input', persistProfile);
  badgeInput.addEventListener('input', persistProfile);
  mottoInput.addEventListener('input', persistProfile);
  notesInput.addEventListener('input', persistProfile);

  const deleteChildNameInput = content.querySelector('[data-role="delete-child-name"]');
  const deleteChildFeedbackBox = content.querySelector('[data-role="delete-child-feedback"]');
  const deleteChildSubmitControl = content.querySelector('[data-role="delete-child-submit"]');
  childNameInput.addEventListener('input', (event) => {
    childFormName = event.target.value;
    childFormErrors = [];
    renderChildFormErrors();
  });

  childNameInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      handleChildSave();
    }
  });

  childNoteInput.addEventListener('input', (event) => {
    childFormNote = event.target.value;
  });

  childDetailForm.addEventListener('submit', (event) => {
    event.preventDefault();
    handleChildSave();
  });
  childSaveButton.addEventListener('click', (event) => {
    event.preventDefault();
    handleChildSave();
  });
  childCancelButton.addEventListener('click', (event) => {
    event.preventDefault();
    closeChildDetailOverlay();
  });
  childDetailClose.addEventListener('click', () => {
    closeChildDetailOverlay();
  });
  childDetailOverlay.addEventListener('click', (event) => {
    if (event.target === childDetailOverlay) {
      closeChildDetailOverlay();
    }
  });
  childDetailOverlay.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeChildDetailOverlay();
    }
  });

  const renderDeleteChildFeedback = () => {
    if (!deleteChildFeedbackBox) {
      return;
    }
    deleteChildFeedbackBox.replaceChildren();
    if (!deleteChildFeedbackMessage) {
      deleteChildFeedbackBox.classList.add('d-none');
      deleteChildFeedbackBox.classList.remove('text-danger', 'text-success');
      return;
    }
    deleteChildFeedbackBox.append(createEl('div', { text: deleteChildFeedbackMessage }));
    deleteChildFeedbackBox.classList.remove('d-none');
    deleteChildFeedbackBox.classList.remove('text-danger', 'text-success');
    deleteChildFeedbackBox.classList.add(
      deleteChildFeedbackState === 'success' ? 'text-success' : 'text-danger',
    );
  };

  const resetDeleteChildFeedback = () => {
    deleteChildFeedbackMessage = '';
    deleteChildFeedbackState = 'idle';
    renderDeleteChildFeedback();
  };

  const updateDeleteConfirmationDialog = () => {
    if (!deleteChildConfirmDialog) {
      return;
    }
    const hasLabel = Boolean(deleteChildConfirmationLabel);
    deleteChildConfirmName.textContent = hasLabel ? `„${deleteChildConfirmationLabel}“` : '';
    deleteChildConfirmName.classList.toggle('d-none', !hasLabel);
  };

  const hideDeleteConfirmationDialog = () => {
    deleteChildConfirmDialog.classList.add('d-none');
    deleteChildConfirmDialog.setAttribute('aria-hidden', 'true');
  };

  const clearDeleteConfirmation = () => {
    deleteChildConfirmationTarget = '';
    deleteChildConfirmationLabel = '';
  };

  const closeDeleteConfirmation = () => {
    hideDeleteConfirmationDialog();
    clearDeleteConfirmation();
  };

  const showDeleteConfirmationDialog = () => {
    updateDeleteConfirmationDialog();
    deleteChildConfirmDialog.classList.remove('d-none');
    deleteChildConfirmDialog.setAttribute('aria-hidden', 'false');
    window.requestAnimationFrame(() => {
      deleteChildConfirmSubmit?.focus();
    });
  };

  const performDeleteChild = (normalizedTarget) => {
    if (!normalizedTarget) {
      return;
    }
    rows = rows.filter((row) => {
      const normalizedName = normalizeChildName(row.name);
      const normalizedOriginal = normalizeChildName(row.originalName);
      return normalizedName !== normalizedTarget && normalizedOriginal !== normalizedTarget;
    });
    saveClassChildren(rows);
    renderChildPills();
    deleteChildName = '';
    if (deleteChildNameInput) {
      deleteChildNameInput.value = '';
    }
    deleteChildFeedbackMessage = 'Das Kind und die zugehörigen Daten wurden gelöscht.';
    deleteChildFeedbackState = 'success';
    renderDeleteChildFeedback();
  };

  const handleDeleteChild = () => {
    const normalizedTarget = normalizeChildName(deleteChildName);
    if (!normalizedTarget) {
      deleteChildFeedbackMessage = 'Bitte gib einen gültigen Namen ein.';
      deleteChildFeedbackState = 'error';
      renderDeleteChildFeedback();
      return;
    }
    const existingRow = rows.find((row) => {
      const normalizedName = normalizeChildName(row.name);
      const normalizedOriginal = normalizeChildName(row.originalName);
      return normalizedName === normalizedTarget || normalizedOriginal === normalizedTarget;
    });
    if (!existingRow) {
      deleteChildFeedbackMessage = 'Kein Kind mit diesem Namen gefunden.';
      deleteChildFeedbackState = 'error';
      renderDeleteChildFeedback();
      return;
    }
    deleteChildConfirmationTarget = normalizedTarget;
    deleteChildConfirmationLabel = existingRow.name || existingRow.originalName || deleteChildName;
    resetDeleteChildFeedback();
    showDeleteConfirmationDialog();
  };

  addRowButton.addEventListener('click', () => {
    openChildDetailOverlay();
  });
  addCourseButton.addEventListener('click', () => {
    const newCourse = {
      id: createCourseId(),
      name: '',
      icon: '',
      day: '',
      time: '',
      children: [],
    };
    coursesState.push(newCourse);
    coursesList.append(buildCourseCard(newCourse, getAvailableChildren()));
    emptyCourses.classList.toggle('d-none', coursesState.length > 0);
    persistCourses();
  });

  const open = () => {
    overlay.classList.add('is-open');
    overlay.setAttribute('aria-hidden', 'false');
    document.body.classList.add('class-settings-overlay-open');
    window.requestAnimationFrame(() => {
      nameInput.focus({ preventScroll: true });
    });
  };

  const close = () => {
    closeDeleteConfirmation();
    closeChildDetailOverlay();
    overlay.classList.remove('is-open');
    overlay.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('class-settings-overlay-open');
  };

  closeButton.addEventListener('click', () => {
    close();
  });

  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) {
      close();
    }
  });

  if (deleteChildNameInput) {
    deleteChildNameInput.addEventListener('input', (event) => {
      deleteChildName = event.target.value;
      resetDeleteChildFeedback();
    });
    deleteChildNameInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        handleDeleteChild();
      }
    });
  }
  if (deleteChildSubmitControl) {
    deleteChildSubmitControl.addEventListener('click', handleDeleteChild);
  }
  if (deleteChildConfirmCancel) {
    deleteChildConfirmCancel.addEventListener('click', () => {
      closeDeleteConfirmation();
    });
  }
  if (deleteChildConfirmSubmit) {
    deleteChildConfirmSubmit.addEventListener('click', () => {
      performDeleteChild(deleteChildConfirmationTarget);
      closeDeleteConfirmation();
    });
  }
  deleteChildConfirmDialog.addEventListener('click', (event) => {
    if (event.target === deleteChildConfirmDialog) {
      closeDeleteConfirmation();
    }
  });
  deleteChildConfirmDialog.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeDeleteConfirmation();
    }
  });

  const update = ({ profile: nextProfile = {}, children: nextChildren = [] } = {}) => {
    updateProfileInputs(nextProfile);
    syncRows(nextProfile, nextChildren);
    coursesState = normalizeCourses(nextProfile.courses, getAvailableChildren()).map((course) => ({
      ...course,
      id: createCourseId(),
    }));
    renderCourses();
    entlassungState = normalizeEntlassung(nextProfile.entlassung, getAvailableChildren());
    renderEntlassung();
  };

  update({ profile, children });

  return {
    element: overlay,
    open,
    close,
    update,
  };
};
