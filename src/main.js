import { APP_NAME } from './config.js';
import { initState } from './state/stateManager.js';
import { loadDefaults } from './data/defaults.js';
import { renderAppShell } from './ui/render.js';

const root = document.querySelector('#app-root');

if (root) {
  renderAppShell(root, APP_NAME);
}

initState(loadDefaults());
