import { defineConfig } from "eslint/config";
import typescriptEslintEslintPlugin from "@typescript-eslint/eslint-plugin";
import globals from "globals";
import tsParser from "@typescript-eslint/parser";
import path from "node:path";
import { fileURLToPath } from "node:url";
import js from "@eslint/js";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const compat = new FlatCompat({
  baseDirectory: __dirname,
  recommendedConfig: js.configs.recommended,
  allConfig: js.configs.all,
});

export default defineConfig([
  {
    extends: compat.extends("prettier"),

    plugins: {
      "@typescript-eslint": typescriptEslintEslintPlugin,
    },

    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },

      parser: tsParser,
      ecmaVersion: 2018,
      sourceType: "module",
    },

    rules: {
      "comma-dangle": 0,
      curly: 2,
      "linebreak-style": [2, "unix"],
      "no-console": 0,
      "no-unused-vars": "off",

      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          vars: "all",
          args: "none",
          caughtErrorsIgnorePattern: "(e|err)",
          ignoreRestSiblings: false,
        },
      ],

      "prefer-const": "off",
      "no-var": "off",
      semi: [2, "always"],
      "no-else-return": "error",
      "object-shorthand": ["error", "always"],
      "dot-notation": "error",
      "consistent-return": "error",
    },
  },
]);
