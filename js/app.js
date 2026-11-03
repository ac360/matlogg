// Startpunkt: laddar data, registrerar service worker och växlar mellan vyer.

import * as db from './db.js';
import { loadFoods } from './foods.js';
import { isoDate } from './nutrition.js';
import { icons, toast } from './ui.js';
import { renderDay } from './views/day.js';
import { renderSettings } from './views/settings.js';
import { renderRecipes } from './views/recipes.js';

const state = { date: isoDate() };

// Vyer. Senare: '#/vikt', '#/traning'.
const ROUTES = {
  '#/': { tab: 'day', render: main => renderDay(main, state) },
  '#/recept': { tab: 'recipes', render: main => renderRecipes(main) },
  '#/installningar': { tab: 'settings', render: main => renderSettings(main) },
};

const main = document.getElementById('main');

function renderTabbar(active) {
  const nav = document.getElementById('tabbar');
  nav.innerHTML = `
    <a href="#/" class="${active === 'day' ? 'active' : ''}">${icons.day}<span>Dag</span></a>
    <a href="#/recept" class="${active === 'recipes' ? 'active' : ''}">${icons.book}<span>Recept</span></a>
    <a href="#/installningar" class="${active === 'settings' ? 'active' : ''}">${icons.settings}<span>Inställningar</span></a>`;
}

async function route() {
  const r = ROUTES[location.hash] || ROUTES['#/'];
  renderTabbar(r.tab);
  try {
    await r.render(main);
  } catch (err) {
    console.error(err);
    main.innerHTML = `<div class="content"><p class="error">Något gick fel: ${err.message}</p></div>`;
  }
  window.scrollTo(0, 0);
}

// Byt till rätt dag om appen legat öppen över midnatt.
let lastToday = isoDate();
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  const today = isoDate();
  if (today !== lastToday) {
    if (state.date === lastToday) state.date = today;
    lastToday = today;
    if (!document.body.classList.contains('sheet-open')) route();
  }
});

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  // Under utveckling på datorn: ingen cache, så att ändringar syns direkt. Testa offline med ?sw=1.
  if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname) && !location.search.includes('sw=1')) {
    navigator.serviceWorker.getRegistrations().then(regs => regs.forEach(r => r.unregister()));
    caches?.keys().then(keys => keys.forEach(k => caches.delete(k)));
    return;
  }
  navigator.serviceWorker.register('sw.js').then(reg => {
    const prompt = worker => toast('Ny version finns', {
      action: 'Uppdatera',
      duration: 0,
      onAction: () => worker.postMessage('skipWaiting'),
    });
    if (reg.waiting && navigator.serviceWorker.controller) prompt(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      w?.addEventListener('statechange', () => {
        if (w.state === 'installed' && navigator.serviceWorker.controller) prompt(w);
      });
    });
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reg.update(); });
  });
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) return;
    reloading = true;
    location.reload();
  });
}

async function start() {
  registerServiceWorker();
  try {
    await loadFoods();
  } catch (err) {
    console.error(err);
    toast('Kunde inte ladda livsmedelsdatabasen.', { duration: 6000 });
  }
  db.requestPersistence();
  window.addEventListener('hashchange', route);
  await route();
}

start();
