import { deleteChildWithData } from '../db/dbRepository.js';
import { clearElement, createEl } from '../ui/dom.js';

const buildSectionShell = ({ title, subtitle, className = '', children = [] }) =>
  createEl('section', {
    className: `class-settings__section${className ? ` ${className}` : ''}`,
    children: [
      createEl('div', {
        className: 'd-flex flex-column gap-1',
        children: [
          createEl('h4', { className: 'class-settings__section-title', text: title }),
          subtitle
            ? createEl('p', { className: 'class-settings__section-subtitle', text: subtitle })
            : null,
        ],
      }),
      ...children,
    ],
  });

export const createClassSettingsView = ({ children = [] } = {}) => {
  let currentChildren = Array.isArray(children) ? [...children] : [];
  let pendingChild = '';

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

  const generalSection = buildSectionShell({
    title: 'Allgemein',
    subtitle: 'Basisinformationen und Hinweise zu deiner Klasse.',
    children: [
      createEl('p', {
        className: 'mb-0 text-muted',
        text: 'Verwalte hier allgemeine Einstellungen. Weitere Optionen folgen.',
      }),
    ],
  });

  const childrenList = createEl('ul', {
    className: 'list-group list-group-flush class-settings__child-list',
  });
  const childrenAccordionId = 'classSettingsChildren';
  const childrenAccordion = createEl('div', {
    className: 'accordion class-settings__accordion',
    attrs: { id: `${childrenAccordionId}Accordion` },
  });
  const childrenItem = createEl('div', { className: 'accordion-item' });
  const childrenHeadingId = `${childrenAccordionId}Heading`;
  const childrenCollapseId = `${childrenAccordionId}Collapse`;
  const childrenHeader = createEl('h4', {
    className: 'accordion-header',
    attrs: { id: childrenHeadingId },
  });
  const childrenToggle = createEl('button', {
    className: 'accordion-button',
    attrs: {
      type: 'button',
      'data-bs-toggle': 'collapse',
      'data-bs-target': `#${childrenCollapseId}`,
      'aria-expanded': 'true',
      'aria-controls': childrenCollapseId,
    },
    text: 'Kinderliste',
  });
  childrenHeader.append(childrenToggle);
  const childrenCollapse = createEl('div', {
    className: 'accordion-collapse collapse show',
    attrs: {
      id: childrenCollapseId,
      'aria-labelledby': childrenHeadingId,
      'data-bs-parent': `#${childrenAccordionId}Accordion`,
    },
  });
  const childrenBody = createEl('div', {
    className: 'accordion-body',
    children: [
      createEl('p', {
        className: 'text-muted small',
        text: 'Alle Kinder, die aktuell in dieser Klasse geführt werden.',
      }),
      childrenList,
    ],
  });
  childrenCollapse.append(childrenBody);
  childrenItem.append(childrenHeader, childrenCollapse);
  childrenAccordion.append(childrenItem);

  const dangerDescription = createEl('p', {
    className: 'mb-2 text-danger fw-semibold',
    text: 'Kinder aus der Liste löschen – alle verknüpften Einträge werden entfernt.',
  });
  const deleteInputId = 'class-settings-delete-input';
  const deleteInput = createEl('input', {
    className: 'form-control',
    attrs: {
      id: deleteInputId,
      type: 'text',
      placeholder: 'Namen des Kindes eingeben',
    },
  });
  const deleteLabel = createEl('label', {
    className: 'form-label mb-1 fw-semibold',
    attrs: { for: deleteInputId },
    text: 'Name des Kindes',
  });
  const deleteHelp = createEl('div', {
    className: 'form-text mb-2',
    text: 'Bitte gib den exakten Namen aus der Kinderliste ein.',
  });
  const deleteButton = createEl('button', {
    className: 'btn btn-danger',
    attrs: { type: 'button' },
    text: 'Löschen…',
  });
  const feedback = createEl('div', {
    className: 'class-settings__feedback mt-2 text-danger small',
  });
  feedback.hidden = true;

  const confirmMessage = createEl('p', { className: 'mb-3 fw-semibold' });
  const confirmButton = createEl('button', {
    className: 'btn btn-danger',
    attrs: { type: 'button' },
    text: 'Ich bin mir des Risikos bewusst und möchte diese Daten löschen',
  });
  const cancelButton = createEl('button', {
    className: 'btn btn-outline-secondary',
    attrs: { type: 'button' },
    text: 'Abbrechen',
  });
  const confirmActions = createEl('div', {
    className: 'd-flex flex-wrap gap-2',
    children: [confirmButton, cancelButton],
  });
  const confirmDialog = createEl('div', {
    className: 'class-settings__confirm alert alert-danger',
    children: [
      createEl('p', {
        className: 'mb-2',
        text: 'Alle Daten zu diesem Kind werden unwiderruflich gelöscht.',
      }),
      confirmMessage,
      confirmActions,
    ],
  });
  confirmDialog.hidden = true;

  const dangerSection = buildSectionShell({
    title: 'Vorsicht!',
    subtitle:
      'Beim Löschen eines Kindes werden sämtliche Einträge, Abwesenheiten und Beobachtungen entfernt.',
    className: 'class-settings__danger',
    children: [
      dangerDescription,
      deleteLabel,
      deleteInput,
      deleteHelp,
      deleteButton,
      feedback,
      confirmDialog,
    ],
  });

  content.append(generalSection, childrenAccordion, dangerSection);
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
    hideConfirm();
    feedback.hidden = true;
    deleteInput.focus();
  };

  const hideConfirm = () => {
    confirmDialog.hidden = true;
    pendingChild = '';
  };

  const showFeedback = (message, isError = true) => {
    feedback.textContent = message;
    feedback.classList.toggle('text-danger', isError);
    feedback.classList.toggle('text-success', !isError);
    feedback.hidden = false;
  };

  const renderChildren = (items) => {
    clearElement(childrenList);
    if (!items.length) {
      childrenList.append(
        createEl('li', {
          className: 'list-group-item text-muted small',
          text: 'Keine Kinder in dieser Klasse vorhanden.',
        }),
      );
      return;
    }
    items.forEach((child) => {
      childrenList.append(
        createEl('li', {
          className: 'list-group-item d-flex align-items-center justify-content-between',
          children: [
            createEl('span', { text: child }),
            createEl('span', {
              className: 'badge text-bg-light',
              text: 'Kind',
            }),
          ],
        }),
      );
    });
  };

  const handleDeleteRequest = () => {
    const candidate = deleteInput.value.trim();
    hideConfirm();
    feedback.hidden = true;

    if (!candidate) {
      showFeedback('Bitte gib den Namen eines Kindes ein.');
      return;
    }

    const match = currentChildren.find((name) => name === candidate);
    if (!match) {
      showFeedback('Kein Kind mit diesem Namen gefunden.');
      return;
    }

    pendingChild = match;
    confirmMessage.textContent = `Alle Daten zu „${pendingChild}“ werden gelöscht.`;
    confirmDialog.hidden = false;
  };

  const handleDeleteConfirm = () => {
    if (!pendingChild) {
      showFeedback('Es ist kein Kind zum Löschen ausgewählt.');
      return;
    }
    const result = deleteChildWithData(pendingChild);
    if (result?.status === 'deleted') {
      showFeedback(`„${pendingChild}“ wurde gelöscht.`, false);
    } else {
      showFeedback('Das Kind konnte nicht gelöscht werden.');
    }
    deleteInput.value = '';
    pendingChild = '';
    confirmDialog.hidden = true;
  };

  deleteButton.addEventListener('click', handleDeleteRequest);
  confirmButton.addEventListener('click', handleDeleteConfirm);
  cancelButton.addEventListener('click', () => {
    hideConfirm();
    feedback.hidden = true;
  });
  closeButton.addEventListener('click', close);
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) {
      close();
    }
  });

  renderChildren(currentChildren);

  const update = ({ children: nextChildren = [] } = {}) => {
    currentChildren = Array.isArray(nextChildren) ? [...nextChildren] : [];
    renderChildren(currentChildren);
    if (!currentChildren.includes(pendingChild)) {
      hideConfirm();
    }
  };

  return {
    element: overlay,
    open,
    close,
    update,
  };
};
