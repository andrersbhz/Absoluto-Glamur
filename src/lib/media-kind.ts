// Helpers to detect media type from a URL.
// GIFs remain "image" (they render fine with <img>). Only true video files
// (mp4/webm/mov/m4v/ogv) or HLS streams are treated as videos.

const VIDEO_EXT = /\.(mp4|webm|mov|m4v|ogv|ogg)(\?|#|$)/i;
const HLS_EXT = /\.m3u8(\?|#|$)/i;

export type MediaKind = "image" | "video";

export function isVideoUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  return VIDEO_EXT.test(url) || HLS_EXT.test(url);
}

export function isGifUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  return /\.gif(\?|#|$)/i.test(url);
}

export function detectMediaKind(url: string | null | undefined): MediaKind {
  return isVideoUrl(url) ? "video" : "image";
}
