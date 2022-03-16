import { mkdir, cp, exec, echo, cat, rm } from "shelljs";
import { readFileSync } from "fs";

function getVersionFromPackageJson(): string {
  const pkgJson = readFileSync("package.json", "utf8");
  const { version } = JSON.parse(pkgJson);
  return version;
}

const rollupOutput = "dist/temp.js";
const destination = "dist/moz-kinto-http-client.js";

mkdir("-p", "dist");

cp("fx-src/jsm_prefix.js", destination);

const gitRev = exec("git rev-parse --short HEAD", {
  silent: true,
}).stdout.trim();
const version = getVersionFromPackageJson();

echo(`\n/*\n * Version ${version} - ${gitRev}\n */\n`).toEnd(destination);
cat(rollupOutput).toEnd(destination);
rm(rollupOutput);
