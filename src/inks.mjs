// Flat colors for data, status and any theme fill we want the panel to render
// WITHOUT dithering. Panel testing (swatch sheets) showed the panel has exactly
// six real inks -- #FF0000, #FFFF00, #00FF00, #0000FF, #000000, #FFFFFF -- and
// snaps any color close to one of them onto it; colors farther away (orange,
// browns, grays, pastels, ...) are dithered. These constants are those six.
export const BLACK = '#000000';
export const WHITE = '#ffffff';
export const RED = '#ff0000';
export const YELLOW = '#ffff00';
export const GREEN = '#00ff00';
export const BLUE = '#0000ff';

/** "#rrggbb" -> [r, g, b] */
export const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
