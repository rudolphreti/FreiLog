import { removeChild } from '../db/dbRepository.js';

const normalizeChildren = (value) => {
  if (!Array.isArray(value)) {
    return [];
  }
  return [...value].sort((a, b) => a.localeCompare(b, 'de'));
};

export const createClassSettings = ({
  overlay,
  closeButton,
  openButton,
  updateChildren,
  deleteInput,
  deleteTrigger,
  deleteFeedback,
  confirmDialog,
  confirmMessage,
  confirmAccept,
  confirmCancel,
}) => {
  if (!overlay) {
    return null;
  }

  let currentChildren = [];
  let currentOpenButton = null;

  const setFeedback = (message, tone = 'danger') => {
    if (!deleteFeedback) {
      return;
    }
    deleteFeedback.textContent = message || '';
    deleteFeedback.hidden = !message;
    deleteFeedback.classList.toggle('text-danger', tone === 'danger');
    deleteFeedback.classList.toggle('text-success', tone === 'success');
  };

  const hideDialog = () => {
    if (confirmDialog) {
      confirmDialog.hidden = true;
    }
    if (confirmAccept) {
      delete confirmAccept.dataset.childName;
    }
  };

  const close = () => {
    overlay.classList.remove('is-open');
    overlay.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('class-settings-overlay-open');
    hideDialog();
  };

  const open = () => {
    overlay.classList.add('is-open');
    overlay.setAttribute('aria-hidden', 'false');
    document.body.classList.add('class-settings-overlay-open');
    setFeedback('');
    hideDialog();
    if (typeof overlay.focus === 'function') {
      overlay.focus();
    }
    if (deleteInput) {
      deleteInput.focus();
      deleteInput.select();
    }
  };

  const renderChildren = (nextChildren) => {
    currentChildren = normalizeChildren(nextChildren);
    if (typeof updateChildren === 'function') {
      updateChildren(currentChildren);
    }
  };

  const bindOpenButton = (button) => {
    if (currentOpenButton === button) {
      return;
    }
    if (currentOpenButton) {
      currentOpenButton.removeEventListener('click', open);
    }
    currentOpenButton = button || null;
    if (currentOpenButton) {
      currentOpenButton.addEventListener('click', open);
    }
  };

  const showDialog = (name) => {
    if (!confirmDialog || !confirmMessage || !confirmAccept) {
      return;
    }
    confirmMessage.textContent = `Alle Daten zu „${name}“ werden gelöscht. Fortfahren?`;
    confirmDialog.hidden = false;
    confirmAccept.dataset.childName = name;
    confirmAccept.focus();
  };

  const handleDeleteClick = () => {
    const value = deleteInput?.value ? deleteInput.value.trim() : '';
    if (!value) {
      setFeedback('Bitte gib einen Namen ein.');
      hideDialog();
      return;
    }

    const match = currentChildren.find((child) => child === value);
    if (!match) {
      setFeedback('Kein Kind mit diesem Namen gefunden.');
      hideDialog();
      return;
    }

    setFeedback('');
    showDialog(match);
  };

  const handleConfirmDelete = () => {
    const targetName = confirmAccept?.dataset.childName;
    if (!targetName) {
      setFeedback('Bitte wähle zunächst ein Kind aus der Liste.');
      return;
    }

    const result = removeChild(targetName);
    hideDialog();
    if (result?.status === 'removed') {
      setFeedback('Das Kind und alle zugehörigen Daten wurden gelöscht.', 'success');
      if (deleteInput) {
        deleteInput.value = '';
      }
    } else {
      setFeedback('Kein Kind mit diesem Namen gefunden.', 'danger');
    }
  };

  if (closeButton) {
    closeButton.addEventListener('click', close);
  }
  if (deleteTrigger) {
    deleteTrigger.addEventListener('click', handleDeleteClick);
  }
  if (confirmCancel) {
    confirmCancel.addEventListener('click', hideDialog);
  }
  if (confirmAccept) {
    confirmAccept.addEventListener('click', handleConfirmDelete);
  }

  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) {
      close();
    }
  });

  overlay.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
    }
  });

  bindOpenButton(openButton);
  renderChildren(currentChildren);

  return {
    open,
    close,
    updateChildren: renderChildren,
    bindOpenButton,
    element: overlay,
  };
};
