// Kameravy för streckkoder. Returnerar koden via onCode, eller inget om användaren avbryter.
// Reservvägar: ta ett foto (bra om livebilden är suddig) eller skriv in siffrorna.

import { esc, h, toast } from '../ui.js';

export function openScanner({ onCode }) {
  const root = h(`
    <div class="scanner" role="dialog" aria-modal="true" aria-label="Skanna streckkod">
      <video class="scan-video" playsinline muted autoplay></video>
      <div class="scan-frame" aria-hidden="true"><span class="scan-line"></span></div>
      <div class="scan-top">
        <button type="button" class="btn-text scan-close">Avbryt</button>
        <span class="scan-title">Skanna streckkod</span>
        <span></span>
      </div>
      <p class="scan-status">Startar kameran…</p>
      <div class="scan-bottom">
        <label class="btn secondary scan-photo">Ta foto i stället<input type="file" accept="image/*" capture="environment" hidden></label>
        <form class="scan-manual" autocomplete="off">
          <input type="text" inputmode="numeric" pattern="[0-9]*" placeholder="…eller skriv streckkoden" aria-label="Streckkod">
          <button type="submit" class="btn primary">OK</button>
        </form>
      </div>
    </div>`);
  document.body.append(root);
  document.body.classList.add('sheet-open');

  const video = root.querySelector('video');
  const status = root.querySelector('.scan-status');
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  let stream = null;
  let running = true;
  let decoder = null;
  let busy = false;

  const setStatus = text => { status.textContent = text; };

  function close(code = null) {
    if (!running) return;
    running = false;
    stream?.getTracks().forEach(t => t.stop());
    root.remove();
    document.body.classList.remove('sheet-open');
    if (code) onCode(code);
  }

  async function loadDecoder() {
    if (!decoder) {
      decoder = await import('../barcode.js');
      await decoder.initDecoder();
    }
    return decoder;
  }

  // Läser av mitten av bilden (där ramen är) några gånger per sekund.
  async function tick() {
    if (!running) return;
    if (!busy && video.readyState >= 2 && video.videoWidth) {
      busy = true;
      try {
        const vw = video.videoWidth, vh = video.videoHeight;
        const cw = Math.round(vw * 0.85), ch = Math.round(Math.min(vh, vw) * 0.5);
        canvas.width = cw;
        canvas.height = ch;
        ctx.drawImage(video, (vw - cw) / 2, (vh - ch) / 2, cw, ch, 0, 0, cw, ch);
        const code = await decoder.decode(ctx.getImageData(0, 0, cw, ch));
        if (code) {
          navigator.vibrate?.(60);
          return close(code);
        }
      } catch (err) {
        console.error(err);
      } finally {
        busy = false;
      }
    }
    setTimeout(tick, 120);
  }

  async function start() {
    try {
      await loadDecoder();
    } catch (err) {
      console.error(err);
      setStatus('Kunde inte ladda streckkodsläsaren. Skriv in koden nedan.');
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus('Kameran är inte tillgänglig här. Ta ett foto eller skriv in koden.');
      return;
    }
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      if (!running) return stream.getTracks().forEach(t => t.stop());
      video.srcObject = stream;
      await video.play().catch(() => {});
      setStatus('Håll streckkoden inom ramen.');
      tick();
    } catch (err) {
      console.error(err);
      setStatus(err.name === 'NotAllowedError'
        ? 'Kameran fick inte användas. Tillåt kameran i Inställningar → Safari, eller ta ett foto.'
        : 'Kameran gick inte att starta. Ta ett foto eller skriv in koden.');
    }
  }

  root.querySelector('.scan-close').addEventListener('click', () => close());

  root.querySelector('.scan-photo input').addEventListener('change', async e => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setStatus('Läser bilden…');
    try {
      const d = await loadDecoder();
      const code = await d.decode(file);
      if (code) return close(code);
      setStatus('Hittade ingen streckkod i bilden. Försök igen närmare, eller skriv in koden.');
    } catch (err) {
      console.error(err);
      setStatus('Kunde inte läsa bilden.');
    }
  });

  root.querySelector('.scan-manual').addEventListener('submit', async e => {
    e.preventDefault();
    const code = e.target.querySelector('input').value.replace(/\D/g, '');
    const d = await loadDecoder().catch(() => null);
    if (d && !d.isValidCode(code)) {
      toast(`”${esc(code)}” ser inte ut som en giltig streckkod (8 eller 13 siffror).`);
      return;
    }
    close(code);
  });

  start();
  return { close };
}
