import next from "eslint-config-next";

/**
 * Flat config, using eslint-config-next's native flat export.
 *
 * This previously went through `FlatCompat`, which threw "Converting circular structure
 * to JSON" on every run — so linting silently never happened. eslint-config-next has
 * exported a flat config array since v15; the compat shim was both unnecessary and the
 * thing that was broken.
 */
const config = [
  ...next,
  {
    ignores: [".next/**", "node_modules/**", "prisma/generated/**", "public/**"],
  },
  {
    // Scoped to TypeScript. Without `files`, these rules apply to every linted file
    // including the plain `.mjs` build scripts, where the @typescript-eslint plugin is not
    // loaded — ESLint then aborts with "could not find plugin" before linting anything, so
    // `npm run lint` failed outright rather than reporting problems.
    files: ["**/*.ts", "**/*.tsx", "**/*.mts", "**/*.cts"],
    rules: {
      // Prisma payloads and JSON columns are genuinely dynamic in places.
      "@typescript-eslint/no-explicit-any": "off",
      // `_`-prefixed args are the codebase's convention for deliberately unused params.
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
    },
  },
];

export default config;
