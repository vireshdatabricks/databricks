import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";
import displayLabelRules from "./eslint-rules/display-labels.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
    ],
  },
  {
    files: ["src/app/**/*.{ts,tsx}"],
    ignores: ["src/app/utils/theme.ts"],
    rules: {
      "no-restricted-syntax": ["error", {
        selector: "Literal[value=/^#[0-9a-fA-F]{3,8}$/]",
        message: "Use a colour token from utils/theme.ts instead of a hex literal.",
      }, {
        selector: "CallExpression[callee.property.name=/^toLocale(Date|Time)?String$/][callee.object.type='NewExpression'][callee.object.callee.name='Date']",
        message: "Use lib/format.ts for date display.",
      }, {
        // reference/48 S24 / D13: spacing uses the 4 px grid as half steps of the 8 px unit.
        selector: "JSXAttribute[name.name=/^(gap|spacing|rowGap|columnGap)$/] Literal[raw=/^(0?\.25|0?\.75|1\.25|1\.75|2\.25|2\.5|2\.75|3\.5)$/]",
        message: "Off-scale spacing. Use 0.5, 1, 1.5, 2, 3, 4, 5 or 6 (4–48 px), or ActionGroup for buttons.",
      }, {
        selector: "Property[key.name=/^(gap|rowGap|columnGap|p|px|py|pt|pb|pl|pr|m|mx|my|mt|mb|ml|mr)$/] > Literal[raw=/^(0?\.25|0?\.75|1\.25|1\.75|2\.25|2\.5|2\.75|3\.5)$/]",
        message: "Off-scale spacing. Use 0.5, 1, 1.5, 2, 3, 4, 5 or 6 (4–48 px).",
      }, {
        selector: "Property[key.name='borderRadius'] > Literal[raw=/^[0-9.]+$/]",
        message: "Numeric radius is multiplied by the theme. Use radius.field, radius.card or radius.pill from utils/theme.ts.",
      }],
    },
  },
  {
    files: ["src/app/**/*.{ts,tsx}"],
    ignores: ["src/app/lib/format.ts"],
    plugins: { local: displayLabelRules },
    rules: { "local/no-underscore-display": "warn" },
  },
  {
    files: ["src/app/**/*.{ts,tsx}"],
    ignores: ["src/app/components/ui/button/**"],
    rules: {
      "no-restricted-imports": ["error", {
        paths: [
          {
            name: "@mui/material/Button",
            message: "Use the shared component from components/ui/button.",
          },
          {
            name: "@mui/material",
            importNames: ["Button"],
            message: "Use the shared component from components/ui/button.",
          },
        ],
      }],
    },
  },
];

export default eslintConfig;
