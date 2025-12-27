import { LEGACY_STORAGE_KEY, STORAGE_KEY } from '../config.js';
import {
  createEmptyAppData,
  migrateLegacyData,
  normalizeAppData,
} from '../db/dbSchema.js';

const loadDefaults = () => normalizeAppData(createEmptyAppData(), createEmptyAppData());

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
  const defaults = loadDefaults();
  const stored = readLocalStorage();

  if (!stored) {
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
