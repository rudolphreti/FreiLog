// Lokaler Server-Start:
// python -m http.server 5500
// http://localhost:5500

const app = document.querySelector('#app');

fetch('/data/db.json')
  .then((response) => response.json())
  .then((data) => {
    if (app) {
      app.textContent = `Daten geladen: ${Object.keys(data).length} Einträge`;
    }
  })
  .catch((error) => {
    console.error('Fehler beim Laden der Daten:', error);
    if (app) {
      app.textContent = 'Daten konnten nicht geladen werden.';
    }
  });
