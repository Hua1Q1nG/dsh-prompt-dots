/**
 * dsh-prompt-dots — host face (no-op).
 *
 * This plugin is a client-only (web) plugin. The host half exists only so the
 * package can be loaded as a Cordis plugin by the dsh profile loader; the
 * browser surface is declared by the "dsh.client" field in package.json and
 * served at /plugins/dsh-prompt-dots/client.js.
 */

const name = "prompt-dots";

function apply() {
  // Client-only plugin: nothing to do on the host.
}

export { apply, name };
