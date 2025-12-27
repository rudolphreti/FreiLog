import { importJson } from '../db/dbRepository.js';

const DUMMY_DATA_PATH = 'data/appData.dummy.json';

const loadDummyData = async () => {
  const response = await fetch(DUMMY_DATA_PATH, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`Dummy data request failed with status ${response.status}`);
  }
  const parsed = await response.json();
  importJson(parsed);
};

export const bindDummyDataLoader = ({ button, onLoaded } = {}) => {
  if (!button) {
    return;
  }

  const handleClick = async () => {
    try {
      await loadDummyData();
      if (typeof onLoaded === 'function') {
        onLoaded();
      }
    } catch (error) {
      console.warn('Dummy-Daten konnten nicht geladen werden.', error);
      alert('Dummy-Daten konnten nicht geladen werden.');
    }
  };

  button.addEventListener('click', handleClick);
};
