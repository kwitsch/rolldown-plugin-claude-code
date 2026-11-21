import { readFileSync, writeFileSync } from "node:fs";

const input = readFileSync(0, "utf8");
const marker = process.env.FIXTURE_MARKER;
if (marker) writeFileSync(marker, input);
