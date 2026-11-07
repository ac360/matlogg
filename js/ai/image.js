// Förbereder ett foto för AI-avläsning: krymper till högst 1600 px och gör om till JPEG (base64).
// Ett iPhone-foto på flera MB blir då några hundra kB, vilket går snabbare och ryms i anropet.

const MAX_DIM = 1600;

async function loadImage(blob) {
  if (typeof createImageBitmap === 'function') {
    try { return await createImageBitmap(blob, { imageOrientation: 'from-image' }); } catch {}
  }
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

export async function prepareImage(blob) {
  const img = await loadImage(blob);
  const w = img.width, h = img.height;
  const scale = Math.min(1, MAX_DIM / Math.max(w, h));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
  const jpeg = await new Promise(res => canvas.toBlob(res, 'image/jpeg', 0.85));
  const buf = new Uint8Array(await jpeg.arrayBuffer());
  let bin = '';
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
  return { mime: 'image/jpeg', data: btoa(bin), bytes: buf.length };
}
