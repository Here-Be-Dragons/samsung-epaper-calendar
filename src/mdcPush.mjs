/**
 * Whether a display is pushed to at all. The conversation with the panel itself is in panel.mjs, mdc.mjs
 * and wake.mjs.
 */
import * as config from './config.mjs';

/** A display is pushed to only if it has a host and PIN (and MDC_PUSH_ENABLED isn't false). */
export function isConfigured(display) {
  return Boolean(config.MDC_PUSH_ENABLED && display.host && display.pin);
}
