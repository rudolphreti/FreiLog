import { infoCard } from './components.js';

export const renderAppShell = (root, appName) => {
  root.innerHTML = '';
  root.append(
    infoCard(
      `${appName} – start`,
      'Utworzono strukturę modułów. Dalej dodamy widoki funkcji.'
    )
  );
};
