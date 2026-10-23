import { currentGeometry } from './geometry.mjs';

// Everything is authored in "design units" and scaled by px() for whichever
// frame is being rendered (see geometry.mjs).
export const px = (n) => Math.round(n * currentGeometry().scale);
export const isPortrait = () => currentGeometry().portrait;
