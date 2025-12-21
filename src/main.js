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
  const initialDate = todayYmd();
  setSelectedDate(initialDate);
  if (initialDate === state.ui.selectedDate) {
    renderApp(app, state);
  }
};

startApp();
