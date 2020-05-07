import path from "path";
import builtins from "rollup-plugin-node-builtins";
import typescript from "rollup-plugin-typescript";
import resolve from "rollup-plugin-node-resolve";
import commonjs from "rollup-plugin-commonjs";
import { terser } from "rollup-plugin-terser";
import multi from "@rollup/plugin-multi-entry";
import replace from "@rollup/plugin-replace";

function ignoreInput(list) {
  return {
    resolveId(importee) {
      return list.indexOf(importee) > -1 ? "\0empty_module" : null;
    },
    load(id) {
      return id === "\0empty_module" ? "export default {}" : null;
    },
  };
}

const geckoBuild = {
  input: "./src/index.fx.ts",
  output: [
    {
      file: "dist/temp.js",
      format: "umd",
      name: "Kinto",
    },
  ],
  plugins: [
    ignoreInput(["uuid/v4"]),
    resolve({
      mainFields: ["module", "main", "browser"],
      preferBuiltins: true,
    }),
    typescript({ include: ["*.ts+(|x)", "**/*.ts+(|x)", "*.js", "**/*.js"] }),
    commonjs({ ignoreGlobal: true }),
  ],
};

const browserBuild = {
  input: "./src/index.ts",
  output: [
    {
      file: "dist/kinto.min.js",
      format: "umd",
      name: "Kinto",
      sourcemap: true,
    },
  ],
  plugins: [
    resolve({
      mainFields: ["module", "main", "browser"],
      preferBuiltins: true,
    }),
    typescript({
      target: "es5",
      include: ["*.ts+(|x)", "**/*.ts+(|x)", "*.js", "**/*.js"],
    }),
    builtins(),
    commonjs(),
    terser(),
  ],
};

const browserTestBuild = {
  input: "./test/**/*_test.ts",
  output: [
    {
      file: "dist/test-suite.js",
      format: "iife",
      sourcemap: true,
      globals: {
        intern: "intern",
      },
    },
  ],
  plugins: [
    multi(),
    resolve({
      mainFields: ["browser", "module", "main"],
      preferBuiltins: true,
    }),
    typescript({
      target: "es2019",
      types: ["intern"],
    }),
    replace({
      __dirname: JSON.stringify(path.join(__dirname, "test")),
      "process.env.TEST_KINTO_SERVER": JSON.stringify(
        process.env.TEST_KINTO_SERVER ? process.env.TEST_KINTO_SERVER : ""
      ),
      "process.env.SERVER": JSON.stringify(
        process.env.SERVER ? process.env.SERVER : ""
      ),
      "process.env.KINTO_PROXY_SERVER": JSON.stringify(
        process.env.SERVER ? process.env.SERVER : "http://localhost:8899"
      ),
      "http://0.0.0.0": "http://localhost",
    }),
    builtins(),
    commonjs(),
  ],
};

const bundles = process.env.BROWSER_TESTING
  ? [browserTestBuild]
  : [geckoBuild, browserBuild];

export default bundles;
