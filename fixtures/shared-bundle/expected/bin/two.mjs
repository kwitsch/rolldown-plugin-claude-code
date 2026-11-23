#!/usr/bin/env node
const e=await import(`../lib/shared/index.mjs`);console.log(await e.loadHeavy());export{};