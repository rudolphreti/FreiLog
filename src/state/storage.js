import { APP_STORAGE_KEY } from '../config.js';

const STORAGE_KEY = APP_STORAGE_KEY;

export const storage = {
  load() {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  },
  save(state) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  },
  clear() {
    window.localStorage.removeItem(STORAGE_KEY);
  },
};
