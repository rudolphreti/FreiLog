import { removeChildFromClass } from '../db/dbRepository.js';

const isHtmlElement = (value) => value instanceof HTMLElement;

const updateConfirmMessage = (node, childName) => {
  if (!isHtmlElement(node)) {
    return;
  }
  const trimmedName = typeof childName === 'string' ? childName.trim() : '';
  const baseText =
    'Beim Entfernen werden alle Einträge und Zuordnungen zu diesem Kind gelöscht.';
  node.textContent = trimmedName
    ? `${baseText} "${trimmedName}" wirklich löschen?`
    : baseText;
};

export const bindClassSettings = (refs) => {
  if (!refs) {
    return;
  }

  const { childSelect, removeButton, confirmBox, confirmMessage, confirmYes, confirmNo } =
    refs;

  if (!isHtmlElement(childSelect) || !isHtmlElement(removeButton)) {
    return;
  }

  const hideConfirm = () => {
    if (isHtmlElement(confirmBox)) {
      confirmBox.hidden = true;
    }
  };

  const updateRemoveState = () => {
    const hasSelection = Boolean(childSelect.value);
    removeButton.disabled = !hasSelection;
    if (!hasSelection) {
      hideConfirm();
    }
  };

  const showConfirm = () => {
    if (!childSelect.value) {
      return;
    }
    updateConfirmMessage(confirmMessage, childSelect.value);
    if (isHtmlElement(confirmBox)) {
      confirmBox.hidden = false;
    }
    if (isHtmlElement(confirmYes)) {
      confirmYes.focus();
    }
  };

  removeButton.addEventListener('click', showConfirm);

  if (isHtmlElement(confirmNo)) {
    confirmNo.addEventListener('click', hideConfirm);
  }

  if (isHtmlElement(confirmYes)) {
    confirmYes.addEventListener('click', () => {
      if (!childSelect.value) {
        return;
      }
      removeChildFromClass(childSelect.value);
      hideConfirm();
    });
  }

  childSelect.addEventListener('change', updateRemoveState);
  updateRemoveState();
};
