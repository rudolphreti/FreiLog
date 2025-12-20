import { LEGACY_STORAGE_KEY, STORAGE_KEY } from '../config.js';
import {
  createEmptyAppData,
  migrateLegacyData,
  normalizeAppData,
} from '../db/dbSchema.js';

const loadDefaults = async () => {
  const response = await fetch('data/appData.default.json', {
    cache: 'no-store',
  });
  const text = await response.text();
  const parsed = JSON.parse(text);
  return normalizeAppData(parsed, createEmptyAppData());
};

const readLocalStorage = () => {
  if (typeof localStorage === 'undefined') {
    return null;
  }

  const raw = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_STORAGE_KEY);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw);
  } catch (error) {
    console.warn('Failed to parse app data from localStorage.', error);
    return null;
  }
};

export const loadAppData = async () => {
  const defaults = await loadDefaults();
  const stored = readLocalStorage();

  if (!stored) {
    saveAppData(defaults);
    return defaults;
  }

  const migrated = migrateLegacyData(stored, defaults);
  const original = JSON.stringify(stored);
  const updated = JSON.stringify(migrated);
  if (original !== updated) {
    saveAppData(migrated);
  }

  return migrated;
};

export const saveAppData = (data) => {
  if (typeof localStorage === 'undefined') {
    return;
  }

  const normalized = normalizeAppData(data, createEmptyAppData());
  localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
};

export const clearAppData = () => {
  if (typeof localStorage === 'undefined') {
    return;
  }

  localStorage.removeItem(STORAGE_KEY);
};
