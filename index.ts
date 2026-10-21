/**
 * piwin standalone-extension entry point.
 *
 * piwin stages a Git-installed extension directory and loads its root
 * `index.ts`. Plain pi keeps loading `./extensions/pi-watch.ts` through the
 * `pi.extensions` manifest in package.json, so this file only re-exports it.
 */
export { default } from "./extensions/pi-watch.ts";
