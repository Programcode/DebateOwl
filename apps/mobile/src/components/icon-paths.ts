/**
 * Stroke icons from the approved mocks (24x24, 2px round strokes). The tab
 * icons are also rendered to template PNGs in assets/tab-icons by
 * scripts/render-tab-icons.ts, because native tabs take images, not SVG.
 */
export const iconPaths = {
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5"/>',
  sparkles:
    '<path d="M12 3l1.8 4.9L18.7 9.7 13.8 11.5 12 16.4l-1.8-4.9L5.3 9.7l4.9-1.8z"/><path d="M19 15l.7 1.8 1.8.7-1.8.7L19 20l-.7-1.8-1.8-.7 1.8-.7z"/>',
  swords:
    '<path d="M14.5 17.5 3 6V3h3l11.5 11.5M13 19l6-6M16 16l4 4M19 21l2-2"/><path d="M14.5 6.5 18 3h3v3l-3.5 3.5M5 14l4 4M7 17l-3 3M3 19l2 2"/>',
  library: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M8 7v10M12 7v10M16 7l2 10"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M20 21a8 8 0 0 0-16 0"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
} as const;

export type IconName = keyof typeof iconPaths;

export function iconSvg(name: IconName, color: string, size: number, strokeWidth = 2): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" ` +
    `stroke="${color}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round">${iconPaths[name]}</svg>`
  );
}
