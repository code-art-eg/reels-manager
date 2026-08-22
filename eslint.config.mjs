import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  {
    // Build output and vendored skill files are not ours to lint.
    ignores: [
      ".next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
      ".agents/**",
      ".claude/**",
      "supabase/**",
    ],
  },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    files: ["tailwind.config.ts", "postcss.config.mjs"],
    rules: {
      // Tailwind plugins are loaded with require() by convention.
      "@typescript-eslint/no-require-imports": "off",
    },
  },
];

export default eslintConfig;
