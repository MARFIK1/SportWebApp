import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
    ...nextVitals,
    ...nextTs,
    globalIgnores([
        ".data/**",
        ".next/**",
        ".vercel/**",
        ".vercel-deploy-staging/**",
        "SofascoreData/**",
        "coverage/**",
        "next-env.d.ts",
        "node_modules/**",
        "out/**",
    ]),
]);
