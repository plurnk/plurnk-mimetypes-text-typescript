# @plurnk/plurnk-mimetypes-text-typescript

`text/typescript` AND `text/javascript` mimetype handler for the [plurnk](https://github.com/plurnk) ecosystem.

One ANTLR-backed parser serves both mimetypes — the TypeScript grammar is a superset that handles plain JavaScript as well. The framework constructs separate handler instances per registered mimetype; extraction policy is identical for both.

## install

```
npm i @plurnk/plurnk-mimetypes-text-typescript
```

plurnk-service auto-discovers this handler and routes `.ts/.tsx/.mts/.cts` to `text/typescript` and `.js/.mjs/.cjs/.jsx` to `text/javascript`.

## what it extracts

| Kind | Source |
|---|---|
| `function` | Top-level function and generator-function declarations (with params) |
| `class` | Class declarations + class expressions (top-level) |
| `method` | Constructors, methods, getter/setter accessors (inside classes) |
| `field` | Class field declarations |
| `interface` | TS interface declarations |
| `variable` | Module-scope `const`/`let`/`var` that is exported |

Imports, local variables inside function bodies, and unexported module-scope variables are excluded per [SPEC §3](https://github.com/plurnk/plurnk-mimetypes/blob/main/SPEC.md#3-mimesymbol-and-symbolkind).

## known grammar limitations

The vendored grammar (`antlr/grammars-v4/javascript/typescript`) doesn't disambiguate certain TypeScript-only constructs at the statement level:

- `type X = ...;` parses as a variable statement.
- `enum X { ... }` parses as an expression statement.

The visitor wiring is in place; fixing requires reordering alternatives in `TypeScriptParser.g4`. Tracked as a known limitation; PRs welcome upstream.

## development

```
npm install
npm run build     # antlr-ng → src/generated, then tsc → dist
npm test
```

Grammar source: `grammar/TypeScriptLexer.g4` + `grammar/TypeScriptParser.g4`. Vendored base classes in `src/generated/{TypeScriptLexerBase,TypeScriptParserBase}.ts` (committed; the rest of `src/generated/` is build output).

## license

MIT.
