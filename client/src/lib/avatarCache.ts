/**
 * Keeps a small copy of each member's last picture that loaded, so a picture
 * Root's link fails to serve (common on mobile) still shows instead of initials.
 */
const PREFIX = "studysquad.avatar.";
const SIZE = 96; // 2x the largest avatar (48px), sharp on most phones.
const saved = new Set<string>();

export function cachedAvatar(userId: string): string | undefined {
  try {
    return window.localStorage.getItem(PREFIX + userId) ?? undefined;
  } catch {
    return undefined;
  }
}

/**
 * Saves a copy of a picture that just loaded, once per user per visit. Reading
 * pixels needs CORS, so this loads a second copy with crossOrigin; if Root's
 * server refuses, nothing is saved and the normal picture is unaffected.
 */
export function saveAvatar(userId: string, url: string, background: string): void {
  if (saved.has(userId)) return;
  saved.add(userId);
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.onload = () => {
    try {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = SIZE;
      const ctx = canvas.getContext("2d")!;
      // Same color as the bubble behind see-through pictures (JPEG has no alpha).
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, SIZE, SIZE);
      const side = Math.min(img.naturalWidth, img.naturalHeight);
      const sx = (img.naturalWidth - side) / 2;
      const sy = (img.naturalHeight - side) / 2;
      ctx.drawImage(img, sx, sy, side, side, 0, 0, SIZE, SIZE);
      window.localStorage.setItem(PREFIX + userId, canvas.toDataURL("image/jpeg", 0.8));
    } catch {
      // Tainted canvas, full storage or no canvas: skip the cache.
    }
  };
  img.src = url;
}
