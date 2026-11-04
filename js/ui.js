// Små UI-hjälpare: element, ark (bottom sheets), toast och bekräftelser.

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

export function h(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

// Läser ett decimaltal där användaren kan skriva komma.
export function num(value) {
  if (value == null || value === '') return null;
  const n = Number(String(value).replace(',', '.').replace(/\s/g, ''));
  return isNaN(n) ? null : n;
}

export function openSheet({ title, body, footer, onClose, tall = true }) {
  const root = h(`
    <div class="sheet-backdrop">
      <div class="sheet ${tall ? 'sheet-tall' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
        <div class="sheet-head">
          <button class="btn-text sheet-cancel" type="button">Stäng</button>
          <h2>${esc(title)}</h2>
          <span class="sheet-head-spacer"></span>
        </div>
        <div class="sheet-body"></div>
        <div class="sheet-foot"></div>
      </div>
    </div>`);
  const sheet = root.querySelector('.sheet');
  if (body) root.querySelector('.sheet-body').append(body);
  if (footer) root.querySelector('.sheet-foot').append(footer);
  else root.querySelector('.sheet-foot').remove();

  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    root.classList.remove('open');
    document.body.classList.remove('sheet-open');
    setTimeout(() => root.remove(), 250);
    onClose?.();
  };
  root.addEventListener('click', e => { if (e.target === root) close(); });
  root.querySelector('.sheet-cancel').addEventListener('click', close);
  document.body.append(root);
  document.body.classList.add('sheet-open');
  requestAnimationFrame(() => root.classList.add('open'));
  return { root, sheet, body: root.querySelector('.sheet-body'), close };
}

let toastTimer;
export function toast(message, { action, onAction, duration = 3000 } = {}) {
  document.querySelector('.toast')?.remove();
  const el = h(`<div class="toast" role="status"><span>${esc(message)}</span>${action ? `<button type="button">${esc(action)}</button>` : ''}</div>`);
  if (action) el.querySelector('button').addEventListener('click', () => { el.remove(); onAction?.(); });
  document.body.append(el);
  requestAnimationFrame(() => el.classList.add('show'));
  clearTimeout(toastTimer);
  if (duration) toastTimer = setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 300); }, duration);
  return el;
}

export function confirmDialog(message, okLabel = 'OK') {
  return Promise.resolve(window.confirm(message));
}

export const icons = {
  left: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>',
  right: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7" /></svg>',
  plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>',
  close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>',
  day: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="16" height="15" rx="3" /><path d="M4 10h16M9 3v4M15 3v4" /></svg>',
  settings: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1L7 17M17 7l2.1-2.1" /></svg>',
  book: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h10a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3V4z" /><path d="M5 17a3 3 0 0 1 3-3h10" /><path d="M9 8h5" /></svg>',
  scan: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8V5h3M17 5h3v3M20 16v3h-3M7 19H4v-3" /><path d="M8 9v6M11 9v6M13.5 9v6M16 9v6" /></svg>',
  search: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6" /><path d="M20 20l-4.5-4.5" /></svg>',
};
