import { normalizeChildName, normalizeEntlassung } from '../db/dbSchema.js';
import { saveClassEntlassung } from '../db/dbRepository.js';
import { getState } from '../state/store.js';

const hasOption = (options, value) =>
  Array.isArray(options) && typeof value === 'string' && options.includes(value);

const getFirstOptionValue = (select) => {
  if (!(select instanceof HTMLSelectElement)) {
    return '';
  }
  const match = Array.from(select.options).find((option) => option.value);
  return match?.value || '';
};

export const bindEntlassungAusnahmen = ({
  container,
  entlassungView,
  selectedDate,
  children = [],
  entlassungInfo = {},
  readOnly = false,
}) => {
  if (!container || !entlassungView?.refs) {
    return null;
  }

  const {
    ausnahmenAddButton,
    ausnahmenForm,
    ausnahmenChildSelect,
    ausnahmenTimeSelect,
    ausnahmenSonderToggle,
    ausnahmenSonderSelect,
    ausnahmenError,
    ausnahmenRegularLabel,
    ausnahmenSonderLabel,
    ausnahmenAllowedHint,
    ausnahmenCancelButton,
  } = entlassungView.refs;

  if (
    !ausnahmenAddButton ||
    !ausnahmenForm ||
    !ausnahmenChildSelect ||
    !ausnahmenTimeSelect ||
    !ausnahmenSonderToggle ||
    !ausnahmenSonderSelect ||
    !ausnahmenError ||
    !ausnahmenRegularLabel ||
    !ausnahmenSonderLabel ||
    !ausnahmenAllowedHint ||
    !ausnahmenCancelButton
  ) {
    return null;
  }

  let currentDate = selectedDate;
  let currentChildren = Array.isArray(children) ? children : [];
  let allowedTimes = Array.isArray(entlassungInfo.allowedTimes)
    ? entlassungInfo.allowedTimes
    : [];
  let sonderTimes = Array.isArray(entlassungInfo.sonderTimes)
    ? entlassungInfo.sonderTimes
    : [];
  let currentReadOnly = readOnly;

  const isReadOnly = () => currentReadOnly || container.dataset.readonly === 'true';

  const clearError = () => {
    ausnahmenError.textContent = '';
    ausnahmenError.classList.add('d-none');
  };

  const showError = (message) => {
    ausnahmenError.textContent = message;
    ausnahmenError.classList.remove('d-none');
  };

  const hideForm = () => {
    ausnahmenForm.classList.add('d-none');
    clearError();
  };

  const setMode = (isSonder) => {
    const hasAllowedTimes = allowedTimes.length > 0;
    ausnahmenRegularLabel.classList.toggle('d-none', isSonder);
    ausnahmenTimeSelect.classList.toggle('d-none', isSonder);
    ausnahmenAllowedHint.classList.toggle('d-none', isSonder || hasAllowedTimes);
    ausnahmenSonderLabel.classList.toggle('d-none', !isSonder);
    ausnahmenSonderSelect.classList.toggle('d-none', !isSonder);

    ausnahmenTimeSelect.disabled = isReadOnly() || isSonder || !hasAllowedTimes;
    ausnahmenSonderSelect.disabled = isReadOnly() || !isSonder;

    if (isSonder && !ausnahmenSonderSelect.value) {
      ausnahmenSonderSelect.value = getFirstOptionValue(ausnahmenSonderSelect);
    }
    if (!isSonder && !ausnahmenTimeSelect.value) {
      ausnahmenTimeSelect.value = getFirstOptionValue(ausnahmenTimeSelect);
    }
  };

  const persistAusnahme = ({ child, time }) => {
    const state = getState();
    const childrenList = Array.isArray(state.db?.children) ? state.db.children : [];
    const normalized = normalizeEntlassung(state.db?.classProfile?.entlassung, childrenList);
    const nextAusnahmen = normalized.ausnahmen.filter(
      (entry) => !(entry?.date === currentDate && entry?.child === child),
    );
    if (time) {
      nextAusnahmen.push({ date: currentDate, child, time });
    }
    saveClassEntlassung({
      ...normalized,
      ausnahmen: nextAusnahmen,
    });
  };

  const openForm = () => {
    if (isReadOnly()) {
      return;
    }
    clearError();
    ausnahmenForm.classList.remove('d-none');
    ausnahmenSonderToggle.checked = allowedTimes.length === 0;
    ausnahmenChildSelect.value = getFirstOptionValue(ausnahmenChildSelect);
    ausnahmenTimeSelect.value = getFirstOptionValue(ausnahmenTimeSelect);
    ausnahmenSonderSelect.value = getFirstOptionValue(ausnahmenSonderSelect);
    setMode(ausnahmenSonderToggle.checked);
    ausnahmenChildSelect.focus();
  };

  ausnahmenAddButton.addEventListener('click', openForm);
  ausnahmenCancelButton.addEventListener('click', hideForm);

  ausnahmenSonderToggle.addEventListener('change', () => {
    clearError();
    setMode(ausnahmenSonderToggle.checked);
  });

  ausnahmenForm.addEventListener('submit', (event) => {
    event.preventDefault();
    if (isReadOnly()) {
      return;
    }
    clearError();
    const child = normalizeChildName(ausnahmenChildSelect.value);
    if (!child || !currentChildren.includes(child)) {
      showError('Bitte ein Kind auswählen.');
      return;
    }
    const isSonder = ausnahmenSonderToggle.checked;
    const time = isSonder ? ausnahmenSonderSelect.value : ausnahmenTimeSelect.value;
    const validTimes = isSonder ? sonderTimes : allowedTimes;
    if (!hasOption(validTimes, time)) {
      showError(
        isSonder
          ? 'Bitte eine gültige Sonderentlassung auswählen.'
          : 'Bitte eine gültige Entlassungszeit auswählen.',
      );
      return;
    }
    persistAusnahme({ child, time });
    hideForm();
  });

  container.addEventListener('click', (event) => {
    const target = event.target.closest('[data-role="entlassung-ausnahme-remove"]');
    if (!target || !container.contains(target) || isReadOnly()) {
      return;
    }
    const child = normalizeChildName(target.dataset.child);
    if (!child) {
      return;
    }
    persistAusnahme({ child, time: '' });
  });

  const updateData = ({
    children: nextChildren,
    entlassungInfo: nextInfo,
    readOnly: nextReadOnly,
  }) => {
    currentChildren = Array.isArray(nextChildren) ? nextChildren : currentChildren;
    allowedTimes = Array.isArray(nextInfo?.allowedTimes) ? nextInfo.allowedTimes : allowedTimes;
    sonderTimes = Array.isArray(nextInfo?.sonderTimes) ? nextInfo.sonderTimes : sonderTimes;
    currentReadOnly = Boolean(nextReadOnly);
    if (isReadOnly()) {
      hideForm();
      return;
    }
    if (
      !allowedTimes.length &&
      !ausnahmenSonderToggle.checked &&
      !ausnahmenForm.classList.contains('d-none')
    ) {
      ausnahmenSonderToggle.checked = true;
    }
    setMode(ausnahmenSonderToggle.checked);
  };

  setMode(ausnahmenSonderToggle.checked);

  return {
    updateDate(nextDate) {
      currentDate = nextDate;
    },
    updateData,
  };
};
