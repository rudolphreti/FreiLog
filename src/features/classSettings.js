import { clearElement, createEl } from '../ui/dom.js';
import { removeChildWithData } from '../db/dbRepository.js';

const buildChildrenList = (children) => {
  const wrapper = createEl('div', { className: 'class-settings__card' });
  const header = createEl('div', {
    className: 'd-flex align-items-center justify-content-between gap-2 mb-2',
  });
  const countBadge = createEl('span', { className: 'badge text-bg-secondary' });

  header.append(
    createEl('h4', { className: 'h6 mb-0', text: 'Kinderliste' }),
    countBadge,
  );

  const list = createEl('div', {
    className: 'class-settings__children',
  });
  if (!children.length) {
    list.append(
      createEl('p', {
        className: 'text-muted small mb-0',
        text: 'Keine Kinder hinterlegt.',
      }),
    );
  } else {
    children.forEach((child) => {
      list.append(
        createEl('span', {
          className:
            'badge rounded-pill text-bg-light border class-settings__child-pill',
          text: child,
        }),
      );
    });
  }

  wrapper.append(header, list);
  return { wrapper, list, countBadge };
};

export const createClassSettingsOverlay = ({ children = [] } = {}) => {
  let currentChildren = Array.isArray(children) ? [...children] : [];
  let pendingDeletion = '';

  const overlay = createEl('div', {
    className: 'class-settings-overlay',
    attrs: { 'aria-hidden': 'true' },
  });
  const panel = createEl('div', {
    className: 'class-settings-overlay__panel',
    attrs: { role: 'dialog', 'aria-modal': 'true' },
  });
  const header = createEl('div', { className: 'class-settings-overlay__header' });
  const title = createEl('h3', { className: 'h5 mb-0', text: 'Meine Klasse' });
  const closeButton = createEl('button', {
    className: 'btn-close class-settings-overlay__close',
    attrs: { type: 'button', 'aria-label': 'Schließen' },
  });
  header.append(title, closeButton);

  const {
    wrapper: childrenSection,
    list: childrenList,
    countBadge: childrenCountBadge,
  } = buildChildrenList(currentChildren);

  const dangerHeader = createEl('div', {
    className: 'd-flex align-items-center justify-content-between gap-2 mb-2',
  });
  dangerHeader.append(
    createEl('h4', { className: 'h6 mb-0 text-danger', text: 'Vorsicht' }),
    createEl('span', { className: 'badge text-bg-danger', text: 'Riskant' }),
  );
  const dangerIntro = createEl('p', {
    className: 'small mb-3 text-danger',
    text: 'Diese Aktionen können Daten unwiderruflich löschen.',
  });

  const deleteLabel = createEl('label', {
    className: 'form-label small fw-semibold text-danger mb-1',
    text: 'Kind aus der Liste entfernen',
    attrs: { for: 'class-settings-delete-input' },
  });
  const deleteHelp = createEl('p', {
    className: 'text-muted small mb-2',
    text: 'Gib den exakten Namen ein, um das Kind samt verknüpfter Einträge zu löschen.',
  });
  const deleteInput = createEl('input', {
    className: 'form-control form-control-sm',
    attrs: {
      id: 'class-settings-delete-input',
      type: 'text',
      placeholder: 'Name des Kindes',
      autocomplete: 'off',
    },
  });
  const deleteButton = createEl('button', {
    className: 'btn btn-danger btn-sm mt-2',
    text: 'Usuń…',
    attrs: { type: 'button' },
  });
  const deleteFeedback = createEl('p', {
    className: 'small mb-0 mt-2 text-muted',
    dataset: { role: 'class-settings-feedback' },
  });
  deleteFeedback.hidden = true;

  const confirmName = createEl('strong', { text: '' });
  const confirmText = createEl('p', {
    className: 'mb-3',
    children: [
      createEl('span', {
        text: 'Alle Daten zu ',
      }),
      confirmName,
      createEl('span', {
        text: ' werden dauerhaft gelöscht. Möchtest du fortfahren?',
      }),
    ],
  });
  const confirmButton = createEl('button', {
    className: 'btn btn-danger w-100',
    text: 'Jestem świadom ryzyka i chcę usunąć te dane',
    attrs: { type: 'button' },
  });
  const cancelButton = createEl('button', {
    className: 'btn btn-outline-light text-danger w-100',
    text: 'Anuluj',
    attrs: { type: 'button' },
  });
  const confirmActions = createEl('div', {
    className: 'd-flex flex-column gap-2',
    children: [confirmButton, cancelButton],
  });
  const confirmBox = createEl('div', {
    className: 'alert alert-danger class-settings__confirm',
    children: [confirmText, confirmActions],
  });
  confirmBox.hidden = true;

  const dangerSection = createEl('div', {
    className: 'class-settings__card class-settings__card--danger',
    children: [
      dangerHeader,
      dangerIntro,
      deleteLabel,
      deleteHelp,
      deleteInput,
      deleteButton,
      deleteFeedback,
      confirmBox,
    ],
  });

  const content = createEl('div', {
    className: 'class-settings-overlay__content',
    children: [childrenSection, dangerSection],
  });

  panel.append(header, content);
  overlay.append(panel);

  const updateChildrenList = (nextChildren) => {
    clearElement(childrenList);
    const items = Array.isArray(nextChildren) ? nextChildren : [];
    childrenCountBadge.textContent = `${items.length} ${items.length === 1 ? 'Kind' : 'Kinder'}`;
    if (!items.length) {
      childrenList.append(
        createEl('p', {
          className: 'text-muted small mb-0',
          text: 'Keine Kinder hinterlegt.',
        }),
      );
      return;
    }
    items.forEach((child) => {
      childrenList.append(
        createEl('span', {
          className:
            'badge rounded-pill text-bg-light border class-settings__child-pill',
          text: child,
        }),
      );
    });
  };

  const showFeedback = (text, variant = 'muted') => {
    deleteFeedback.textContent = text;
    deleteFeedback.classList.remove('text-danger', 'text-success', 'text-muted');
    deleteFeedback.classList.add(`text-${variant}`);
    deleteFeedback.hidden = !text;
  };

  const openConfirmation = (childName) => {
    pendingDeletion = childName;
    confirmName.textContent = `„${childName}“`;
    confirmBox.hidden = false;
  };

  const closeConfirmation = () => {
    pendingDeletion = '';
    confirmBox.hidden = true;
  };

  deleteButton.addEventListener('click', () => {
    const typedName = deleteInput.value.trim();
    showFeedback('', 'muted');
    closeConfirmation();
    if (!typedName) {
      showFeedback('Bitte einen Namen eingeben.', 'danger');
      return;
    }
    const match = currentChildren.find(
      (child) => child.toLocaleLowerCase() === typedName.toLocaleLowerCase(),
    );
    if (!match) {
      showFeedback('Kein Kind mit diesem Namen gefunden.', 'danger');
      return;
    }
    openConfirmation(match);
  });

  confirmButton.addEventListener('click', () => {
    if (!pendingDeletion) {
      return;
    }
    const result = removeChildWithData(pendingDeletion);
    if (result.status === 'deleted') {
      currentChildren = currentChildren.filter(
        (child) => child.toLocaleLowerCase() !== pendingDeletion.toLocaleLowerCase(),
      );
      updateChildrenList(currentChildren);
      showFeedback('Kind und verknüpfte Einträge wurden entfernt.', 'success');
      deleteInput.value = '';
    } else {
      showFeedback('Löschen fehlgeschlagen. Bitte erneut versuchen.', 'danger');
    }
    closeConfirmation();
  });

  cancelButton.addEventListener('click', () => {
    closeConfirmation();
  });

  const open = () => {
    overlay.classList.add('is-open');
    overlay.setAttribute('aria-hidden', 'false');
    document.body.classList.add('class-settings-overlay-open');
  };

  const close = () => {
    overlay.classList.remove('is-open');
    overlay.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('class-settings-overlay-open');
    closeConfirmation();
    showFeedback('', 'muted');
  };

  closeButton.addEventListener('click', close);
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) {
      close();
    }
  });

  updateChildrenList(currentChildren);

  const update = ({ children: nextChildren = [] } = {}) => {
    currentChildren = Array.isArray(nextChildren) ? [...nextChildren] : [];
    updateChildrenList(currentChildren);
  };

  return {
    element: overlay,
    open,
    close,
    update,
  };
};
