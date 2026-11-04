import { PATTERNS, TH } from './th'

/** Runtime EN→TH translator: swaps text/attributes in the DOM, remembers originals, follows new renders. */
const ATTRS = ['placeholder', 'title', 'aria-label', 'alt'] as const
const SKIP = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'CODE', 'NOSCRIPT'])
const EN_M = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const TH_M = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']
const MONTH_RE = new RegExp(`\\b(\\d{1,2}) (${EN_M.join('|')})\\b`, 'g')

const textState = new WeakMap<Text, { orig: string; applied: string }>()
const attrState = new WeakMap<Element, Record<string, { orig: string; applied: string }>>()
let active = false
let observer: MutationObserver | null = null
const cache = new Map<string, string>()

export function translate(input: string): string {
  const core = input.trim()
  if (!core || !/[A-Za-z]/.test(core)) return input
  const lead = input.slice(0, input.indexOf(core))
  const tail = input.slice(lead.length + core.length)
  const key = core.replace(/\s+/g, ' ') // JSX line breaks and double spaces must not break matching
  let out = cache.get(key)
  if (out === undefined) {
    out = TH[key]
    if (out === undefined) {
      for (const [re, fn] of PATTERNS) {
        const m = key.match(re)
        if (m) { out = fn(m, translate); break }
      }
    }
    if (out === undefined) out = key.replace(MONTH_RE, (_, d, mo) => `${d} ${TH_M[EN_M.indexOf(mo)]}`)
    cache.set(key, out)
  }
  return lead + out + tail
}

const skipped = (el: Element | null) => !!el && (SKIP.has(el.tagName) || !!el.closest('[data-no-i18n]'))

function syncText(el: Element) {
  const nodes: Text[] = []
  el.childNodes.forEach((n) => { if (n.nodeType === 3) nodes.push(n as Text) })
  if (!nodes.length) return
  const origs = nodes.map((n) => {
    const st = textState.get(n)
    return st && n.nodeValue === st.applied ? st.orig : n.nodeValue ?? ''
  })
  const set = (n: Text, i: number, v: string) => { n.nodeValue = v; textState.set(n, { orig: origs[i], applied: v }) }
  if (!active) { nodes.forEach((n, i) => set(n, i, origs[i])); return }
  const whole = origs.join('')
  const tr = translate(whole)
  if (nodes.length > 1 && tr !== whole) { nodes.forEach((n, i) => set(n, i, i === 0 ? tr : '')); return }
  nodes.forEach((n, i) => set(n, i, translate(origs[i])))
}

function syncAttrs(el: Element) {
  const st = attrState.get(el) ?? {}
  for (const a of ATTRS) {
    const cur = el.getAttribute(a)
    if (cur === null) continue
    const prev = st[a]
    const orig = prev && cur === prev.applied ? prev.orig : cur
    const next = active ? translate(orig) : orig
    if (next !== cur) el.setAttribute(a, next)
    st[a] = { orig, applied: next }
  }
  attrState.set(el, st)
}

function walk(root: Node) {
  if (root.nodeType === 3) { const p = (root as Text).parentElement; if (p && !skipped(p)) syncText(p); return }
  if (root.nodeType !== 1) return
  const el = root as Element
  if (skipped(el)) return
  syncText(el); syncAttrs(el)
  el.querySelectorAll('*').forEach((c) => { if (!skipped(c)) { syncText(c); syncAttrs(c) } })
}

const observe = () => observer?.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: [...ATTRS] })
function run(fn: () => void) { observer?.disconnect(); try { fn() } finally { observe() } }

const TITLE = typeof document !== 'undefined' ? document.title : ''
export function setThai(on: boolean) {
  active = on
  if (!observer) {
    observer = new MutationObserver((records) => run(() => {
      const seen = new Set<Node>()
      for (const r of records) {
        if (r.type === 'childList') {
          r.addedNodes.forEach((n) => { if (!seen.has(n)) { seen.add(n); walk(n) } })
          const t = r.target
          if (t.nodeType === 1 && !seen.has(t) && !skipped(t as Element)) { seen.add(t); syncText(t as Element) }
        } else if (r.type === 'characterData') {
          const p = (r.target as Text).parentElement
          if (p && !seen.has(p) && !skipped(p)) { seen.add(p); syncText(p) }
        } else if (r.target.nodeType === 1 && !skipped(r.target as Element)) syncAttrs(r.target as Element)
      }
    }))
  }
  run(() => walk(document.body))
  document.title = on ? translate(TITLE) : TITLE
}
