import builtins from "rollup-plugin-node-builtins";
import typescript from "rollup-plugin-typescript";
import resolve from "rollup-plugin-node-resolve";
import commonjs from "rollup-plugin-commonjs";
import { terser } from "rollup-plugin-terser";

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
  input: "./src/index.fx.js",
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
  input: "./src/index.js",
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

export default [geckoBuild, browserBuild];
