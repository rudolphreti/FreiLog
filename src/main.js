import { initStore, subscribe, getState, setSelectedDate } from './state/store.js';
import { todayYmd } from './utils/date.js';
import { renderApp } from './ui/render.js';

const app = document.querySelector('#app');

const startApp = async () => {
  await initStore();

  subscribe((state) => {
    renderApp(app, state);
  });

  const state = getState();
  const initialDate = state.ui.selectedDate || todayYmd();
  if (initialDate !== state.ui.selectedDate) {
    setSelectedDate(initialDate);
  } else {
    renderApp(app, state);
  }
};

startApp();

// Manuelle Tests:
// - db.json tauschen: alte Kinder-Daten verschwinden aus Overlay.
// - Import: full db.json & Tag-Payload prüfen.
// - Suche/Combobox tippen: keine Ruckler, keine Console Errors.
