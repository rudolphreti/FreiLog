import { createEl } from './dom.js';

export const buildHeader = ({ selectedDate }) => {
  const header = createEl('header', {
    className: 'bg-white shadow-sm rounded-4 px-3 py-3 sticky-top',
  });

  const menuButton = createEl('button', {
    className: 'btn btn-outline-primary d-inline-flex align-items-center',
    text: '☰',
    attrs: {
      type: 'button',
      'aria-label': 'Menü öffnen',
      'data-bs-toggle': 'offcanvas',
      'data-bs-target': '#mainDrawer',
      'aria-controls': 'mainDrawer',
    },
  });
  const title = createEl('h1', {
    className: 'h4 mb-0',
    text: 'Beobachtungen',
  });
  const titleGroup = createEl('div', {
    className: 'd-flex align-items-center gap-2',
    children: [menuButton, title],
  });

  const dateLabel = createEl('label', {
    className: 'form-label text-muted small mb-1',
    text: 'Datum',
  });
  const dateInput = createEl('input', {
    className: 'form-control',
    attrs: { type: 'date', value: selectedDate },
  });
  const dateGroup = createEl('div', {
    className: 'd-flex flex-column',
    children: [dateLabel, dateInput],
  });

  const headerContent = createEl('div', {
    className:
      'd-flex flex-column flex-md-row align-items-md-center justify-content-between gap-3',
    children: [titleGroup, dateGroup],
  });

  header.append(headerContent);

  return {
    element: header,
    refs: {
      dateInput,
      menuButton,
    },
  };
};

export const buildDrawerShell = () => {
  const drawer = createEl('aside', {
    className: 'offcanvas offcanvas-start',
    attrs: { tabindex: '-1', id: 'mainDrawer', 'aria-labelledby': 'drawerTitle' },
  });

  const drawerHeader = createEl('div', { className: 'offcanvas-header' });
  const drawerTitle = createEl('h2', {
    className: 'offcanvas-title h5',
    attrs: { id: 'drawerTitle' },
    text: 'Menü',
  });
  const closeButton = createEl('button', {
    className: 'btn-close',
    attrs: {
      type: 'button',
      'aria-label': 'Menü schließen',
      'data-bs-dismiss': 'offcanvas',
    },
  });
  drawerHeader.append(drawerTitle, closeButton);

  const body = createEl('div', {
    className: 'offcanvas-body d-flex flex-column gap-3',
    dataset: { drawerScroll: '' },
  });

  drawer.append(drawerHeader, body);

  return {
    element: drawer,
    refs: {
      closeButton,
      body,
    },
  };
};

const buildAccordionItem = ({
  id,
  title,
  defaultOpen,
  contentNode,
  accordionId,
}) => {
  const item = createEl('div', { className: 'accordion-item' });
  const headerId = `${id}-heading`;
  const collapseId = `${id}-collapse`;

  const header = createEl('h2', { className: 'accordion-header', attrs: { id: headerId } });
  const button = createEl('button', {
    className: `accordion-button${defaultOpen ? '' : ' collapsed'}`,
    text: title,
    attrs: {
      type: 'button',
      'data-bs-toggle': 'collapse',
      'data-bs-target': `#${collapseId}`,
      'aria-expanded': defaultOpen ? 'true' : 'false',
      'aria-controls': collapseId,
    },
  });
  header.append(button);

  const collapse = createEl('div', {
    className: `accordion-collapse collapse${defaultOpen ? ' show' : ''}`,
    attrs: {
      id: collapseId,
      'aria-labelledby': headerId,
      'data-bs-parent': `#${accordionId}`,
    },
  });

  const body = createEl('div', { className: 'accordion-body', children: [contentNode] });
  collapse.append(body);

  item.append(header, collapse);

  return {
    element: item,
    refs: {
      toggleButton: button,
      collapse,
    },
  };
};

export const buildDrawerContent = ({
  exportMode,
  drawerSections,
  attendanceSection,
  angebotSection,
}) => {
  const segmented = createEl('div', {
    className: 'btn-group w-100',
    attrs: { role: 'group', 'aria-label': 'Export-Modus' },
  });
  const exportDayButton = createEl('button', {
    className: `btn btn-outline-primary${exportMode === 'day' ? ' active' : ''}`,
    text: 'Export: Tag',
    attrs: { type: 'button' },
    dataset: { mode: 'day' },
  });
  const exportAllButton = createEl('button', {
    className: `btn btn-outline-primary${exportMode === 'all' ? ' active' : ''}`,
    text: 'Export: Alles',
    attrs: { type: 'button' },
    dataset: { mode: 'all' },
  });
  segmented.append(exportDayButton, exportAllButton);

  const exportButton = createEl('button', {
    className: 'btn btn-primary w-100',
    text: 'Exportieren',
    attrs: { type: 'button' },
  });
  const importButton = createEl('button', {
    className: 'btn btn-outline-primary w-100',
    text: 'Importieren',
    attrs: { type: 'button' },
  });
  const deleteButton = createEl('button', {
    className: 'btn btn-outline-danger w-100',
    text: 'Tag löschen',
    attrs: { type: 'button' },
  });
  const resetButton = createEl('button', {
    className: 'btn btn-outline-danger w-100',
    text: 'Reset (db.json)',
    attrs: { type: 'button' },
  });
  const actionsGroup = createEl('div', {
    className: 'd-grid gap-2',
    children: [segmented, exportButton, importButton, deleteButton, resetButton],
  });

  const accordionId = 'drawerAccordion';
  const accordion = createEl('div', { className: 'accordion', attrs: { id: accordionId } });

  const actionsSection = buildAccordionItem({
    id: 'actions',
    title: 'Aktionen',
    defaultOpen: Boolean(drawerSections?.actions),
    contentNode: actionsGroup,
    accordionId,
  });

  const attendanceContent =
    attendanceSection ||
    createEl('p', {
      className: 'text-muted mb-0',
      text: 'Platzhalter für spätere Funktionen.',
    });
  const attendanceSectionItem = buildAccordionItem({
    id: 'attendance',
    title: 'Anwesenheit',
    defaultOpen: Boolean(drawerSections?.attendance),
    contentNode: attendanceContent,
    accordionId,
  });

  const offersContent =
    angebotSection ||
    createEl('p', {
      className: 'text-muted mb-0',
      text: 'Platzhalter für spätere Funktionen.',
    });
  const offersSectionItem = buildAccordionItem({
    id: 'angebote',
    title: 'Angebote',
    defaultOpen: Boolean(drawerSections?.angebote),
    contentNode: offersContent,
    accordionId,
  });

  accordion.append(actionsSection.element, attendanceSectionItem.element, offersSectionItem.element);

  const importInput = createEl('input', {
    attrs: { type: 'file', accept: 'application/json' },
    className: 'd-none',
  });

  return {
    nodes: [accordion, importInput],
    refs: {
      exportModeButtons: [exportDayButton, exportAllButton],
      exportButton,
      importButton,
      deleteButton,
      resetButton,
      importInput,
      sections: {
        actions: actionsSection,
        attendance: attendanceSectionItem,
        angebote: offersSectionItem,
      },
    },
  };
};

const buildPill = ({ label, removeLabel, removeRole, value }) => {
  const labelSpan = createEl('span', { text: label });
  const removeButton = createEl('button', {
    className: 'btn btn-link btn-sm text-white p-0 ms-2',
    text: '✕',
    attrs: { type: 'button', 'aria-label': removeLabel },
    dataset: { role: removeRole, value },
  });
  return createEl('span', {
    className: 'badge rounded-pill text-bg-primary d-inline-flex align-items-center badge-pill',
    children: [labelSpan, removeButton],
    dataset: { value },
  });
};

export const buildAbsentChildrenSection = ({ children, absentChildren }) => {
  const absentTitle = createEl('h4', {
    className: 'h6 text-muted mb-2',
    text: 'Abwesend',
  });
  const absentList = createEl('div', { className: 'd-flex flex-wrap gap-2' });
  absentChildren.forEach((child) => {
    const pill = buildPill({
      label: child,
      removeLabel: `${child} wieder anwesend`,
      removeRole: 'absent-remove',
      value: child,
    });
    pill.dataset.child = child;
    const removeButton = pill.querySelector('[data-role="absent-remove"]');
    if (removeButton) {
      removeButton.dataset.child = child;
    }
    absentList.appendChild(pill);
  });

  const absentBlock = createEl('div', {
    className: 'd-flex flex-column',
    children: [absentTitle, absentList],
  });

  const allTitle = createEl('h4', {
    className: 'h6 text-muted mt-3 mb-2',
    text: 'Alle Kinder',
  });
  const allList = createEl('div', { className: 'list-group' });
  children.forEach((child) => {
    const isAbsent = absentChildren.includes(child);
    const name = createEl('span', { text: child });
    const status = isAbsent
      ? createEl('span', { className: 'badge text-bg-danger', text: 'abwesend' })
      : null;
    const row = createEl('button', {
      className: `list-group-item list-group-item-action d-flex align-items-center justify-content-between${
        isAbsent ? ' list-group-item-secondary is-absent' : ''
      }`,
      attrs: {
        type: 'button',
        'aria-pressed': isAbsent ? 'true' : 'false',
      },
      dataset: { role: 'attendance-row', child },
      children: status ? [name, status] : [name],
    });
    allList.appendChild(row);
  });

  const allBlock = createEl('div', {
    className: 'd-flex flex-column',
    children: [allTitle, allList],
  });

  const content = createEl('div', {
    className: 'd-flex flex-column gap-3',
    children: [absentBlock, allBlock],
  });

  return { element: content, refs: { absentList, allList } };
};

export const buildAngebotSection = ({
  angebote,
  selectedAngebote,
  newValue,
  savePresetChecked,
}) => {
  const activeAngebote = Array.isArray(selectedAngebote)
    ? selectedAngebote
    : [];
  const datalistId = 'angebote-list';
  const comboInput = createEl('input', {
    className: 'form-control',
    attrs: {
      type: 'text',
      list: datalistId,
      placeholder: 'Angebot auswählen...',
    },
    dataset: { role: 'angebot-input' },
  });
  comboInput.value = newValue || '';

  const datalist = createEl('datalist', { attrs: { id: datalistId } });
  angebote.forEach((item) => {
    datalist.appendChild(createEl('option', { attrs: { value: item } }));
  });

  const addButton = createEl('button', {
    className: 'btn btn-primary',
    text: 'Hinzufügen',
    attrs: { type: 'button' },
  });

  const savePresetInput = createEl('input', {
    className: 'form-check-input',
    attrs: { type: 'checkbox' },
    dataset: { role: 'angebot-save-preset' },
  });
  savePresetInput.checked = Boolean(savePresetChecked);
  const savePresetLabel = createEl('label', {
    className: 'form-check-label',
    text: 'Als Preset speichern',
  });
  const savePresetWrapper = createEl('div', {
    className: 'form-check',
    children: [savePresetInput, savePresetLabel],
  });

  const selectedTitle = createEl('h4', {
    className: 'h6 text-muted mt-3 mb-2',
    text: 'Heute ausgewählt',
  });
  const selectedList = createEl('div', {
    className: 'd-flex flex-wrap gap-2',
    dataset: { role: 'angebot-list' },
  });
  activeAngebote.forEach((angebot) => {
    const pill = buildPill({
      label: angebot,
      removeLabel: `${angebot} entfernen`,
      removeRole: 'angebot-remove',
      value: angebot,
    });
    pill.dataset.angebot = angebot;
    selectedList.appendChild(pill);
  });

  const comboRow = createEl('div', {
    className: 'd-flex flex-column gap-2',
    children: [comboInput, datalist],
  });
  const addRow = createEl('div', {
    className: 'd-flex flex-column gap-2',
    children: [addButton, savePresetWrapper],
  });

  const content = createEl('div', {
    className: 'd-flex flex-column gap-3',
    children: [comboRow, addRow, selectedTitle, selectedList],
  });

  return {
    element: content,
    refs: {
      comboInput,
      addButton,
      savePresetInput,
      selectedList,
    },
  };
};

const buildPillList = ({ items, getLabel, getRemoveLabel, removeRole }) => {
  const list = createEl('div', { className: 'd-flex flex-wrap gap-2' });
  items.forEach((item) => {
    const label = getLabel(item);
    const pill = createEl('span', {
      className: 'badge rounded-pill text-bg-secondary d-inline-flex align-items-center tag-badge',
      dataset: { value: label },
      children: [
        createEl('span', { text: label }),
        createEl('button', {
          className: 'btn btn-link btn-sm text-white p-0 ms-2',
          text: '✕',
          attrs: { type: 'button', 'aria-label': getRemoveLabel(label) },
          dataset: { role: removeRole, value: label },
        }),
      ],
    });
    list.appendChild(pill);
  });

  return list;
};

export const buildInitialFilterBar = ({ initials, selectedInitial }) => {
  const wrapper = createEl('div', { className: 'd-flex flex-wrap gap-2' });
  const buttons = [];
  const current = selectedInitial === 'ALL' ? 'ALL' : selectedInitial;

  const addButton = (label, value) => {
    const isActive = current === value;
    const button = createEl('button', {
      className: `btn btn-outline-secondary${isActive ? ' active' : ''}`,
      text: label,
      attrs: { type: 'button', 'aria-pressed': isActive ? 'true' : 'false' },
      dataset: { role: 'observation-filter', value },
    });
    buttons.push(button);
    wrapper.appendChild(button);
  };

  addButton('Alle', 'ALL');

  const letterList = Array.isArray(initials) ? initials : [];
  letterList.forEach((letter) => {
    addButton(letter, letter);
  });

  return { element: wrapper, buttons };
};

export const buildObservationsSection = ({
  children,
  observations,
  presets,
  initials,
  selectedInitial,
}) => {
  const section = createEl('section', {
    className: 'card shadow-sm border-0',
  });
  const body = createEl('div', { className: 'card-body d-flex flex-column gap-3' });
  const title = createEl('h2', {
    className: 'h5 mb-0 section-title',
    text: 'Beobachtungen',
  });
  const filterBar = buildInitialFilterBar({ initials, selectedInitial });

  const datalistId = 'observations-list';
  const datalist = createEl('datalist', { attrs: { id: datalistId } });
  presets.forEach((item) => {
    datalist.appendChild(createEl('option', { attrs: { value: item } }));
  });

  const list = createEl('div', { className: 'd-flex flex-column gap-3' });
  children.forEach((child) => {
    const data = observations[child] || {};
    const name = createEl('div', {
      className: 'fw-semibold',
      text: child,
    });
    const comboInput = createEl('input', {
      className: 'form-control',
      attrs: {
        type: 'text',
        list: datalistId,
        placeholder: 'Beobachtung hinzufügen…',
      },
      dataset: { role: 'observation-input' },
    });
    comboInput.value = '';

    const addButton = createEl('button', {
      className: 'btn btn-primary',
      text: 'Hinzufügen',
      attrs: { type: 'button' },
      dataset: { role: 'observation-add' },
    });

    const savePresetButton = createEl('button', {
      className: 'btn btn-outline-secondary d-none',
      text: 'Als Preset speichern',
      attrs: { type: 'button' },
      dataset: { role: 'observation-save-preset' },
    });
    savePresetButton.disabled = true;

    const noteInput = createEl('input', {
      className: 'form-control',
      attrs: { type: 'text', placeholder: 'Notiz' },
      dataset: { role: 'observation-note' },
    });
    noteInput.value = data.note || '';

    const tags = Array.isArray(data.tags) ? data.tags : [];
    const tagsList = buildPillList({
      items: tags,
      getLabel: (item) => item,
      getRemoveLabel: (label) => `${label} entfernen`,
      removeRole: 'observation-tag-remove',
    });

    const comboRow = createEl('div', {
      className: 'd-flex flex-column flex-lg-row gap-2',
      children: [comboInput, addButton, savePresetButton],
    });

    const card = createEl('div', {
      className: 'card border-0 shadow-sm',
      dataset: { child },
    });
    const cardBody = createEl('div', {
      className: 'card-body d-flex flex-column gap-2',
      children: [name, comboRow, tagsList, noteInput],
    });
    card.appendChild(cardBody);

    list.appendChild(card);
  });

  body.append(title, filterBar.element, datalist, list);
  section.appendChild(body);

  return {
    element: section,
    refs: { list, filterButtons: filterBar.buttons },
  };
};
