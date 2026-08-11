// Creative OS — media URL type guards shared by the Character studio panels.
//
// The Creative Library stores canonical Creative Assets; an asset record's
// generatedFiles/metadata entries alone never prove a media type (legacy
// records can carry a still image as their only "file"). These guards require
// actual URL evidence — a video file/video endpoint or an audio file — before a
// picker ever presents an entry. Both helpers are strict: empty/undefined URLs
// are never accepted.

export function isPlayableVideoUrl(url) {
  if (!url) return false;
  const value = String(url);
  return /\.(mp4|webm|mov|m4v)(\?|#|$)/i.test(value) || /video\//i.test(value);
}

export function isAudioUrl(url) {
  if (!url) return false;
  const value = String(url);
  return /\.(mp3|wav|m4a|aac|ogg|flac|opus|wma)(\?|#|$)/i.test(value) || /audio\//i.test(value);
}
