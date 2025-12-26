import { removeChildrenAndRelatedEntries } from '../db/dbRepository.js';

const WARNING_MESSAGE =
  'Achtung! Wenn du die Kinderliste löschst, werden alle verknüpften Einträge und Beobachtungen ebenfalls entfernt. Möchtest du wirklich fortfahren? Bitte mit „Ja“ oder „Nein“ bestätigen.';

export const bindSettings = ({ removeChildrenButton } = {}) => {
  if (!removeChildrenButton) {
    return;
  }

  removeChildrenButton.addEventListener('click', () => {
    const confirmed = window.confirm(WARNING_MESSAGE);
    if (!confirmed) {
      return;
    }

    removeChildrenAndRelatedEntries();
  });
};
