import {wallpaperPreviewURL} from './wallpaper-entry.js';
import {validateObservation} from './crystal-traits.js';

export const TANK_PHOTO_LIMIT = 4;
export const TANK_PHOTO_CHARS = 48 * 1024;

export function writePhotoCaption(photo, value, at) {
  const text = validateObservation(value);
  if (text) photo.caption = {text, at};
  else delete photo.caption;
}

export function tankPhotoURL(jpeg) {
  if (typeof jpeg !== 'string' || jpeg.length < 8 || jpeg.length > TANK_PHOTO_CHARS || jpeg.length % 4) return '';
  const url = wallpaperPreviewURL(jpeg);
  if (!url) return '';
  // The last quartet may contain padding, so inspect the last two decoded bytes.
  if (!atob(jpeg.slice(-8)).endsWith('\xff\xd9')) return '';
  return url;
}

export function validateTankPhotos(photos, records, tanks, state) {
  if (photos === undefined) return;
  if (!Array.isArray(photos) || photos.length > TANK_PHOTO_LIMIT) throw Error('缸边留影数量无效');
  const ids = new Set();
  for (const photo of photos) {
    const record = records.get(photo?.individualId);
    const arrived = record?.source === 'bred' ? record.adultAt - state.growthMs + state.stageMs.hatch :
      record?.source.startsWith('shop:') ? record.adultAt : 0;
    if (!record || !tanks.has(photo.tankId) || typeof photo.id !== 'string' ||
        !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(photo.id) || ids.has(photo.id) ||
        !Number.isSafeInteger(photo.at) || photo.at < Math.max(0, arrived) || photo.at > state.now || photo.at > 8640000000000000 ||
        (record.soldAt !== null && photo.at > record.soldAt) ||
        typeof photo.name !== 'string' || !photo.name.trim() || photo.name.length > 64 ||
        !tankPhotoURL(photo.jpeg)) throw Error('缸边留影的照片或个体资料无效');
    if (photo.caption !== undefined) {
      const note = photo.caption;
      if (!note || !Number.isSafeInteger(note.at) || note.at < photo.at || note.at > state.now ||
          note.at > 8640000000000000 || !validateObservation(note.text)) throw Error('照片留言或书写时间无效');
    }
    ids.add(photo.id);
  }
}
