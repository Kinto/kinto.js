import path from "path";
import builtins from "rollup-plugin-node-builtins";
import nodePolyfills from "rollup-plugin-node-polyfills";
import typescript from "@rollup/plugin-typescript";
import resolve from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import { terser } from "rollup-plugin-terser";
import multi from "@rollup/plugin-multi-entry";
import replace from "@rollup/plugin-replace";

const browserBuild = {
  input: "./src/index.ts",
  output: [
    {
      file: "dist/kinto.min.js",
      format: "umd",
      name: "Kinto",
      sourcemap: true,
      plugins: [terser()],
    },
    {
      file: "dist/kinto.js",
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
      target: "es2017",
      include: ["*.ts+(|x)", "**/*.ts+(|x)", "*.js", "**/*.js"],
    }),
    builtins(),
    commonjs(),
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
    commonjs(),
    nodePolyfills(),
    resolve({
      mainFields: ["browser", "module", "main"],
      preferBuiltins: true,
    }),
    typescript({
      tsconfig: "./test/tsconfig.json",
      module: "esnext",
    }),
    replace({
      preventAssignment: true,
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
  ],
};

const bundles = process.env.BROWSER_TESTING
  ? [browserTestBuild]
  : [browserBuild];

export default bundles;
