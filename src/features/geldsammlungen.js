import { saveGeldsammlungen } from '../db/dbRepository.js';
import { createEl } from '../ui/dom.js';
import {
  normalizeGeldsammlungDate,
  normalizeGeldsammlungName,
  normalizeGeldsammlungen,
} from '../utils/geldsammlungen.js';

const createEmptyEntry = () => ({
  name: '',
  date: '',
  paidBy: [],
});

const buildPaidBadge = () =>
  createEl('span', {
    className: 'badge text-bg-success geldsammlung-paid-badge',
    text: 'Bezahlt',
  });

const buildChildButton = ({ child, isPaid }) =>
  createEl('button', {
    className:
      `btn btn-sm rounded-pill d-inline-flex align-items-center gap-2 geldsammlung-child-button ${
        isPaid ? 'btn-success' : 'btn-outline-secondary'
      }`,
    attrs: {
      type: 'button',
      'aria-pressed': isPaid ? 'true' : 'false',
    },
    dataset: {
      role: 'geldsammlung-child',
      child,
    },
    children: [
      createEl('span', { className: 'fw-semibold', text: child }),
      isPaid ? buildPaidBadge() : null,
    ].filter(Boolean),
  });

const buildEntryCard = ({ entry, children }) => {
  const childrenList = createEl('div', { className: 'd-flex flex-wrap gap-2' });
  const paidSet = new Set(entry.paidBy || []);

  if (children.length) {
    children.forEach((child) => {
      childrenList.appendChild(
        buildChildButton({
          child,
          isPaid: paidSet.has(child),
        }),
      );
    });
  } else {
    childrenList.appendChild(
      createEl('span', {
        className: 'text-muted small',
        text: 'Noch keine Kinder in der Klasse hinterlegt.',
      }),
    );
  }

  const dateBadge = createEl('span', {
    className: 'badge text-bg-light text-secondary',
    text: entry.date,
  });

  return createEl('div', {
    className: 'card border-0 geldsammlung-card',
    dataset: { id: entry.id },
    children: [
      createEl('div', {
        className: 'card-body d-flex flex-column gap-2',
        children: [
          createEl('div', {
            className: 'd-flex flex-wrap align-items-center justify-content-between gap-2',
            children: [
              createEl('div', { className: 'h6 mb-0', text: entry.name }),
              dateBadge,
            ],
          }),
          childrenList,
        ],
      }),
    ],
  });
};

export const createGeldsammlungenView = ({
  geldsammlungen = [],
  children = [],
} = {}) => {
  let entries = normalizeGeldsammlungen(geldsammlungen, children);
  let knownChildren = Array.isArray(children) ? children : [];
  let isOpen = false;

  const overlay = createEl('div', {
    className: 'geldsammlungen-overlay',
    attrs: { 'aria-hidden': 'true' },
  });
  const panel = createEl('div', { className: 'geldsammlungen-overlay__panel' });
  const header = createEl('div', { className: 'geldsammlungen-overlay__header' });
  const title = createEl('h3', { className: 'h4 mb-0', text: 'Geldsammlungen' });
  const closeButton = createEl('button', {
    className: 'btn-close geldsammlungen-overlay__close',
    attrs: { type: 'button', 'aria-label': 'Schließen' },
  });
  header.append(title, closeButton);

  const formCard = createEl('div', {
    className: 'card border-0',
  });
  const formBody = createEl('div', { className: 'card-body d-flex flex-column gap-3' });
  const nameInput = createEl('input', {
    className: 'form-control',
    attrs: { type: 'text', placeholder: 'Name des Ereignisses' },
  });
  const dateInput = createEl('input', {
    className: 'form-control',
    attrs: { type: 'date' },
  });
  const statusText = createEl('div', { className: 'small text-muted', text: '' });
  const addButton = createEl('button', {
    className: 'btn btn-primary',
    attrs: { type: 'button' },
    text: 'Geldsammlung hinzufügen',
  });
  formBody.append(
    createEl('div', {
      className: 'd-flex flex-column gap-2',
      children: [
        createEl('label', { className: 'form-label mb-0', text: 'Ereignis' }),
        nameInput,
      ],
    }),
    createEl('div', {
      className: 'd-flex flex-column gap-2',
      children: [
        createEl('label', { className: 'form-label mb-0', text: 'Datum' }),
        dateInput,
      ],
    }),
    createEl('div', {
      className: 'd-flex flex-wrap align-items-center gap-2',
      children: [addButton, statusText],
    }),
  );
  formCard.appendChild(formBody);

  const list = createEl('div', {
    className: 'd-flex flex-column gap-3',
    dataset: { role: 'geldsammlungen-list' },
  });

  const content = createEl('div', {
    className: 'geldsammlungen-overlay__content d-flex flex-column gap-3',
    children: [formCard, list],
  });

  panel.append(header, content);
  overlay.append(panel);

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

  const persist = (nextEntries) => {
    entries = normalizeGeldsammlungen(nextEntries, knownChildren);
    saveGeldsammlungen(entries);
  };

  const renderEntries = () => {
    list.replaceChildren();
    if (!entries.length) {
      list.appendChild(
        createEl('div', {
          className: 'alert alert-light mb-0',
          text: 'Noch keine Geldsammlungen angelegt.',
        }),
      );
      return;
    }
    entries.forEach((entry) => {
      list.appendChild(buildEntryCard({ entry, children: knownChildren }));
    });
  };

  const handleAdd = () => {
    const name = normalizeGeldsammlungName(nameInput.value);
    const date = normalizeGeldsammlungDate(dateInput.value);
    if (!name || !date) {
      setStatus('Bitte Ereignisname und Datum ausfüllen.', 'error');
      return;
    }
    const nextEntries = [
      ...entries,
      {
        ...createEmptyEntry(),
        name,
        date,
      },
    ];
    persist(nextEntries);
    nameInput.value = '';
    dateInput.value = '';
    setStatus('Geldsammlung hinzugefügt.', 'success');
    renderEntries();
  };

  const handleChildToggle = (event) => {
    const target = event.target.closest('[data-role="geldsammlung-child"]');
    if (!(target instanceof HTMLElement)) {
      return;
    }
    const card = target.closest('[data-id]');
    const entryId = card instanceof HTMLElement ? card.dataset.id : '';
    const child = target.dataset.child || '';
    if (!entryId || !child) {
      return;
    }

    const nextEntries = entries.map((entry) => {
      if (entry.id !== entryId) {
        return entry;
      }
      const paidSet = new Set(entry.paidBy || []);
      if (paidSet.has(child)) {
        paidSet.delete(child);
      } else {
        paidSet.add(child);
      }
      return {
        ...entry,
        paidBy: Array.from(paidSet),
      };
    });
    persist(nextEntries);
    renderEntries();
  };

  addButton.addEventListener('click', handleAdd);
  list.addEventListener('click', handleChildToggle);

  closeButton.addEventListener('click', () => {
    overlay.classList.remove('is-open');
    overlay.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('geldsammlungen-overlay-open');
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
    document.body.classList.add('geldsammlungen-overlay-open');
    isOpen = true;
  };

  const close = () => {
    closeButton.click();
  };

  const update = ({ geldsammlungen: nextEntries = [], children: nextChildren = [] } = {}) => {
    knownChildren = Array.isArray(nextChildren) ? nextChildren : [];
    entries = normalizeGeldsammlungen(nextEntries, knownChildren);
    setStatus('');
    renderEntries();
  };

  renderEntries();

  return {
    element: overlay,
    open,
    close,
    update,
  };
};
