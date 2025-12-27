import { exportJson, importJson } from '../db/dbRepository.js';
import { setSelectedDate } from '../state/store.js';
import { todayYmd } from '../utils/date.js';

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
  const { filename, jsonString } = exportJson('all');
  downloadJson(filename, jsonString);
};

const handleImport = async (file) => {
  if (!file) {
    return;
  }

  try {
    const text = await file.text();
    const parsed = JSON.parse(text);
    importJson(parsed);
    setSelectedDate(todayYmd());
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
