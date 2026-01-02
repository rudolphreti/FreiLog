import { initStore, subscribe, getState, setSelectedDate } from './state/store.js';
import { todayYmd } from './utils/date.js';
import { renderApp } from './ui/render.js';
import { applyFixedAngeboteForDate } from './db/dbRepository.js';

const app = document.querySelector('#app');

const startApp = async () => {
  await initStore();

  const initialDate = todayYmd();
  applyFixedAngeboteForDate(initialDate);

  subscribe((state) => {
    renderApp(app, state);
  });

  const state = getState();
  setSelectedDate(initialDate);
  if (initialDate === state.ui.selectedDate) {
    renderApp(app, state);
  }
};

startApp();
