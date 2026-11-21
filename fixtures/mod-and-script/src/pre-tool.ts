import { readFileSync, writeFileSync } from "node:fs";
import { markerContent } from "./shared.js";

const input = readFileSync(0, "utf8");
const marker = process.env.FIXTURE_MARKER;
if (marker) writeFileSync(marker, markerContent(`pre-tool ${process.argv.slice(2).join(" ")}`, input));
