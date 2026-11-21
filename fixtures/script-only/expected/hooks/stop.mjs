#!/usr/bin/env node
import{readFileSync as e,writeFileSync as t}from"node:fs";const n=e(0,`utf8`),r=process.env.FIXTURE_MARKER;r&&t(r,n);export{};