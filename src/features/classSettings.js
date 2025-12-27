import { saveClassChildren, saveClassProfileFields } from '../db/dbRepository.js';
import { normalizeChildName } from '../db/dbSchema.js';
import { createEl } from '../ui/dom.js';
import { debounce } from '../utils/debounce.js';

const SEPARATORS = [' ', '-', '\u2010', "'", '’', 'ʼ', '.'];
const isLatinLetter = (ch) => /\p{Letter}/u.test(ch) && /\p{Script=Latin}/u.test(ch);
const isCombiningMark = (ch) => /\p{M}/u.test(ch);
const isSeparator = (ch) => SEPARATORS.includes(ch);

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
  const rowElements = new Map();
  let newChildName = '';
  let newChildNote = '';
  let newChildErrors = [];
  let isNewChildOpen = false;
  let toastContainer = null;
  let deleteChildName = '';
  let deleteChildFeedbackMessage = '';
  let deleteChildFeedbackState = 'idle';

  const overlay = createEl('div', {
    className: 'class-settings-overlay',
    attrs: { 'aria-hidden': 'true' },
  });
  const panel = createEl('div', { className: 'class-settings-overlay__panel' });
  const header = createEl('div', { className: 'class-settings-overlay__header' });
  const title = createEl('h3', { className: 'h4 mb-0', text: 'Meine Klasse' });
  const closeButton = createEl('button', {
    className: 'btn-close class-settings-overlay__close',
    attrs: { type: 'button', 'aria-label': 'Schließen' },
  });
  header.append(title, closeButton);

  const content = createEl('div', { className: 'class-settings-overlay__content' });
  const intro = createEl('p', {
    className: 'text-muted small mb-3',
    text: 'Verwalte allgemeine Angaben sowie die Kinderliste für deine Gruppe.',
  });

  const accordionId = 'classSettingsAccordion';
  const accordion = createEl('div', {
    className: 'accordion',
    attrs: { id: accordionId },
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

  const table = createEl('table', { className: 'table table-sm align-middle class-settings__table' });
  const thead = createEl('thead');
  const headerRow = createEl('tr');
  headerRow.append(
    createEl('th', { className: 'small text-muted', text: 'Kinder' }),
    createEl('th', { className: 'small text-muted', text: 'Notizen' }),
  );
  thead.append(headerRow);
  const tbody = createEl('tbody');
  table.append(thead, tbody);

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

  const newChildCard = createEl('div', {
    className: 'card border-0 shadow-sm d-none',
    dataset: { role: 'new-child-card' },
  });

  const newChildCardBody = createEl('div', {
    className: 'card-body d-flex flex-column gap-2',
  });

  const newChildNameInput = createEl('input', {
    className: 'form-control form-control-sm',
    attrs: {
      type: 'text',
      placeholder: 'Name eingeben',
      'aria-label': 'Neues Kind',
    },
    dataset: { role: 'new-child-name' },
  });

  const newChildNoteInput = createEl('textarea', {
    className: 'form-control form-control-sm',
    attrs: {
      rows: '1',
      placeholder: 'Notizen',
      'aria-label': 'Notizen zum Kind',
    },
    dataset: { role: 'new-child-note' },
  });

  const newChildSubmitButton = createEl('button', {
    className: 'btn btn-primary btn-sm w-100',
    attrs: { type: 'button', 'aria-label': 'Kind hinzufügen' },
    dataset: { role: 'new-child-submit' },
    text: 'Dodaj',
  });

  const newChildErrorsEl = createEl('div', {
    className: 'text-danger small d-none',
    dataset: { role: 'new-child-errors' },
  });

  newChildCardBody.append(
    createEl('div', {
      className: 'row g-2 align-items-start',
      children: [
        createEl('div', {
          className: 'col-12 col-md-5',
          children: [
            createFormGroup({
              id: 'new-child-name',
              label: 'Neues Kind',
              control: newChildNameInput,
            }),
          ],
        }),
        createEl('div', {
          className: 'col-12 col-md-5',
          children: [
            createFormGroup({
              id: 'new-child-note',
              label: 'Notizen',
              control: newChildNoteInput,
            }),
          ],
        }),
        createEl('div', {
          className: 'col-12 col-md-2 d-flex align-items-end justify-content-start',
          children: [newChildSubmitButton],
        }),
      ],
    }),
    newChildErrorsEl,
  );

  newChildCard.append(newChildCardBody);

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
      newChildCard,
      table,
    ],
  });

  const childrenItem = buildAccordionItem({
    id: 'class-children',
    title: 'Kinderliste',
    content: childrenContent,
    accordionId,
  });

  const cautionContent = createEl('div', {
    className: 'd-flex flex-column gap-2',
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
  cautionContent.append(deleteChildCard);

  const cautionItem = buildAccordionItem({
    id: 'class-caution',
    title: 'Vorsicht!',
    content: cautionContent,
    accordionId,
  });

  accordion.append(generalItem.element, childrenItem.element, cautionItem.element);
  content.append(intro, accordion);
  panel.append(header, content);
  overlay.append(panel);

  const updateProfileInputs = (nextProfile = {}) => {
    const nextName = typeof nextProfile.name === 'string' ? nextProfile.name : '';
    const nextBadge = typeof nextProfile.badge === 'string' ? nextProfile.badge : '';
    const nextMotto = typeof nextProfile.motto === 'string' ? nextProfile.motto : '';
    const nextNotes = typeof nextProfile.notes === 'string' ? nextProfile.notes : '';

    if (nameInput.value !== nextName) {
      nameInput.value = nextName;
    }
    if (badgeInput.value !== nextBadge) {
      badgeInput.value = nextBadge;
    }
    if (mottoInput.value !== nextMotto) {
      mottoInput.value = nextMotto;
    }
    if (notesInput.value !== nextNotes) {
      notesInput.value = nextNotes;
    }
  };

  const persistProfile = debounce(() => {
    saveClassProfileFields({
      name: nameInput.value,
      badge: badgeInput.value,
      motto: mottoInput.value,
      notes: notesInput.value,
    });
  }, 200);

  const applyValidation = () => {
    const seenNames = [];
    rows.forEach((row) => {
      const { normalized, errors } = validateName(row.name, seenNames);
      row.validationMessages = errors;
      row.normalizedName = normalized;
      if (!errors.length && normalized) {
        seenNames.push(normalized.toLocaleLowerCase());
      }
    });
    return rows.some((row) => row.validationMessages.length);
  };

  const persistRows = debounce(() => {
    const hasErrors = applyValidation();
    renderRows();
    if (hasErrors) {
      return;
    }
    const nextRows = rows.map((row) => {
      const normalizedName = row.normalizedName || normalizeChildName(row.name);
      const normalizedNote = typeof row.note === 'string' ? row.note : '';
      if (normalizedName) {
        return {
          ...row,
          name: normalizedName,
          originalName: normalizedName,
          note: normalizedNote,
          persisted: true,
          validationMessages: [],
        };
      }
      return {
        ...row,
        note: normalizedNote,
      };
    });
    rows = nextRows;
    saveClassChildren(rows);
    rows.forEach((row) => {
      const rowRefs = rowElements.get(row.id);
      if (!rowRefs) {
        return;
      }
      if (rowRefs.nameInputEl.value !== row.name) {
        rowRefs.nameInputEl.value = row.name;
      }
      if (rowRefs.noteInputEl.value !== row.note) {
        rowRefs.noteInputEl.value = row.note;
      }
    });
  }, 220);

  const handleRowInput = (rowId, key, value) => {
    const row = rows.find((item) => item.id === rowId);
    if (!row) {
      return;
    }
    row[key] = value;
  };

  const handleRowBlur = () => {
    persistRows();
  };

  const buildRowElement = (row) => {
    const tr = createEl('tr', { dataset: { rowId: row.id } });
    const nameInputEl = createEl('input', {
      className: 'form-control form-control-sm',
      attrs: {
        type: 'text',
        placeholder: 'Name eingeben',
        'aria-label': 'Kind',
      },
    });
    const noteInputEl = createEl('textarea', {
      className: 'form-control form-control-sm',
      attrs: { rows: '1', placeholder: 'Notizen', 'aria-label': 'Notizen' },
    });
    const errorBox = createEl('div', {
      className: 'form-text text-danger small pt-1 class-settings__errors',
    });

    nameInputEl.addEventListener('input', (event) => {
      handleRowInput(row.id, 'name', event.target.value);
      row.validationMessages = [];
      updateRowInputs({ nameInputEl, noteInputEl, errorBox }, row);
    });
    nameInputEl.addEventListener('blur', handleRowBlur);
    noteInputEl.addEventListener('input', (event) => {
      handleRowInput(row.id, 'note', event.target.value);
    });
    noteInputEl.addEventListener('blur', handleRowBlur);

    const nameCell = createEl('td', { children: [nameInputEl] });
    const noteCell = createEl('td', { children: [noteInputEl, errorBox] });
    tr.append(nameCell, noteCell);
    return { rowEl: tr, nameInputEl, noteInputEl, errorBox };
  };

  const updateRowInputs = (rowElRefs, row) => {
    if (rowElRefs.nameInputEl.value !== row.name) {
      rowElRefs.nameInputEl.value = row.name;
    }
    if (rowElRefs.noteInputEl.value !== row.note) {
      rowElRefs.noteInputEl.value = row.note;
    }
    if (rowElRefs.errorBox) {
      rowElRefs.errorBox.replaceChildren();
      (row.validationMessages || []).forEach((msg) => {
        rowElRefs.errorBox.append(createEl('div', { text: msg }));
      });
      rowElRefs.errorBox.classList.toggle('d-none', !row.validationMessages?.length);
    }
  };

  const renderRows = () => {
    const previousScrollTop = content.scrollTop;
    const existingIds = new Set();
    rows.forEach((row) => {
      let rowRefs = rowElements.get(row.id);
      if (!rowRefs) {
        rowRefs = buildRowElement(row);
        rowElements.set(row.id, rowRefs);
      }
      updateRowInputs(rowRefs, row);
      existingIds.add(row.id);
      tbody.append(rowRefs.rowEl);
    });

    Array.from(rowElements.keys()).forEach((id) => {
      if (!existingIds.has(id)) {
        const refs = rowElements.get(id);
        if (refs?.rowEl?.parentElement === tbody) {
          tbody.removeChild(refs.rowEl);
        }
        rowElements.delete(id);
      }
    });
    content.scrollTop = previousScrollTop;
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
    renderRows();
  };

  nameInput.addEventListener('input', persistProfile);
  badgeInput.addEventListener('input', persistProfile);
  mottoInput.addEventListener('input', persistProfile);
  notesInput.addEventListener('input', persistProfile);

  const newChildNameInputField = content.querySelector('[data-role="new-child-name"]');
  const newChildNoteInputField = content.querySelector('[data-role="new-child-note"]');
  const newChildErrorsBox = newChildErrorsEl;
  const newChildSubmitControl = content.querySelector('[data-role="new-child-submit"]');
  const newChildCardEl = content.querySelector('[data-role="new-child-card"]');
  const deleteChildNameInput = content.querySelector('[data-role="delete-child-name"]');
  const deleteChildFeedbackBox = content.querySelector('[data-role="delete-child-feedback"]');
  const deleteChildSubmitControl = content.querySelector('[data-role="delete-child-submit"]');

  const renderNewChildErrors = () => {
    if (!newChildErrorsBox) {
      return;
    }
    newChildErrorsBox.replaceChildren();
    newChildErrors.forEach((msg) => {
      newChildErrorsBox.append(createEl('div', { text: msg }));
    });
    newChildErrorsBox.classList.toggle('d-none', !newChildErrors.length);
  };

  const resetNewChildForm = () => {
    newChildName = '';
    newChildNote = '';
    newChildErrors = [];
    if (newChildNameInputField) {
      newChildNameInputField.value = '';
    }
    if (newChildNoteInputField) {
      newChildNoteInputField.value = '';
    }
    renderNewChildErrors();
  };

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

  const showNewChildForm = () => {
    isNewChildOpen = true;
    resetNewChildForm();
    if (newChildCardEl) {
      newChildCardEl.classList.remove('d-none');
    }
    window.requestAnimationFrame(() => {
      newChildNameInputField?.focus();
    });
  };

  const hideNewChildForm = () => {
    isNewChildOpen = false;
    if (newChildCardEl) {
      newChildCardEl.classList.add('d-none');
    }
  };

  const handleAddNewChild = () => {
    const canonicalExisting = rows
      .map((row) => (row.name ? row.name.toLocaleLowerCase() : ''))
      .filter(Boolean);
    const { normalized, errors } = validateName(newChildName, canonicalExisting);
    const nextErrors = [...errors];
    if (!normalized) {
      nextErrors.push('Name darf nicht leer sein.');
    }
    newChildErrors = Array.from(new Set(nextErrors));
    renderNewChildErrors();
    if (newChildErrors.length) {
      return;
    }
    const newRow = {
      id: `class-row-${++rowCounter}`,
      name: normalized,
      originalName: normalized,
      note: typeof newChildNote === 'string' ? newChildNote : '',
      persisted: true,
      validationMessages: [],
    };
    rows = [...rows, newRow];
    saveClassChildren(rows);
    renderRows();
    resetNewChildForm();
    showNewChildForm();
    showChildAddedToast('Neues Kind wurde hinzugefügt.');
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
    rows = rows.filter((row) => {
      const normalizedName = normalizeChildName(row.name);
      const normalizedOriginal = normalizeChildName(row.originalName);
      return normalizedName !== normalizedTarget && normalizedOriginal !== normalizedTarget;
    });
    saveClassChildren(rows);
    renderRows();
    deleteChildName = '';
    if (deleteChildNameInput) {
      deleteChildNameInput.value = '';
    }
    deleteChildFeedbackMessage = 'Das Kind und die zugehörigen Daten wurden gelöscht.';
    deleteChildFeedbackState = 'success';
    renderDeleteChildFeedback();
  };

  addRowButton.addEventListener('click', () => {
    if (isNewChildOpen) {
      hideNewChildForm();
      return;
    }
    showNewChildForm();
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

  if (newChildNameInputField) {
    newChildNameInputField.addEventListener('input', (event) => {
      newChildName = event.target.value;
      newChildErrors = [];
      renderNewChildErrors();
    });
    newChildNameInputField.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        handleAddNewChild();
      }
    });
  }
  if (newChildNoteInputField) {
    newChildNoteInputField.addEventListener('input', (event) => {
      newChildNote = event.target.value;
    });
  }
  if (newChildSubmitControl) {
    newChildSubmitControl.addEventListener('click', handleAddNewChild);
  }
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

  const update = ({ profile: nextProfile = {}, children: nextChildren = [] } = {}) => {
    updateProfileInputs(nextProfile);
    syncRows(nextProfile, nextChildren);
  };

  update({ profile, children });

  return {
    element: overlay,
    open,
    close,
    update,
  };
};
