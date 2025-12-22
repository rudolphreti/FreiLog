import { createEl } from './dom.js';
import { todayYmd } from '../utils/date.js';
import {
  getEntryText,
  getTopicById,
  getTopicList,
  groupEntriesByPrimaryTopic,
} from '../utils/topics.js';

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
  const dateInput = createEl('input', {
    className: 'form-control',
    attrs: { type: 'date', value: selectedDate || todayYmd(), 'aria-label': 'Datum' },
  });
  const dateGroup = createEl('div', {
    className: 'd-flex flex-column',
    children: [dateInput],
  });
  const titleGroup = createEl('div', {
    className: 'd-flex align-items-start gap-2',
    children: [menuButton, dateGroup],
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

  accordion.append(actionsSection.element, offersSectionItem.element);

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
        angebote: offersSectionItem,
      },
    },
  };
};

const buildPill = ({ label, topics, removeLabel, removeRole, value }) => {
  const labelSpan = createEl('span', { text: label });
  const dots = buildTopicDots(topics);
  const removeButton = createEl('button', {
    className: 'btn btn-link btn-sm text-white p-0 ms-2',
    text: '✕',
    attrs: { type: 'button', 'aria-label': removeLabel },
    dataset: { role: removeRole, value },
  });
  return createEl('span', {
    className: 'badge rounded-pill text-bg-primary d-inline-flex align-items-center badge-pill',
    children: dots ? [dots, labelSpan, removeButton] : [labelSpan, removeButton],
    dataset: { value },
  });
};

const buildTopicDot = (topicId) => {
  const topic = getTopicById(topicId);
  if (!topic) {
    return null;
  }

  return createEl('span', {
    className: `topic-dot ${topic.colorClass}`,
    attrs: { title: topic.label, 'aria-label': topic.label },
  });
};

const buildTopicDots = (topics) => {
  const list = Array.isArray(topics) ? topics : [];
  if (!list.length) {
    return null;
  }

  const wrapper = createEl('span', {
    className: 'topic-dots d-inline-flex align-items-center',
  });
  list.forEach((topicId) => {
    const dot = buildTopicDot(topicId);
    if (dot) {
      wrapper.appendChild(dot);
    }
  });
  return wrapper;
};

const buildTopicSectionHeader = (topic) =>
  createEl('div', {
    className: 'topic-section__header d-flex align-items-center gap-2',
    children: [
      buildTopicDot(topic.id),
      createEl('span', { text: topic.label }),
    ],
  });

const buildTopicGroupedList = ({
  items,
  buildItem,
  emptyText,
}) => {
  const normalized = Array.isArray(items) ? items : [];
  const wrapper = createEl('div', { className: 'd-flex flex-column gap-3' });

  if (!normalized.length) {
    if (emptyText) {
      wrapper.appendChild(
        createEl('p', { className: 'text-muted small mb-0', text: emptyText }),
      );
    }
    return wrapper;
  }

  const grouped = groupEntriesByPrimaryTopic(normalized);
  grouped.forEach(({ topic, items: topicItems }) => {
    if (!topicItems.length) {
      return;
    }
    const section = createEl('div', {
      className: `topic-section topic-section--${topic.id}`,
      dataset: { topic: topic.id },
    });
    const heading = buildTopicSectionHeader(topic);
    const list = createEl('div', { className: 'd-flex flex-wrap gap-2' });
    topicItems.forEach((item) => list.appendChild(buildItem(item)));
    section.append(heading, list);
    wrapper.appendChild(section);
  });

  return wrapper;
};

export const buildAngebotSection = ({
  angebote,
  selectedAngebote,
  newValue,
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
    const label = getEntryText(item);
    if (!label) {
      return;
    }
    datalist.appendChild(createEl('option', { attrs: { value: label } }));
  });

  const addButton = createEl('button', {
    className: 'btn btn-outline-secondary btn-sm px-2',
    text: '+',
    attrs: { type: 'button', 'aria-label': 'Hinzufügen' },
  });

  const selectedTitle = createEl('h4', {
    className: 'h6 text-muted mt-3 mb-2',
    text: 'Heute ausgewählt',
  });
  const selectedList = createEl('div', {
    className: 'd-flex flex-column gap-2',
    dataset: { role: 'angebot-list' },
  });
  const selectedGrouped = buildTopicGroupedList({
    items: activeAngebote,
    buildItem: (angebot) => {
      const label = getEntryText(angebot);
      const pill = buildPill({
        label,
        removeLabel: `${label} entfernen`,
        removeRole: 'angebot-remove',
        value: label,
        topics: angebot?.topics || [],
      });
      pill.dataset.angebot = label;
      return pill;
    },
    emptyText: 'Noch keine Angebote ausgewählt.',
  });
  selectedList.appendChild(selectedGrouped);

  const comboRow = createEl('div', {
    className: 'd-flex align-items-center gap-2',
    children: [comboInput, addButton, datalist],
  });

  const content = createEl('div', {
    className: 'd-flex flex-column gap-3',
    children: [comboRow, selectedTitle, selectedList],
  });

  return {
    element: content,
    refs: {
      comboInput,
      addButton,
      selectedList,
    },
  };
};

const buildPillList = ({ items, removeRole }) => {
  return buildTopicGroupedList({
    items,
    emptyText: 'Noch keine Beobachtungen erfasst.',
    buildItem: (item) => {
      const label = getEntryText(item);
      const pill = createEl('span', {
        className:
          'badge rounded-pill text-bg-secondary d-inline-flex align-items-center tag-badge observation-pill',
        dataset: { value: label },
        children: [
          buildTopicDots(item?.topics || []),
          createEl('span', { text: label }),
          createEl('button', {
            className: 'btn btn-link btn-sm text-white p-0 ms-2',
            text: '✕',
            attrs: { type: 'button', 'aria-label': `${label} entfernen` },
            dataset: { role: removeRole, value: label },
          }),
        ].filter(Boolean),
      });
      return pill;
    },
  });
};

const buildTopList = (items) => {
  const list = createEl('div', { className: 'd-flex flex-wrap gap-2' });
  items.forEach(({ label, count }) => {
    const button = createEl('button', {
      className:
        'btn btn-outline-secondary btn-sm observation-chip d-inline-flex align-items-center gap-2',
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
  return groupEntriesByPrimaryTopic(templates);
};

const buildObservationTemplatesOverlay = ({ templates }) => {
  const groups = buildTemplateGroups(templates);
  const hasTemplates = groups.some((group) => group.items.length > 0);
  const overlay = createEl('div', {
    className: 'observation-templates-overlay',
    dataset: {
      role: 'observation-templates-overlay',
      templateFilter: 'ALL',
      templateQuery: '',
    },
    attrs: { 'aria-hidden': 'true' },
  });
  const overlayPanel = createEl('div', {
    className: 'observation-templates-overlay__panel',
    attrs: { role: 'dialog', 'aria-modal': 'true' },
  });
  const header = createEl('div', {
    className: 'observation-templates-overlay__header',
  });
  const closeButton = createEl('button', {
    className: 'btn btn-link p-0 observation-templates-overlay__close',
    attrs: { type: 'button' },
    dataset: { role: 'observation-template-close' },
    children: [
      createEl('span', { className: 'me-2', text: '×' }),
      createEl('span', { text: 'Zurück' }),
    ],
  });
  const title = createEl('h3', {
    className: 'h5 mb-0',
    text: 'Gespeicherte Beobachtungen',
  });
  header.append(closeButton, title);

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
      dataset: { role: 'observation-template-topic', value },
    });
    filterBar.appendChild(button);
  };

  addFilterButton('Alle', 'ALL', true);
  getTopicList().forEach((topic) => addFilterButton(topic.label, topic.id));

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

  groups.forEach(({ topic, items }) => {
    if (!items.length) {
      return;
    }
    const group = createEl('div', {
      className: `observation-templates__group topic-section topic-section--${topic.id}`,
      dataset: { role: 'observation-template-group', topic: topic.id },
    });
    const heading = buildTopicSectionHeader(topic);
    const buttons = createEl('div', {
      className: 'd-flex flex-wrap gap-2 observation-templates__group-buttons',
    });
    items.forEach((item) => {
      const label = getEntryText(item);
      const button = createEl('button', {
        className:
          'btn btn-outline-secondary observation-chip observation-template-button d-inline-flex align-items-center gap-2',
        attrs: { type: 'button' },
        dataset: {
          role: 'observation-template-add',
          value: label,
          topics: (item.topics || []).join(','),
          primaryTopic: item.primaryTopic || '',
        },
        children: [buildTopicDots(item.topics), createEl('span', { text: label })].filter(
          Boolean,
        ),
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

  const scrollContent = createEl('div', {
    className: 'observation-templates-overlay__content',
    children: [content],
  });

  overlayPanel.append(header, scrollContent);
  overlay.appendChild(overlayPanel);

  return {
    element: overlay,
    refs: {
      list,
      filterBar,
      searchInput,
      empty,
      closeButton,
    },
  };
};

export const buildObservationsSection = ({
  children,
  observations,
  presets,
  observationStats,
  absentChildren,
}) => {
  const section = createEl('section', {
    className: 'card shadow-sm border-0',
  });
  const body = createEl('div', { className: 'card-body d-flex flex-column gap-3' });
  const absentSet = new Set(absentChildren || []);

  const list = createEl('div', {
    className: 'd-flex flex-wrap gap-2 observation-child-list',
  });
  children.forEach((child) => {
    const isAbsent = absentSet.has(child);
    const badge = isAbsent
      ? createEl('span', {
          className: 'badge text-bg-light text-secondary observation-absent-badge',
          text: 'Abwesend',
        })
      : null;
    const button = createEl('button', {
      className:
        `btn observation-child-button${isAbsent ? ' is-absent' : ' btn-outline-primary'}`,
      attrs: { type: 'button' },
      dataset: { role: 'observation-child', child, absent: isAbsent ? 'true' : 'false' },
      children: badge
        ? [
            createEl('span', { className: 'fw-semibold observation-child-label', text: child }),
            badge,
          ]
        : [createEl('span', { className: 'fw-semibold observation-child-label', text: child })],
    });
    list.appendChild(button);
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
  const templatesOverlay = buildObservationTemplatesOverlay({
    templates: presets,
  });
  children.forEach((child) => {
    const data = observations[child] || {};
    const topItems = buildTopItems(observationStats?.[child]);
    const isAbsent = absentSet.has(child);
    const safeId = child.toLocaleLowerCase().replace(/[^a-z0-9]+/gi, '-');
    const comboInputId = `observation-input-${safeId}`;
    const comboInputLabel = createEl('label', {
      className: 'form-label text-muted small mb-0',
      text: 'Neue Beobachtung',
      attrs: { for: comboInputId },
    });
    const comboInput = createEl('input', {
      className: 'form-control flex-grow-1',
      attrs: {
        type: 'text',
        id: comboInputId,
        autocomplete: 'off',
        placeholder: 'Neue Beobachtung',
      },
      dataset: { role: 'observation-input' },
    });
    comboInput.value = '';

    const topicLegend = createEl('p', {
      className: 'text-muted small mb-0',
      text: 'Themen',
    });
    const topicPicker = createEl('div', {
      className: 'd-flex flex-wrap gap-2',
    });
    getTopicList().forEach((topic) => {
      const inputId = `observation-topic-${safeId}-${topic.id}`;
      const checkbox = createEl('input', {
        className: 'form-check-input',
        attrs: {
          type: 'checkbox',
          id: inputId,
          value: topic.id,
        },
        dataset: { role: 'observation-topic' },
      });
      checkbox.checked = topic.id === 'social';
      const label = createEl('label', {
        className: 'form-check-label d-flex align-items-center gap-2',
        attrs: { for: inputId },
        children: [buildTopicDot(topic.id), createEl('span', { text: topic.label })].filter(
          Boolean,
        ),
      });
      const wrapper = createEl('div', {
        className: 'form-check form-check-inline topic-checkbox',
        children: [checkbox, label],
      });
      topicPicker.appendChild(wrapper);
    });

    const primaryLabel = createEl('label', {
      className: 'form-label text-muted small mb-0',
      text: 'Hauptthema',
    });
    const primarySelect = createEl('select', {
      className: 'form-select form-select-sm',
      dataset: { role: 'observation-primary-topic' },
    });
    getTopicList().forEach((topic) => {
      const option = createEl('option', {
        attrs: { value: topic.id },
        text: topic.label,
      });
      if (topic.id === 'social') {
        option.selected = true;
      }
      primarySelect.appendChild(option);
    });

    const addButton = createEl('button', {
      className: 'btn btn-outline-secondary btn-sm',
      text: '+',
      attrs: { type: 'submit', 'aria-label': 'Hinzufügen' },
      dataset: { role: 'observation-add' },
    });

    const todayTitle = createEl('p', {
      className: 'text-muted small mb-0',
      text: 'Heutige Beobachtungen',
    });

    const todayList = buildPillList({
      items: Array.isArray(data) ? data : [],
      removeRole: 'observation-today-remove',
    });

    const topList = topItems.length
      ? buildTopList(topItems)
      : createEl('p', {
          className: 'text-muted small mb-0',
          text: 'Noch keine Daten',
        });

    const templatesButton = createEl('button', {
      className:
        'btn btn-primary btn-sm observation-template-open align-self-start',
      text: 'Gespeicherte Beobachtungen',
      attrs: { type: 'button' },
      dataset: { role: 'observation-template-open' },
    });

    const feedback = createEl('p', {
      className: 'text-muted small mb-0',
      text: '',
      dataset: { role: 'observation-feedback' },
    });
    feedback.hidden = true;

    const comboInputRow = createEl('div', {
      className: 'd-flex gap-2 align-items-start',
      children: [comboInput, addButton],
    });

    const comboRow = createEl('form', {
      className: 'd-flex flex-column gap-2',
      dataset: { role: 'observation-form' },
      children: [
        comboInputLabel,
        topicLegend,
        topicPicker,
        primaryLabel,
        primarySelect,
        comboInputRow,
        feedback,
      ],
    });

    const detail = createEl('div', {
      className: 'observation-detail d-flex flex-column gap-3 d-none',
      dataset: {
        child,
        templateFilter: 'ALL',
        templateQuery: '',
        absent: isAbsent ? 'true' : 'false',
      },
      children: [
        topList,
        todayTitle,
        todayList,
        templatesButton,
        comboRow,
      ],
    });
    if (isAbsent) {
      const absentNotice = createEl('p', {
        className: 'text-muted small mb-0',
        text: 'Abwesend – Beobachtungen deaktiviert.',
      });
      topList.hidden = true;
      todayTitle.hidden = true;
      todayList.hidden = true;
      templatesButton.hidden = true;
      comboRow.hidden = true;
      detail.append(absentNotice);
    }
    detail.hidden = true;
    overlayContent.appendChild(detail);
  });

  overlayPanel.append(
    overlayHeader,
    overlayContent,
    templatesOverlay.element,
  );
  overlay.appendChild(overlayPanel);

  body.append(list, overlay);
  section.appendChild(body);

  return {
    element: section,
    refs: {
      list,
      overlay,
      overlayPanel,
      overlayContent,
      overlayTitle,
      closeButton,
      templatesOverlay: templatesOverlay.element,
    },
  };
};
