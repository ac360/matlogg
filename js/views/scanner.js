// Kameravy för streckkoder. Returnerar koden via onCode, eller inget om användaren avbryter.
// Reservvägar: ta ett foto (bra om livebilden är suddig) eller skriv in siffrorna.
//
// iPhone: openScanner måste anropas direkt i tryck-händelsen (utan await före), annars kan
// kamerabilden bli svart i hemskärmsappar. Kameran startas därför innan avläsaren laddas.

import { h, toast } from '../ui.js';

export function openScanner({ onCode }) {
  const root = h(`
    <div class="scanner" role="dialog" aria-modal="true" aria-label="Skanna streckkod">
      <div class="scan-video-slot"></div>
      <div class="scan-frame" aria-hidden="true"><span class="scan-line"></span></div>
      <div class="scan-top">
        <button type="button" class="btn-text scan-close">Avbryt</button>
        <span class="scan-title">Skanna streckkod</span>
        <span></span>
      </div>
      <div class="scan-status-box">
        <p class="scan-status">Startar kameran…</p>
        <button type="button" class="btn primary scan-restart" hidden>Starta kameran igen</button>
        <p class="scan-diag" hidden></p>
      </div>
      <div class="scan-bottom">
        <label class="btn secondary scan-photo">Ta foto i stället<input type="file" accept="image/*" capture="environment" hidden></label>
        <form class="scan-manual" autocomplete="off">
          <input type="text" inputmode="numeric" pattern="[0-9]*" placeholder="…eller skriv streckkoden" aria-label="Streckkod">
          <button type="submit" class="btn primary">OK</button>
        </form>
      </div>
    </div>`);

  // Videoelementet skapas i koden med alla attribut iOS kräver för att visa video i sidan.
  const video = document.createElement('video');
  video.className = 'scan-video';
  video.setAttribute('playsinline', '');
  video.setAttribute('webkit-playsinline', '');
  video.setAttribute('muted', '');
  video.setAttribute('autoplay', '');
  video.muted = true;
  video.playsInline = true;
  video.autoplay = true;
  root.querySelector('.scan-video-slot').replaceWith(video);

  document.body.append(root);
  document.body.classList.add('sheet-open');

  const status = root.querySelector('.scan-status');
  const restartBtn = root.querySelector('.scan-restart');
  const diag = root.querySelector('.scan-diag');
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  let stream = null;
  let running = true;
  let decoder = null;
  let busy = false;
  let watchdog = null;
  let lastError = '';

  const setStatus = text => { status.textContent = text; };

  function stopStream() {
    stream?.getTracks().forEach(t => t.stop());
    stream = null;
    video.srcObject = null;
  }

  function close(code = null) {
    if (!running) return;
    running = false;
    clearTimeout(watchdog);
    stopStream();
    root.remove();
    if (!document.querySelector('.sheet-backdrop')) document.body.classList.remove('sheet-open');
    if (code) onCode(code);
  }

  // Avläsaren laddas parallellt med kameran.
  const decoderReady = import('../barcode.js')
    .then(async d => { await d.initDecoder(); decoder = d; return d; })
    .catch(err => { console.error(err); return null; });

  function diagnostics() {
    const track = stream?.getVideoTracks()[0];
    const parts = [
      `video ${video.videoWidth}×${video.videoHeight}`,
      `readyState ${video.readyState}`,
      `paused ${video.paused}`,
      track ? `spår ${track.readyState}${track.muted ? ' (tyst)' : ''}` : 'inget spår',
      navigator.standalone ? 'hemskärm' : 'webbläsare',
    ];
    if (lastError) parts.push(lastError);
    return parts.join(' · ');
  }

  function showNoPicture() {
    setStatus('Ingen bild från kameran. Tryck på knappen, eller ta ett foto i stället.');
    restartBtn.hidden = false;
    diag.hidden = false;
    diag.textContent = diagnostics();
  }

  // Läser av mitten av bilden (där ramen är) några gånger per sekund.
  async function tick() {
    if (!running) return;
    if (decoder && !busy && video.readyState >= 2 && video.videoWidth) {
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

  async function getStream() {
    try {
      return await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' } } });
    } catch (err) {
      if (err.name === 'OverconstrainedError' || err.name === 'NotFoundError') {
        return navigator.mediaDevices.getUserMedia({ audio: false, video: true });
      }
      throw err;
    }
  }

  // Startar kameran. Anropas direkt från ett tryck (öppning eller "Starta kameran igen").
  async function startCamera() {
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus('Kameran är inte tillgänglig här. Ta ett foto eller skriv in koden.');
      return;
    }
    restartBtn.hidden = true;
    diag.hidden = true;
    lastError = '';
    setStatus('Startar kameran…');
    stopStream();
    try {
      const s = await getStream();
      if (!running) return s.getTracks().forEach(t => t.stop());
      stream = s;
      stream.getVideoTracks()[0]?.addEventListener('ended', () => { if (running) showNoPicture(); });
      video.srcObject = stream;
      try {
        await video.play();
      } catch (err) {
        lastError = `play: ${err.name}`;
      }
      setStatus('Håll streckkoden inom ramen.');
      // Om ingen bild kommit efter två sekunder: visa knappen för omstart.
      clearTimeout(watchdog);
      watchdog = setTimeout(() => {
        if (running && (!video.videoWidth || video.paused)) showNoPicture();
      }, 2000);
      tick();
    } catch (err) {
      console.error(err);
      lastError = err.name;
      setStatus(err.name === 'NotAllowedError'
        ? 'Kameran fick inte användas. Tillåt kameran för appen i iPhonens Inställningar, eller ta ett foto.'
        : 'Kameran gick inte att starta. Ta ett foto eller skriv in koden.');
      diag.hidden = false;
      diag.textContent = diagnostics();
    }
  }

  root.querySelector('.scan-close').addEventListener('click', () => close());
  restartBtn.addEventListener('click', () => startCamera());
  // Bilden kan frysa när appen läggs i bakgrunden: starta om när den kommer tillbaka.
  const onVisible = () => {
    if (!running) return document.removeEventListener('visibilitychange', onVisible);
    if (document.visibilityState === 'visible' && (!stream || video.paused)) startCamera();
  };
  document.addEventListener('visibilitychange', onVisible);

  root.querySelector('.scan-photo input').addEventListener('change', async e => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setStatus('Läser bilden…');
    const d = await decoderReady;
    if (!d) return setStatus('Kunde inte ladda streckkodsläsaren. Skriv in koden nedan.');
    try {
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
    const d = await decoderReady;
    if (d && !d.isValidCode(code)) {
      toast(`”${code}” ser inte ut som en giltig streckkod (8 eller 13 siffror).`);
      return;
    }
    if (!code) return;
    close(code);
  });

  // Ingen await före detta anrop: kameran ska begäras i samma tryck som öppnade skannern.
  startCamera();
  return { close };
}
