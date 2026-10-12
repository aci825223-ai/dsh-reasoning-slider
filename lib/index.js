/**
 * dsh-reasoning-slider — host (node) half.
 *
 * The contribution of this package is entirely client side: the browser half
 * declared through `dsh.client` in package.json shadows the composer's model
 * seat (`conversation.input.model`) and renders the reasoning effort as a
 * slider.
 *
 * The host half exists so the composition owns a row whose *name equals the
 * package name*, which is what lets the client-modules host half discover and
 * serve `./client`.
 *
 * @module dsh-reasoning-slider
 */

/** Cordis plugin name; kept equal to the package name on purpose. */
export const name = 'dsh-reasoning-slider';

/** Nothing to wait for: this plugin provides no host-side service. */
export const inject = [];

/**
 * No host-side behaviour.
 *
 * Every contribution lives in the browser bundle, so mounting this row only
 * registers an empty plugin fiber.
 * @param _ctx - the plugin context, intentionally unused.
 */
export function apply(_ctx) {}
