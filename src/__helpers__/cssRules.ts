import postcss, { type AtRule, type Declaration, type Rule } from 'postcss'
// @ts-expect-error untyped node built-in
import { readFileSync } from 'node:fs'

// RFCTR-002: parse a CSS file once and expose its declarations as a flat list
// of { selector, prop, value, media } records so behavior tests can assert
// "there exists a rule for selector X with declaration prop:value" without
// caring about whitespace, declaration order, comments, or formatter shuffles.
// Vite's CSS pipeline is bypassed in vitest, so `getComputedStyle` won't see
// `src/index.css` — file-level AST parsing is the cleanest robust path.

export interface CssDecl {
  selector: string
  prop: string
  value: string
  media: string | null
}

function collectFromRule(rule: Rule, media: string | null, out: CssDecl[]): void {
  const selector = rule.selector
  rule.walkDecls((decl: Declaration) => {
    out.push({ selector, prop: decl.prop, value: decl.value, media })
  })
}

export function parseCssFile(path: string): CssDecl[] {
  const css = readFileSync(path, 'utf8') as string
  const root = postcss.parse(css)
  const out: CssDecl[] = []
  root.walkRules((rule: Rule) => {
    const mediaParent = rule.parent && rule.parent.type === 'atrule' ? (rule.parent as AtRule) : null
    const media = mediaParent && mediaParent.name === 'media' ? mediaParent.params : null
    collectFromRule(rule, media, out)
  })
  return out
}
