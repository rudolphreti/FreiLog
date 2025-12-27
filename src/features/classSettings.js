import { createEl, clearElement } from '../ui/dom.js';

const buildAccordionItem = ({ id, title, defaultOpen, contentNode, accordionId }) => {
  const item = createEl('div', { className: 'accordion-item' });
  const headerId = `${id}-heading`;
  const collapseId = `${id}-collapse`;

  const header = createEl('h2', {
    className: 'accordion-header',
    attrs: { id: headerId },
  });
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

  return { element: item, refs: { toggleButton: button, collapse } };
};

const buildGeneralContent = (childCount) => {
  const childCountValue = createEl('span', {
    className: 'fw-semibold',
    text: String(childCount),
  });

  const childCountRow = createEl('p', {
    className: 'mb-2',
    children: [createEl('span', { text: 'Kinder insgesamt: ' }), childCountValue],
  });

  const note = createEl('p', {
    className: 'text-muted small mb-0',
    text: 'Hier siehst du einen Überblick deiner Klasse.',
  });

  const container = createEl('div', {
    className: 'd-flex flex-column gap-2',
    children: [childCountRow, note],
  });

  return {
    element: container,
    updateCount: (value) => {
      childCountValue.textContent = String(value);
    },
  };
};

const buildChildrenContent = (children) => {
  const list = createEl('ol', { className: 'class-settings__child-list mb-0' });
  const empty = createEl('p', {
    className: 'text-muted mb-0',
    text: 'Keine Kinder eingetragen.',
  });
  const wrapper = createEl('div', {
    className: 'd-flex flex-column gap-3',
  });

  const renderList = (items) => {
    clearElement(list);
    if (!items.length) {
      wrapper.replaceChildren(empty);
      return;
    }

    items.forEach((child) => {
      list.appendChild(createEl('li', { text: child }));
    });
    wrapper.replaceChildren(list);
  };

  renderList(children);

  return {
    element: wrapper,
    update: renderList,
  };
};

const buildCautionContent = () =>
  createEl('div', {
    className: 'alert alert-warning mb-0',
    children: [
      createEl('p', {
        className: 'fw-semibold mb-1',
        text: 'Bitte vorsichtig ändern!',
      }),
      createEl('p', {
        className: 'mb-0',
        text: 'Anpassungen an der Kinderliste beeinflussen gespeicherte Daten. Prüfe Änderungen genau, bevor du sie übernimmst.',
      }),
    ],
  });

export const createClassSettingsOverlay = ({ children = [] } = {}) => {
  let currentChildren = Array.isArray(children) ? [...children] : [];

  const overlay = createEl('div', {
    className: 'class-settings-overlay',
    dataset: { role: 'class-settings-overlay' },
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

  const accordionId = 'classSettingsAccordion';
  const accordion = createEl('div', {
    className: 'accordion class-settings__accordion',
    attrs: { id: accordionId },
  });

  const generalContent = buildGeneralContent(currentChildren.length);
  const childrenContent = buildChildrenContent(currentChildren);
  const cautionContent = buildCautionContent();

  const generalSection = buildAccordionItem({
    id: 'class-settings-general',
    title: 'Allgemein',
    defaultOpen: true,
    contentNode: generalContent.element,
    accordionId,
  });

  const childrenSection = buildAccordionItem({
    id: 'class-settings-children',
    title: 'Kinderliste',
    defaultOpen: false,
    contentNode: childrenContent.element,
    accordionId,
  });

  const cautionSection = buildAccordionItem({
    id: 'class-settings-caution',
    title: 'Vorsicht!',
    defaultOpen: false,
    contentNode: cautionContent,
    accordionId,
  });

  accordion.append(
    generalSection.element,
    childrenSection.element,
    cautionSection.element,
  );

  const content = createEl('div', {
    className: 'class-settings-overlay__content',
    children: [accordion],
  });

  panel.append(header, content);
  overlay.append(panel);

  const close = () => {
    overlay.classList.remove('is-open');
    overlay.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('class-settings-overlay-open');
  };

  const open = () => {
    overlay.classList.add('is-open');
    overlay.setAttribute('aria-hidden', 'false');
    document.body.classList.add('class-settings-overlay-open');
  };

  closeButton.addEventListener('click', close);
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) {
      close();
    }
  });

  const updateChildren = (nextChildren) => {
    currentChildren = Array.isArray(nextChildren) ? [...nextChildren] : [];
    generalContent.updateCount(currentChildren.length);
    childrenContent.update(currentChildren);
  };

  return {
    element: overlay,
    open,
    close,
    updateChildren,
  };
};
