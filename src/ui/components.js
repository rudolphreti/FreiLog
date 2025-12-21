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
  drawerSections,
  attendanceSection,
  angebotSection,
}) => {
  const exportButton = createEl('button', {
    className: 'btn btn-primary w-100',
    text: 'Exportieren',
    attrs: { type: 'button' },
  });
  const importButton = createEl('button', {
    className: 'btn btn-outline-primary w-100',
    text: 'Importieren (Alles)',
    attrs: { type: 'button' },
  });
  const actionsGroup = createEl('div', {
    className: 'd-grid gap-2',
    children: [exportButton, importButton],
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
      exportButton,
      importButton,
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

const buildTopList = (items) => {
  const list = createEl('div', { className: 'd-flex flex-wrap gap-2' });
  items.forEach(({ label, count }) => {
    const button = createEl('button', {
      className:
        'btn btn-outline-secondary btn-sm d-inline-flex align-items-center gap-2',
      attrs: { type: 'button' },
      dataset: { role: 'observation-top-add', value: label },
      children: [
        createEl('span', { text: label }),
        createEl('span', {
          className: 'badge text-bg-light border',
          text: String(count),
        }),
      ],
    });
    list.appendChild(button);
  });

  return list;
};

const buildTopItems = (stats) => {
  if (!stats || typeof stats !== 'object') {
    return [];
  }

  return Object.entries(stats)
    .map(([label, count]) => ({
      label,
      count: Number.isFinite(count) ? count : Number(count) || 0,
    }))
    .filter((item) => item.label && item.count > 0)
    .sort((a, b) => {
      if (b.count !== a.count) {
        return b.count - a.count;
      }
      return a.label.localeCompare(b.label, 'de');
    })
    .slice(0, 10);
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

const buildTemplateGroups = (templates) => {
  const normalized = Array.isArray(templates) ? templates : [];
  const sorted = [...normalized]
    .filter((item) => typeof item === 'string' && item.trim())
    .map((item) => item.trim())
    .sort((a, b) => a.localeCompare(b, 'de', { sensitivity: 'base' }));

  const groups = new Map();
  sorted.forEach((label) => {
    const initial = label[0].toLocaleUpperCase();
    if (!groups.has(initial)) {
      groups.set(initial, []);
    }
    groups.get(initial).push(label);
  });

  return {
    groups,
    initials: Array.from(groups.keys())
      .filter((letter) => /^[A-Z]$/i.test(letter))
      .sort((a, b) => a.localeCompare(b, 'de')),
  };
};

const buildObservationTemplatesSection = ({ templates }) => {
  const details = createEl('details', {
    className: 'observation-templates',
    dataset: { role: 'observation-templates' },
  });
  const summary = createEl('summary', {
    className: 'fw-semibold',
    text: 'Gespeicherte Beobachtungen',
  });

  const { groups, initials } = buildTemplateGroups(templates);
  const hasTemplates = groups.size > 0;
  const filterBar = createEl('div', {
    className: 'd-flex flex-wrap gap-2 observation-templates__filters',
  });

  const addFilterButton = (label, value, isActive = false) => {
    const button = createEl('button', {
      className: `btn btn-outline-secondary btn-sm${isActive ? ' active' : ''}`,
      text: label,
      attrs: {
        type: 'button',
        'aria-pressed': isActive ? 'true' : 'false',
      },
      dataset: { role: 'observation-template-letter', value },
    });
    filterBar.appendChild(button);
  };

  addFilterButton('Alle', 'ALL', true);
  initials.forEach((letter) => addFilterButton(letter, letter));

  const searchInput = createEl('input', {
    className: 'form-control form-control-sm observation-templates__search',
    attrs: {
      type: 'search',
      placeholder: 'Suchen…',
      'aria-label': 'Gespeicherte Beobachtungen durchsuchen',
    },
    dataset: { role: 'observation-template-search' },
  });

  const controls = createEl('div', {
    className: 'd-flex flex-column flex-md-row gap-2 align-items-start',
    children: [filterBar, searchInput],
  });

  const list = createEl('div', {
    className: 'd-flex flex-column gap-3 observation-templates__list',
    dataset: { role: 'observation-template-list' },
  });

  groups.forEach((items, initial) => {
    const group = createEl('div', {
      className: 'observation-templates__group',
      dataset: { initial },
    });
    const heading = createEl('p', {
      className: 'text-muted small mb-1 fw-semibold',
      text: initial,
    });
    const buttons = createEl('div', {
      className: 'd-flex flex-column gap-2',
      dataset: { role: 'observation-template-group' },
    });
    items.forEach((label) => {
      const button = createEl('button', {
        className:
          'btn btn-outline-secondary text-start observation-template-button',
        text: label,
        attrs: { type: 'button' },
        dataset: {
          role: 'observation-template-add',
          value: label,
          initial,
        },
      });
      buttons.appendChild(button);
    });
    group.append(heading, buttons);
    list.appendChild(group);
  });

  const empty = createEl('p', {
    className: 'text-muted small mb-0 observation-templates__empty',
    text: 'Keine gespeicherten Beobachtungen vorhanden.',
  });
  empty.hidden = hasTemplates;
  empty.dataset.role = 'observation-template-empty';

  const content = createEl('div', {
    className: 'mt-3 d-flex flex-column gap-3',
    children: hasTemplates ? [controls, list, empty] : [empty],
  });

  details.append(summary, content);

  return {
    element: details,
    refs: {
      list,
      filterBar,
      searchInput,
      empty,
    },
  };
};

export const buildObservationsSection = ({
  children,
  observations,
  presets,
  observationStats,
}) => {
  const section = createEl('section', {
    className: 'card shadow-sm border-0',
  });
  const body = createEl('div', { className: 'card-body d-flex flex-column gap-3' });
  const title = createEl('h2', {
    className: 'h5 mb-0 section-title',
    text: 'Beobachtungen',
  });

  const list = createEl('div', { className: 'd-flex flex-column gap-2' });
  children.forEach((child) => {
    const button = createEl('button', {
      className:
        'btn btn-outline-primary d-flex align-items-center justify-content-between observation-child-button',
      attrs: { type: 'button' },
      dataset: { role: 'observation-child', child },
      children: [
        createEl('span', { className: 'fw-semibold', text: child }),
        createEl('span', { className: 'text-muted small', text: 'Details' }),
      ],
    });
    list.appendChild(button);
  });

  const datalistId = 'observations-list';
  const datalist = createEl('datalist', { attrs: { id: datalistId } });
  presets.forEach((item) => {
    datalist.appendChild(createEl('option', { attrs: { value: item } }));
  });

  const overlay = createEl('div', {
    className: 'observation-overlay',
    dataset: { role: 'observation-overlay' },
    attrs: { 'aria-hidden': 'true' },
  });
  const overlayPanel = createEl('div', {
    className: 'observation-overlay__panel',
    attrs: { role: 'dialog', 'aria-modal': 'true' },
  });
  const overlayHeader = createEl('div', {
    className: 'observation-overlay__header',
  });
  const closeButton = createEl('button', {
    className: 'btn btn-link p-0 observation-overlay__close',
    attrs: { type: 'button' },
    dataset: { role: 'observation-close' },
    children: [
      createEl('span', { className: 'me-2', text: '←' }),
      createEl('span', { text: 'Zurück' }),
    ],
  });
  const overlayTitle = createEl('h3', {
    className: 'h5 mb-0',
    text: 'Kind',
    dataset: { role: 'observation-child-title' },
  });
  overlayHeader.append(closeButton, overlayTitle);

  const overlayContent = createEl('div', {
    className: 'observation-overlay__content',
    dataset: { role: 'observation-detail-scroll' },
  });
  children.forEach((child) => {
    const data = observations[child] || {};
    const topItems = buildTopItems(observationStats?.[child]);
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

    const todayTitle = createEl('p', {
      className: 'text-muted small mb-0',
      text: 'Heute',
    });

    const todayList = buildPillList({
      items: Array.isArray(data) ? data : [],
      getLabel: (item) => item,
      getRemoveLabel: (label) => `${label} entfernen`,
      removeRole: 'observation-today-remove',
    });

    const topTitle = createEl('p', {
      className: 'text-muted small mb-0',
      text: 'Top 10',
    });

    const topList = topItems.length
      ? buildTopList(topItems)
      : createEl('p', {
          className: 'text-muted small mb-0',
          text: 'Noch keine Daten',
        });

    const templatesSection = buildObservationTemplatesSection({
      templates: presets,
    });

    const comboRow = createEl('div', {
      className: 'd-flex flex-column gap-2',
      children: [comboInput, addButton, savePresetButton],
    });

    const detail = createEl('div', {
      className: 'observation-detail d-flex flex-column gap-3',
      dataset: { child, templateFilter: 'ALL', templateQuery: '' },
      children: [
        comboRow,
        todayTitle,
        todayList,
        topTitle,
        topList,
        templatesSection.element,
      ],
    });
    detail.hidden = true;
    overlayContent.appendChild(detail);
  });

  overlayPanel.append(overlayHeader, datalist, overlayContent);
  overlay.appendChild(overlayPanel);

  body.append(title, list, overlay);
  section.appendChild(body);

  return {
    element: section,
    refs: {
      list,
      overlay,
      overlayContent,
      overlayTitle,
      closeButton,
    },
  };
};
