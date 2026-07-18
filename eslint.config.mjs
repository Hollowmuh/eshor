import tseslint from "typescript-eslint";

/**
 * eshor root ESLint config.
 * Includes the money-lint rule (hardening §2.5): monetary values are kobo
 * integers; float-producing operations on money-named identifiers are
 * banned outside packages/kernel/src/money.ts.
 */

const MONEY_NAME = /(price|amount|fee|total|kobo|balance|subtotal|surcharge|credit)/i;

const eshorPlugin = {
  rules: {
    "no-float-money": {
      meta: {
        type: "problem",
        docs: {
          description:
            "Ban float-producing operations on money-named identifiers; use @eshor/kernel Money.",
        },
        messages: {
          division:
            "Division on money identifier '{{name}}' — floats forbidden on money. Use @eshor/kernel money helpers (percentBps etc.).",
          parseFloat:
            "parseFloat on money identifier '{{name}}' — money is kobo integers, parse with parseInt/kobo().",
          decimalLiteral:
            "Decimal literal in arithmetic with money identifier '{{name}}' — use integer bps math from @eshor/kernel.",
          toFixed:
            "toFixed on money identifier '{{name}}' — format at the edge with formatNaira().",
        },
        schema: [],
      },
      create(context) {
        const moneyName = (node) =>
          node && node.type === "Identifier" && MONEY_NAME.test(node.name)
            ? node.name
            : node && node.type === "MemberExpression"
              ? moneyName(node.property)
              : null;

        const isDecimalLiteral = (node) =>
          node &&
          node.type === "Literal" &&
          typeof node.value === "number" &&
          !Number.isInteger(node.value);

        const containsFloatSource = (node) => {
          if (!node) return false;
          if (isDecimalLiteral(node)) return true;
          if (
            node.type === "CallExpression" &&
            ((node.callee.type === "Identifier" && node.callee.name === "parseFloat") ||
              (node.callee.type === "MemberExpression" &&
                node.callee.property.type === "Identifier" &&
                node.callee.property.name === "parseFloat"))
          ) {
            return true;
          }
          if (node.type === "BinaryExpression") {
            return containsFloatSource(node.left) || containsFloatSource(node.right);
          }
          return false;
        };

        return {
          VariableDeclarator(node) {
            const name = moneyName(node.id);
            if (name && containsFloatSource(node.init)) {
              context.report({ node, messageId: "parseFloat", data: { name } });
            }
          },
          AssignmentExpression(node) {
            const name = moneyName(node.left);
            if (name && containsFloatSource(node.right)) {
              context.report({ node, messageId: "parseFloat", data: { name } });
            }
          },
          BinaryExpression(node) {
            const name = moneyName(node.left) ?? moneyName(node.right);
            if (!name) return;
            if (node.operator === "/") {
              context.report({ node, messageId: "division", data: { name } });
            } else if (
              ["*", "+", "-"].includes(node.operator) &&
              (isDecimalLiteral(node.left) || isDecimalLiteral(node.right))
            ) {
              context.report({ node, messageId: "decimalLiteral", data: { name } });
            }
          },
          CallExpression(node) {
            const callee = node.callee;
            const isParseFloat =
              (callee.type === "Identifier" && callee.name === "parseFloat") ||
              (callee.type === "MemberExpression" &&
                callee.property.type === "Identifier" &&
                callee.property.name === "parseFloat");
            if (isParseFloat) {
              const name = node.arguments.map((a) => moneyName(a)).find(Boolean);
              if (name) {
                context.report({ node, messageId: "parseFloat", data: { name } });
              }
              return;
            }
            if (
              callee.type === "MemberExpression" &&
              callee.property.type === "Identifier" &&
              callee.property.name === "toFixed"
            ) {
              const name = moneyName(callee.object);
              if (name) {
                context.report({ node, messageId: "toFixed", data: { name } });
              }
            }
          },
        };
      },
    },
  },
};

export default tseslint.config(
  {
    // apps/storefront has its own dedicated, already-authoritative
    // `next lint` config (registers eslint-plugin-react-hooks, ignores
    // `_`-prefixed unused vars) and uses Medusa's own major-unit decimal
    // money convention, not @eshor/kernel's kobo integers -- the
    // money-lint rule below does not apply there. Re-linting it here
    // with a different, less-configured ruleset produced only false
    // positives (confirmed 2026-07-18: every flagged file was
    // pre-existing, untouched Medusa-starter code doing ordinary decimal
    // division for unit-price display).
    ignores: [
      "**/node_modules/**",
      "**/.next/**",
      "**/dist/**",
      "**/.medusa/**",
      "apps/storefront/**",
    ],
  },
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  {
    // Plain Node/CommonJS scripts, not bundled TS -- require() is correct here.
    files: ["scripts/**/*.js"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
  {
    // Money-lint rule (hardening §2.5): monetary values are kobo
    // integers; float-producing operations on money-named identifiers
    // are banned in the kernel and the backend that consumes it. Scoped
    // here (not repo-wide) to match that intent -- see the ignores block
    // above for why apps/storefront is excluded.
    files: ["packages/kernel/**/*.ts", "apps/backend/**/*.ts"],
    plugins: { eshor: eshorPlugin },
    rules: {
      "eshor/no-float-money": "error",
    },
  },
  {
    // The one file allowed to do money math with raw numbers.
    files: ["packages/kernel/src/money.ts"],
    rules: {
      "eshor/no-float-money": "off",
    },
  },
);
