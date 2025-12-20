import { createElement } from './dom.js';

export const infoCard = (title, description) => {
  const card = createElement('div', { className: 'info-card' });
  card.append(
    createElement('h2', { text: title }),
    createElement('p', { text: description })
  );
  return card;
};
