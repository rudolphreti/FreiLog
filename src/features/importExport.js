import { importJson } from '../db/dbRepository.js';
import { getState } from '../state/store.js';

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
  const { db } = getState();
  const payload = db ? JSON.stringify(db, null, 2) : '{}';
  downloadJson('kidsobs_all.json', payload);
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
  exportButton,
  importButton,
  fileInput,
}) => {
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

};
