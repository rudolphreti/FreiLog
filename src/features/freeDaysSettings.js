import { saveFreeDays } from '../db/dbRepository.js';
import { createEl } from '../ui/dom.js';
import { isValidYmd } from '../utils/date.js';
import { normalizeFreeDays } from '../utils/freeDays.js';

const createEmptyRow = () => ({
  start: '',
  end: '',
  label: '',
});

const validateRow = (row) => {
  const errors = [];
  if (!isValidYmd(row.start)) {
    errors.push('Bitte gib ein gültiges Startdatum ein (YYYY-MM-DD).');
  }
  if (row.end && !isValidYmd(row.end)) {
    errors.push('Bitte gib ein gültiges Enddatum ein (YYYY-MM-DD).');
  }
  if (isValidYmd(row.start) && isValidYmd(row.end) && row.end < row.start) {
    errors.push('Enddatum darf nicht vor dem Startdatum liegen.');
  }
  return errors;
};

export const createFreeDaysSettingsView = ({ freeDays = [] } = {}) => {
  let rows = normalizeFreeDays(freeDays);
  let isOpen = false;

  const overlay = createEl('div', {
    className: 'free-days-overlay',
    attrs: { 'aria-hidden': 'true' },
  });
  const panel = createEl('div', { className: 'free-days-overlay__panel' });
  const header = createEl('div', { className: 'free-days-overlay__header' });
  const title = createEl('h3', { className: 'h4 mb-0', text: 'Freie Tage' });
  const closeButton = createEl('button', {
    className: 'btn-close free-days-overlay__close',
    attrs: { type: 'button', 'aria-label': 'Schließen' },
  });
  header.append(title, closeButton);

  const infoBox = createEl('div', {
    className: 'alert alert-info mb-0',
    children: [
      createEl('div', {
        className: 'fw-semibold',
        text: 'Schulfrei-Termine verwalten',
      }),
      createEl('div', {
        className: 'mb-1',
        text: 'Wochenenden werden automatisch als freie Tage berücksichtigt.',
      }),
      createEl('div', {
        className: 'mb-0',
        text: 'Hier kannst du schulfreie Tage oder Ferienzeiträume hinzufügen, bearbeiten oder löschen.',
      }),
    ],
  });

  const table = createEl('table', { className: 'table table-sm align-middle free-days__table' });
  const thead = createEl('thead');
  const headRow = createEl('tr');
  ['Von', 'Bis', 'Bezeichnung', ''].forEach((label) => {
    headRow.append(createEl('th', { className: 'small text-muted', text: label }));
  });
  thead.append(headRow);
  const tbody = createEl('tbody');
  table.append(thead, tbody);

  const addButton = createEl('button', {
    className: 'btn btn-outline-primary btn-sm d-inline-flex align-items-center gap-2',
    attrs: { type: 'button' },
    children: [createEl('span', { text: '＋' }), createEl('span', { text: 'Neuer Eintrag' })],
  });

  const footer = createEl('div', {
    className: 'd-flex flex-wrap align-items-center justify-content-between gap-2',
  });
  const saveButton = createEl('button', {
    className: 'btn btn-primary',
    attrs: { type: 'button' },
    text: 'Speichern',
  });
  const statusText = createEl('div', { className: 'small text-muted', text: '' });
  footer.append(addButton, saveButton, statusText);

  const content = createEl('div', {
    className: 'free-days-overlay__content',
    children: [infoBox, table, footer],
  });

  panel.append(header, content);
  overlay.append(panel);

  const renderRows = () => {
    tbody.replaceChildren();
    rows.forEach((row, index) => {
      const tr = createEl('tr');
      const startInput = createEl('input', {
        className: 'form-control form-control-sm',
        attrs: { type: 'date', value: row.start || '' },
      });
      const endInput = createEl('input', {
        className: 'form-control form-control-sm',
        attrs: { type: 'date', value: row.end || '' },
      });
      const labelInput = createEl('input', {
        className: 'form-control form-control-sm',
        attrs: { type: 'text', placeholder: 'z. B. Semesterferien', value: row.label || '' },
      });
      const deleteButton = createEl('button', {
        className: 'btn btn-outline-danger btn-sm',
        attrs: { type: 'button', 'aria-label': 'Eintrag löschen' },
        text: '✕',
      });
      const errorBox = createEl('div', { className: 'form-text text-danger small pt-1 d-none' });

      const updateRow = () => {
        rows[index] = {
          start: startInput.value || '',
          end: endInput.value || '',
          label: labelInput.value || '',
        };
        const errors = validateRow(rows[index]);
        errorBox.replaceChildren(...errors.map((msg) => createEl('div', { text: msg })));
        errorBox.classList.toggle('d-none', !errors.length);
      };

      startInput.addEventListener('input', updateRow);
      endInput.addEventListener('input', updateRow);
      labelInput.addEventListener('input', updateRow);
      deleteButton.addEventListener('click', () => {
        rows.splice(index, 1);
        renderRows();
      });

      tr.append(
        createEl('td', { children: [startInput] }),
        createEl('td', { children: [endInput] }),
        createEl('td', { children: [labelInput] }),
        createEl('td', { className: 'text-end', children: [deleteButton] }),
      );
      tbody.append(tr);
      const errorRow = createEl('tr', {
        children: [
          createEl('td', { attrs: { colspan: '4' }, children: [errorBox] }),
        ],
      });
      tbody.append(errorRow);
      updateRow();
    });
  };

  const setStatus = (message, tone = 'muted') => {
    statusText.textContent = message || '';
    statusText.classList.remove('text-success', 'text-danger', 'text-muted');
    if (tone === 'success') {
      statusText.classList.add('text-success');
    } else if (tone === 'error') {
      statusText.classList.add('text-danger');
    } else {
      statusText.classList.add('text-muted');
    }
  };

  const handleSave = () => {
    const errors = rows.map((row) => validateRow(row));
    const hasErrors = errors.some((rowErrors) => rowErrors.length);
    if (hasErrors) {
      setStatus('Bitte korrigiere die markierten Fehler.', 'error');
      renderRows();
      return;
    }
    const normalized = normalizeFreeDays(rows);
    rows = normalized;
    saveFreeDays(rows);
    setStatus('Gespeichert.', 'success');
    renderRows();
  };

  addButton.addEventListener('click', () => {
    rows = [...rows, createEmptyRow()];
    setStatus('');
    renderRows();
  });

  saveButton.addEventListener('click', handleSave);

  closeButton.addEventListener('click', () => {
    overlay.classList.remove('is-open');
    overlay.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('free-days-overlay-open');
    isOpen = false;
  });

  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) {
      closeButton.click();
    }
  });

  const open = () => {
    if (isOpen) {
      return;
    }
    overlay.classList.add('is-open');
    overlay.setAttribute('aria-hidden', 'false');
    document.body.classList.add('free-days-overlay-open');
    isOpen = true;
  };

  const close = () => {
    closeButton.click();
  };

  const update = ({ freeDays: nextFreeDays = [] } = {}) => {
    rows = normalizeFreeDays(nextFreeDays);
    setStatus('');
    renderRows();
  };

  renderRows();

  return {
    element: overlay,
    open,
    close,
    update,
  };
};
