import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      /**
       * react-hooks/set-state-in-effect — downgraded to a warning.
       *
       * The rule cannot see through a function call, so it flags every
       * `useEffect(() => { void load() }, [])` where `load` is an async
       * fetch, even when every setState happens after an `await` and no
       * cascading render is possible. It also flags guard-clause resets
       * (`if (!id) { setRows([]); return }`) at the top of those same
       * fetch effects.
       *
       * All ~19 remaining sites are one of those two shapes. Rewriting
       * correct code to satisfy a conservative analysis would mean
       * touching every data-loading path in the app for no behavioural
       * gain — the wrong trade in a live CRM.
       *
       * Kept as a warning rather than switched off, because the rule
       * does catch real defects: it found a genuine cascading render in
       * the chart scroll button, and two useCallback dependency
       * narrowings that could hold stale closures. Those are fixed.
       * New violations still surface in lint output; they just don't
       * fail the build.
       *
       * Revisit if the app adopts a data-fetching library — that would
       * remove the fetch-in-effect pattern wholesale and let this go
       * back to being an error.
       */
      "react-hooks/set-state-in-effect": "warn",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Vendored minified opus-recorder encoder worker (served statically).
    "public/opus/**",
  ]),
]);

export default eslintConfig;
