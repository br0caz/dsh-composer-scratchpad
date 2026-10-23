// dsh-composer-scratchpad — host half.
//
// This plugin contributes a browser-side control only: one pencil button in the
// composer tool row that opens a plain textarea. The kernel entry therefore
// stays inert on purpose. The browser half is declared in package.json under
// `dsh.client` and mounts itself through the client slot registry.
const name = "dsh-composer-scratchpad";

function apply() {}

export { name, apply };
