// Per-render canvas geometry. A display has an image size (its firmware mode's
// width x height) and a rotation applied when encoding; the canvas we draw on
// is the image size rotated back. Themes and panels read the *current*
// geometry through px()/isPortrait() (see scale.mjs); the renderer sets it
// before each frame and renders frames one at a time, so they never interleave.
import * as config from './config.mjs';

export function geometryFor({ width = config.PANEL_WIDTH, height = config.PANEL_HEIGHT, rotation = config.OUTPUT_ROTATION } = {}) {
  const r = ((rotation % 360) + 360) % 360;
  const swap = r === 90 || r === 270;
  const w = swap ? height : width;
  const h = swap ? width : height;
  const portrait = h > w;
  // Designed 800 units wide in portrait; landscape lays out two portrait-width columns.
  return { key: `${w}x${h}`, rotation: r, width: w, height: h, portrait, scale: w / (portrait ? 800 : 1600) };
}

let current = geometryFor();
export const useGeometry = (geometry) => { current = geometry; };
export const currentGeometry = () => current;
