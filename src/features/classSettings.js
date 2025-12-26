import { saveClassChildren, saveClassProfileFields } from '../db/dbRepository.js';
import { normalizeChildName } from '../db/dbSchema.js';
import { createEl } from '../ui/dom.js';
import { debounce } from '../utils/debounce.js';

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
});

export const createClassSettingsView = ({ profile = {}, children = [] } = {}) => {
  let rowCounter = 0;
  let rows = [];
  const rowElements = new Map();

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
    createEl('th', { className: 'small text-muted text-end', text: '' }),
  );
  thead.append(headerRow);
  const tbody = createEl('tbody');
  table.append(thead, tbody);

  const addRowButton = createEl('button', {
    className: 'btn btn-outline-primary btn-sm d-inline-flex align-items-center gap-2',
    attrs: { type: 'button' },
    children: [createEl('span', { text: '＋' }), createEl('span', { text: 'Kind hinzufügen' })],
  });
  const childrenHeader = createEl('div', {
    className: 'd-flex justify-content-between align-items-center gap-2',
    children: [createEl('h4', { className: 'h6 mb-0 text-muted', text: 'Kinderliste' }), addRowButton],
  });

  const childrenContent = createEl('div', {
    className: 'd-flex flex-column gap-3',
    children: [
      childrenHeader,
      createEl('div', {
        className: 'alert alert-light border small mb-0',
        text: 'Hier verwaltest du alle Kinder, denen Beobachtungen zugeordnet werden.',
      }),
      table,
    ],
  });

  const childrenItem = buildAccordionItem({
    id: 'class-children',
    title: 'Kinderliste',
    content: childrenContent,
    accordionId,
  });

  accordion.append(generalItem.element, childrenItem.element);
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

  const persistRows = debounce(() => {
    saveClassChildren(rows);
    rows = rows.map((row) => {
      const normalizedName = normalizeChildName(row.name);
      const normalizedNote = typeof row.note === 'string' ? row.note : '';
      if (normalizedName) {
        return {
          ...row,
          name: normalizedName,
          originalName: normalizedName,
          note: normalizedNote,
          persisted: true,
        };
      }
      return {
        ...row,
        note: normalizedNote,
      };
    });
    renderRows();
  }, 220);

  const handleRowChange = (rowId, key, value) => {
    const row = rows.find((item) => item.id === rowId);
    if (!row) {
      return;
    }
    row[key] = value;
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
    const removeButton = createEl('button', {
      className: 'btn btn-link text-danger p-0 class-settings__remove',
      attrs: { type: 'button', 'aria-label': 'Entfernen' },
      text: '✕',
    });

    nameInputEl.addEventListener('input', (event) => {
      handleRowChange(row.id, 'name', event.target.value);
    });
    noteInputEl.addEventListener('input', (event) => {
      handleRowChange(row.id, 'note', event.target.value);
    });
    removeButton.addEventListener('click', () => {
      rows = rows.filter((item) => item.id !== row.id);
      if (!rows.length) {
        rows.push(createRowState(++rowCounter));
      }
      renderRows();
      persistRows();
    });

    const nameCell = createEl('td', { children: [nameInputEl] });
    const noteCell = createEl('td', { children: [noteInputEl] });
    const removeCell = createEl('td', {
      className: 'text-end',
      children: [removeButton],
    });
    tr.append(nameCell, noteCell, removeCell);
    return { rowEl: tr, nameInputEl, noteInputEl };
  };

  const updateRowInputs = (rowElRefs, row) => {
    if (rowElRefs.nameInputEl.value !== row.name) {
      rowElRefs.nameInputEl.value = row.name;
    }
    if (rowElRefs.noteInputEl.value !== row.note) {
      rowElRefs.noteInputEl.value = row.note;
    }
  };

  const renderRows = () => {
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
    if (!rows.length) {
      rows.push(createRowState(++rowCounter));
    }
    renderRows();
  };

  nameInput.addEventListener('input', persistProfile);
  badgeInput.addEventListener('input', persistProfile);
  mottoInput.addEventListener('input', persistProfile);
  notesInput.addEventListener('input', persistProfile);

  addRowButton.addEventListener('click', () => {
    const newRow = createRowState(++rowCounter);
    rows.push(newRow);
    renderRows();
    window.requestAnimationFrame(() => {
      const newRowRefs = rowElements.get(newRow.id);
      newRowRefs?.nameInputEl?.focus();
    });
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
