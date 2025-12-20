import { clearDay, importJson, resetOverlay } from '../db/dbRepository.js';
import { getState, setExportMode } from '../state/store.js';
import { ensureYmd, todayYmd } from '../utils/date.js';

const createFallbackEntry = (date) => ({
  date,
  angebote: [],
  observations: {},
  absentChildren: [],
  notes: '',
});

const downloadJson = (filename, jsonString) => {
  const blob = new Blob([jsonString], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

const handleExport = () => {
  const { db, ui } = getState();
  const exportMode = ui.exportMode === 'all' ? 'all' : 'day';

  if (!db) {
    downloadJson('kidsobs_all.json', '{}');
    return;
  }

  if (exportMode === 'all') {
    downloadJson('kidsobs_all.json', JSON.stringify(db, null, 2));
    return;
  }

  const date = ensureYmd(ui.selectedDate, todayYmd());
  const entry = db.records?.entriesByDate?.[date] || createFallbackEntry(date);
  const payload = { type: 'day', date, entry };
  downloadJson(`kidsobs_${date}.json`, JSON.stringify(payload, null, 2));
};

const handleImport = async (file) => {
  if (!file) {
    return;
  }

  try {
    const text = await file.text();
    const parsed = JSON.parse(text);
    importJson(parsed);
  } catch (error) {
    console.warn('Import fehlgeschlagen', error);
    alert('Import fehlgeschlagen. Bitte eine gültige JSON-Datei wählen.');
  }
};

export const bindImportExport = ({
  exportModeButtons,
  exportButton,
  importButton,
  deleteButton,
  resetButton,
  fileInput,
}) => {
  exportModeButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const mode = button.dataset.mode === 'all' ? 'all' : 'day';
      setExportMode(mode);
    });
  });

  if (exportButton) {
    exportButton.addEventListener('click', handleExport);
  }

  if (importButton && fileInput) {
    importButton.addEventListener('click', () => {
      fileInput.click();
    });

    fileInput.addEventListener('change', async () => {
      const [file] = fileInput.files || [];
      await handleImport(file);
      fileInput.value = '';
    });
  }

  if (deleteButton) {
    deleteButton.addEventListener('click', () => {
      const { ui } = getState();
      const date = ensureYmd(ui.selectedDate, todayYmd());
      const confirmed = window.confirm(
        `Tag ${date} wirklich löschen? Dieser Vorgang kann nicht rückgängig gemacht werden.`,
      );
      if (confirmed) {
        clearDay(date);
      }
    });
  }

  if (resetButton) {
    resetButton.addEventListener('click', async () => {
      const confirmed = window.confirm(
        'Alle lokalen Änderungen zurücksetzen und auf db.json zurücksetzen?',
      );
      if (!confirmed) {
        return;
      }

      await resetOverlay();
      window.location.reload();
    });
  }
};
