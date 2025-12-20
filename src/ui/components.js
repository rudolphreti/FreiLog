import { createEl } from './dom.js';

export const buildHeader = ({ selectedDate }) => {
  const header = createEl('header', { className: 'app-header' });

  const menuButton = createEl('button', {
    className: 'icon-button',
    text: '☰',
    attrs: { type: 'button', 'aria-label': 'Menü öffnen' },
  });
  const title = createEl('h1', { className: 'app-title', text: 'Beobachtungen' });
  const titleGroup = createEl('div', {
    className: 'header-title',
    children: [menuButton, title],
  });

  const dateLabel = createEl('span', {
    className: 'field-label',
    text: 'Datum',
  });
  const dateInput = createEl('input', {
    className: 'input',
    attrs: { type: 'date', value: selectedDate },
  });
  const dateGroup = createEl('label', {
    className: 'field-group header-date',
    children: [dateLabel, dateInput],
  });

  const headerContent = createEl('div', {
    className: 'header-content',
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

export const buildBackdrop = () =>
  createEl('div', { className: 'drawer-backdrop' });

export const buildMenuSection = ({ title, children }) => {
  const heading = createEl('h3', {
    className: 'drawer-section-title',
    text: title,
  });
  const section = createEl('section', {
    className: 'drawer-section',
    children: [heading, ...children],
  });

  return section;
};

export const buildDrawer = ({ exportMode }) => {
  const drawer = createEl('aside', { className: 'drawer' });

  const drawerHeader = createEl('div', { className: 'drawer-header' });
  const drawerTitle = createEl('h2', { text: 'Menü' });
  const closeButton = createEl('button', {
    className: 'icon-button drawer-close',
    text: '✕',
    attrs: { type: 'button', 'aria-label': 'Menü schließen' },
  });
  drawerHeader.append(drawerTitle, closeButton);

  const segmented = createEl('div', { className: 'segmented' });
  const exportDayButton = createEl('button', {
    className: `segment-button${exportMode === 'day' ? ' active' : ''}`,
    text: 'Export: Tag',
    attrs: { type: 'button' },
    dataset: { mode: 'day' },
  });
  const exportAllButton = createEl('button', {
    className: `segment-button${exportMode === 'all' ? ' active' : ''}`,
    text: 'Export: Alles',
    attrs: { type: 'button' },
    dataset: { mode: 'all' },
  });
  segmented.append(exportDayButton, exportAllButton);

  const exportButton = createEl('button', {
    className: 'button',
    text: 'Exportieren',
    attrs: { type: 'button' },
  });
  const importButton = createEl('button', {
    className: 'button secondary',
    text: 'Importieren',
    attrs: { type: 'button' },
  });
  const deleteButton = createEl('button', {
    className: 'button warning',
    text: 'Tag löschen',
    attrs: { type: 'button' },
  });
  const resetButton = createEl('button', {
    className: 'button warning',
    text: 'Reset (db.json)',
    attrs: { type: 'button' },
  });
  const actionsGroup = createEl('div', {
    className: 'drawer-actions',
    children: [
      segmented,
      exportButton,
      importButton,
      deleteButton,
      resetButton,
    ],
  });

  const actionsSection = buildMenuSection({
    title: 'Aktionen',
    children: [actionsGroup],
  });

  const attendanceSection = buildMenuSection({
    title: 'Anwesenheit',
    children: [
      createEl('p', {
        className: 'drawer-placeholder',
        text: 'Platzhalter für spätere Funktionen.',
      }),
    ],
  });
  const offersSection = buildMenuSection({
    title: 'Angebote',
    children: [
      createEl('p', {
        className: 'drawer-placeholder',
        text: 'Platzhalter für spätere Funktionen.',
      }),
    ],
  });

  const importInput = createEl('input', {
    attrs: { type: 'file', accept: 'application/json' },
    className: 'input',
  });
  importInput.style.display = 'none';

  drawer.append(
    drawerHeader,
    actionsSection,
    attendanceSection,
    offersSection,
    importInput,
  );

  return {
    element: drawer,
    refs: {
      exportModeButtons: [exportDayButton, exportAllButton],
      exportButton,
      importButton,
      deleteButton,
      resetButton,
      importInput,
      closeButton,
    },
  };
};

export const buildAbsentChildrenSection = ({
  children,
  absentChildren,
  searchValue,
}) => {
  const section = createEl('section', { className: 'section' });
  const title = createEl('h2', { text: 'Abwesende Kinder' });
  const searchInput = createEl('input', {
    className: 'input',
    attrs: { type: 'search', placeholder: 'Suchen...' },
    dataset: { role: 'absent-search' },
  });
  if (searchValue) {
    searchInput.value = searchValue;
  }

  const list = createEl('div', { className: 'checkbox-list' });
  children.forEach((child) => {
    const checkbox = createEl('input', {
      attrs: {
        type: 'checkbox',
        value: child,
        checked: absentChildren.includes(child) ? 'checked' : null,
      },
    });
    const label = createEl('span', { text: child });
    const item = createEl('label', {
      className: 'checkbox-item',
      dataset: { child },
      children: [checkbox, label],
    });
    list.appendChild(item);
  });

  section.append(title, searchInput, list);

  return { element: section, refs: { searchInput, list } };
};

export const buildAngebotSection = ({ angebote, selectedAngebot, newValue }) => {
  const section = createEl('section', { className: 'section' });
  const title = createEl('h2', { text: 'Angebot' });

  const datalistId = 'angebote-list';
  const comboInput = createEl('input', {
    className: 'input',
    attrs: {
      type: 'text',
      list: datalistId,
      placeholder: 'Angebot auswählen...',
    },
  });
  comboInput.value = selectedAngebot || '';

  const datalist = createEl('datalist', { attrs: { id: datalistId } });
  angebote.forEach((item) => {
    datalist.appendChild(createEl('option', { attrs: { value: item } }));
  });

  const addInput = createEl('input', {
    className: 'input',
    attrs: { type: 'text', placeholder: 'Neues Angebot...' },
    dataset: { role: 'angebot-new' },
  });
  if (newValue) {
    addInput.value = newValue;
  }
  const addButton = createEl('button', {
    className: 'button',
    text: 'Hinzufügen',
    attrs: { type: 'button' },
  });

  const comboRow = createEl('div', {
    className: 'combo-row',
    children: [comboInput, datalist],
  });
  const addRow = createEl('div', {
    className: 'add-row',
    children: [addInput, addButton],
  });

  section.append(title, comboRow, addRow);

  return {
    element: section,
    refs: {
      comboInput,
      addInput,
      addButton,
    },
  };
};

export const buildObservationsSection = ({
  children,
  observations,
  presets,
}) => {
  const section = createEl('section', { className: 'section' });
  const title = createEl('h2', { text: 'Beobachtungen' });

  const datalistId = 'observations-list';
  const datalist = createEl('datalist', { attrs: { id: datalistId } });
  presets.forEach((item) => {
    datalist.appendChild(createEl('option', { attrs: { value: item } }));
  });

  const list = createEl('div', { className: 'observation-list' });
  children.forEach((child) => {
    const data = observations[child] || {};
    const name = createEl('div', {
      className: 'observation-name',
      text: child,
    });
    const presetInput = createEl('input', {
      className: 'input',
      attrs: {
        type: 'text',
        list: datalistId,
        placeholder: 'Beobachtung (Preset)',
      },
      dataset: { role: 'observation-preset' },
    });
    presetInput.value = data.preset || '';

    const noteInput = createEl('input', {
      className: 'input',
      attrs: { type: 'text', placeholder: 'Notiz' },
      dataset: { role: 'observation-note' },
    });
    noteInput.value = data.note || '';

    const card = createEl('div', {
      className: 'observation-card',
      dataset: { child },
      children: [name, presetInput, noteInput],
    });

    list.appendChild(card);
  });

  section.append(title, datalist, list);

  return { element: section, refs: { list } };
};
