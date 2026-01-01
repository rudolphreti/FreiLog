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

  accordion.append(generalItem.element, childrenItem.element, cautionItem.element);
  content.append(intro, accordion);
  panel.append(header, content);
  overlay.append(panel, childDetailOverlay, deleteChildConfirmDialog);

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
  };

  update({ profile, children });

  return {
    element: overlay,
    open,
    close,
    update,
  };
};
