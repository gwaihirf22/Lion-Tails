// @ts-check
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

/**
 * A deliberately narrow lint config: the Rules of Hooks, and nothing else.
 *
 * This exists because of a specific bug. Two useMemo calls were placed below
 * an `if (isLoading) return ...` guard, so React counted three hooks on the
 * first render and five on the next, threw, and the Heroes of Faith page
 * rendered as a blank screen. `npm run check` passed. `npm run build` passed.
 * The module served with a 200. Nothing could see it, because it is a rule
 * about the ORDER of calls at runtime, not about types.
 *
 * It is not a style config on purpose. Turning on a full recommended ruleset
 * across a codebase this size produces hundreds of findings nobody will read,
 * and a lint run nobody reads is worse than none -- the same reasoning as the
 * CSS and colour gates in CI. These two rules catch a class of bug that is
 * invisible to every other check in the project.
 */
export default tseslint.config(
  { ignores: ["dist/**", "node_modules/**", "migrations/**", "*.config.*"] },
  {
    files: ["client/src/**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      // A warning, not an error: several existing effects intentionally omit
      // dependencies, and turning this to error would bury the rule above.
      "react-hooks/exhaustive-deps": "warn",
    },
  },
);
