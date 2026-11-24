const shared = await import("../lib/shared/index.js");

console.log(await shared.loadHeavy());
