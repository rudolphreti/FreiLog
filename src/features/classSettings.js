import { deleteChildWithData } from '../db/dbRepository.js';
import { createEl, clearElement } from '../ui/dom.js';

const buildChildBadges = (children = []) => {
  const list = createEl('div', {
    className: 'd-flex flex-wrap gap-2',
    dataset: { role: 'class-children-list' },
  });

  if (!Array.isArray(children) || !children.length) {
    list.append(
      createEl('p', {
        className: 'text-muted small mb-0',
        text: 'Keine Kinder vorhanden.',
      }),
    );
    return list;
  }

  children.forEach((child) => {
    list.append(
      createEl('span', {
        className: 'badge rounded-pill text-bg-light border text-secondary',
        text: child,
      }),
    );
  });

  return list;
};

export const createClassSettingsOverlay = ({ children = [] } = {}) => {
  let currentChildren = Array.isArray(children) ? [...children] : [];
  let pendingDeleteChild = '';

  const overlay = createEl('div', {
    className: 'class-settings-overlay',
    attrs: { 'aria-hidden': 'true' },
  });
  const panel = createEl('div', {
    className: 'class-settings-overlay__panel',
    attrs: { role: 'dialog', 'aria-modal': 'true' },
  });
  const header = createEl('div', {
    className: 'class-settings-overlay__header',
  });
  const title = createEl('h3', { className: 'h5 mb-0', text: 'Meine Klasse' });
  const closeButton = createEl('button', {
    className: 'btn-close class-settings-overlay__close',
    attrs: { type: 'button', 'aria-label': 'Schließen' },
  });
  header.append(title, closeButton);

  const generalSection = createEl('section', {
    className: 'class-settings-section',
  });
  generalSection.append(
    createEl('h4', { className: 'h6 text-uppercase text-muted mb-2', text: 'Allgemein' }),
    createEl('p', {
      className: 'text-muted small mb-0',
      text: 'Passe deine allgemeinen Klasseneinstellungen an einem Ort an.',
    }),
  );

  const childrenSection = createEl('section', {
    className: 'class-settings-section',
  });
  childrenSection.append(
    createEl('h4', { className: 'h6 text-uppercase text-muted mb-2', text: 'Kinderliste' }),
  );
  const childrenHelper = createEl('p', {
    className: 'text-muted small',
    text: 'Überprüfe die aktuelle Liste deiner Kinder.',
  });
  const childrenList = buildChildBadges(currentChildren);
  childrenSection.append(childrenHelper, childrenList);

  const cautionSection = createEl('section', {
    className: 'class-settings-section class-settings-section--danger',
  });
  const cautionTitle = createEl('h4', {
    className: 'h6 text-uppercase mb-2 text-danger',
    text: 'Vorsicht',
  });
  const cautionDescription = createEl('p', {
    className: 'text-danger small mb-3',
    text: 'Gefährliche Operationen: Das Löschen entfernt das Kind und alle dazugehörigen Daten unwiderruflich.',
  });
  const deleteLabelId = 'class-delete-label';
  const deleteInputId = 'class-delete-input';
  const deleteHelperId = 'class-delete-helper';
  const deleteDatalistId = 'class-delete-datalist';
  const deleteLabel = createEl('label', {
    className: 'form-label mb-1 fw-semibold text-danger',
    attrs: { for: deleteInputId, id: deleteLabelId },
    text: 'Kinder aus der Liste löschen',
  });
  const deleteHelper = createEl('p', {
    className: 'text-danger small mb-2',
    attrs: { id: deleteHelperId },
    text: 'Gib den vollständigen Namen ein. Alle verknüpften Einträge werden ebenfalls gelöscht.',
  });
  const deleteInput = createEl('input', {
    className: 'form-control',
    attrs: {
      id: deleteInputId,
      type: 'text',
      list: deleteDatalistId,
      'aria-describedby': `${deleteLabelId} ${deleteHelperId}`,
      placeholder: 'Name des Kindes',
      autocomplete: 'off',
    },
  });
  const deleteOptions = createEl('datalist', { attrs: { id: deleteDatalistId } });
  const deleteButton = createEl('button', {
    className: 'btn btn-danger',
    attrs: { type: 'button' },
    text: 'Löschen…',
  });
  const feedback = createEl('div', {
    className: 'small mt-2',
    dataset: { role: 'class-delete-feedback' },
    hidden: true,
  });
  const deleteControls = createEl('div', {
    className: 'd-flex flex-column gap-2',
    children: [deleteLabel, deleteHelper, deleteInput, deleteOptions, deleteButton, feedback],
  });
  cautionSection.append(cautionTitle, cautionDescription, deleteControls);

  const confirmOverlay = createEl('div', {
    className: 'class-settings-confirm',
    attrs: { role: 'alertdialog', 'aria-modal': 'true' },
    hidden: true,
  });
  const confirmDialog = createEl('div', {
    className: 'class-settings-confirm__dialog',
  });
  const confirmTitle = createEl('h4', {
    className: 'h6 mb-2 text-danger',
    text: 'Alle Daten werden gelöscht',
  });
  const confirmMessage = createEl('p', {
    className: 'mb-3',
    text: '',
  });
  const confirmActions = createEl('div', {
    className: 'd-flex flex-wrap gap-2',
  });
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
  confirmActions.append(confirmButton, cancelButton);
  confirmDialog.append(confirmTitle, confirmMessage, confirmActions);
  confirmOverlay.append(confirmDialog);

  const content = createEl('div', {
    className: 'class-settings-overlay__content',
    children: [generalSection, childrenSection, cautionSection],
  });

  panel.append(header, content);
  overlay.append(panel, confirmOverlay);

  const close = () => {
    overlay.classList.remove('is-open');
    overlay.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('class-settings-overlay-open');
    confirmOverlay.hidden = true;
    pendingDeleteChild = '';
  };

  const open = () => {
    overlay.classList.add('is-open');
    overlay.setAttribute('aria-hidden', 'false');
    document.body.classList.add('class-settings-overlay-open');
    deleteInput.focus();
  };

  const setFeedback = (message, tone = 'danger') => {
    if (!message) {
      feedback.hidden = true;
      feedback.textContent = '';
      feedback.classList.remove('text-danger', 'text-success');
      return;
    }
    feedback.textContent = message;
    feedback.hidden = false;
    feedback.classList.toggle('text-danger', tone === 'danger');
    feedback.classList.toggle('text-success', tone === 'success');
  };

  const renderChildren = (list) => {
    const parent = childrenSection.querySelector('[data-role="class-children-list"]');
    const badges = buildChildBadges(list);
    if (parent) {
      parent.replaceWith(badges);
    } else {
      childrenSection.append(badges);
    }
    clearElement(deleteOptions);
    list.forEach((child) => {
      deleteOptions.append(createEl('option', { attrs: { value: child } }));
    });
  };

  const findMatchingChild = (value) => {
    const normalized = typeof value === 'string' ? value.trim().toLocaleLowerCase('de') : '';
    if (!normalized) {
      return '';
    }
    return currentChildren.find(
      (child) => child.toLocaleLowerCase('de') === normalized,
    );
  };

  const showConfirm = (child) => {
    pendingDeleteChild = child;
    confirmMessage.textContent = `Beim Löschen von “${child}” werden alle verknüpften Einträge und Daten unwiderruflich entfernt.`;
    confirmOverlay.hidden = false;
    confirmButton.focus();
  };

  const handleDeleteRequest = () => {
    setFeedback('');
    const match = findMatchingChild(deleteInput.value);
    if (!match) {
      setFeedback('Kind wurde nicht gefunden. Bitte den Namen exakt eingeben.');
      return;
    }
    showConfirm(match);
  };

  const handleConfirm = () => {
    if (!pendingDeleteChild) {
      return;
    }
    const result = deleteChildWithData(pendingDeleteChild);
    if (result?.status === 'removed') {
      setFeedback(`“${pendingDeleteChild}” und alle zugehörigen Daten wurden gelöscht.`, 'success');
      deleteInput.value = '';
    } else {
      setFeedback('Löschen nicht möglich. Bitte erneut versuchen.');
    }
    pendingDeleteChild = '';
    confirmOverlay.hidden = true;
  };

  const handleCancel = () => {
    pendingDeleteChild = '';
    confirmOverlay.hidden = true;
    deleteInput.focus();
  };

  const handleKeydown = (event) => {
    if (event.key === 'Escape') {
      if (!confirmOverlay.hidden) {
        handleCancel();
        return;
      }
      close();
    }
  };

  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) {
      close();
    }
  });
  closeButton.addEventListener('click', close);
  deleteButton.addEventListener('click', handleDeleteRequest);
  confirmButton.addEventListener('click', handleConfirm);
  cancelButton.addEventListener('click', handleCancel);
  confirmOverlay.addEventListener('click', (event) => {
    if (event.target === confirmOverlay) {
      handleCancel();
    }
  });
  overlay.addEventListener('keydown', handleKeydown);

  renderChildren(currentChildren);

  const update = ({ children: nextChildren = [] } = {}) => {
    currentChildren = Array.isArray(nextChildren) ? [...nextChildren] : [];
    renderChildren(currentChildren);
    if (pendingDeleteChild && !currentChildren.includes(pendingDeleteChild)) {
      pendingDeleteChild = '';
      confirmOverlay.hidden = true;
    }
  };

  return {
    element: overlay,
    open,
    close,
    update,
  };
};
