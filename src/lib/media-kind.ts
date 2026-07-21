// Helpers to detect media type from URL and/or a stored `kind` flag.
// GIFs remain "image" (render fine with <img>). Any recognized video
// container or HLS/DASH stream is treated as video. When the DB provides
// a `kind`, trust it first (covers CDN URLs without a file extension).

const VIDEO_EXT =
  /\.(mp4|webm|mov|m4v|ogv|ogg|mkv|avi|3gp|3g2|ts|mts|m2ts|mpeg|mpg|flv|wmv|qt|hevc)(\?|#|$)/i;
const STREAM_EXT = /\.(m3u8|mpd)(\?|#|$)/i;

export type MediaKind = "image" | "video";

export function isVideoUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  return VIDEO_EXT.test(url) || STREAM_EXT.test(url);
}

export function isGifUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  return /\.gif(\?|#|$)/i.test(url);
}

export function detectMediaKind(url: string | null | undefined): MediaKind {
  return isVideoUrl(url) ? "video" : "image";
}

/** Prefer the stored `kind` (authoritative); fall back to URL sniffing. */
export function isVideoMedia(
  media: { url?: string | null; kind?: string | null } | null | undefined,
): boolean {
  if (!media) return false;
  if (media.kind === "video") return true;
  if (media.kind === "image") return false;
  return isVideoUrl(media.url);
}
