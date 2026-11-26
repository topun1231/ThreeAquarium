export function wallpaperPreviewURL(jpeg) {
  return typeof jpeg==='string' && jpeg.length<=90000 && /^\/9j\/[A-Za-z0-9+/]*={0,2}$/.test(jpeg)
    ? 'data:image/jpeg;base64,'+jpeg : '';
}

export function isWallpaperScreen(value) {
  return typeof value==='string' && /^[1-9]\d{0,9}$/.test(value) && Number(value)<=2147483647;
}

export function wallpaperStill(copy) {
  return copy.framing==='whole-tank' || copy.framing==='whole-room' ? copy.previewJpeg ?? null : null;
}

export function wallpaperEntry(template,origin,jpeg,windowPreview=false,screen) {
  const mode=windowPreview?'preview':'desktop';
  const tracked=!windowPreview && isWallpaperScreen(screen) ? '&aq-screen='+screen : '';
  const entry=template.replace('http://127.0.0.1:5174/?wallpaper=desktop',origin+'/?wallpaper='+mode+tracked);
  const preview=wallpaperPreviewURL(jpeg);
  return preview ? entry.replace('data-aquarium-preview',`data-aquarium-preview src="${preview}"`) : entry;
}
