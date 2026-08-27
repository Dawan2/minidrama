// @vitest-environment node
import { transformWithEsbuild } from 'vite';
import { describe, expect, it } from 'vitest';

import { BANNED_ELEMENTS, isScannableBundleFile, scanBundleText } from './bundle-scan.js';

function rulesFor(source: string): readonly string[] {
  return scanBundleText('assets/main.js', source).map((violation) => violation.rule);
}

describe('bundle scan', () => {
  it('passes a clean chunk', () => {
    expect(scanBundleText('assets/main.js', 'const a=1;export{a};')).toEqual([]);
  });

  it.each([
    ['eval', 'const x = eval("1+1");', 'no eval'],
    ['Function constructor', 'const f = new Function("return 1");', 'no Function constructor'],
    ['string setTimeout', 'setTimeout("doThing()", 10);', 'no string-form setTimeout/setInterval'],
    ['iframe', "document.createElement('iframe')", 'no <iframe> element'],
    ['native video', "document.createElement('video')", 'no <video> element'],
    ['third-party player', 'import "hls.js";', 'no third-party media player'],
    ['remote script', 's.src = "https://cdn.example.com/a.js"', 'no remote script injection'],
  ])('flags %s', (_label, source, rule) => {
    expect(rulesFor(source)).toContain(rule);
  });

  it('reports enough context to locate the violation', () => {
    const [violation] = scanBundleText('assets/main.js', 'let q = 1; const x = eval("1+1");');
    expect(violation?.file).toBe('assets/main.js');
    expect(violation?.evidence).toContain('eval');
  });

  it('scans emitted artifacts but not source maps', () => {
    expect(isScannableBundleFile('assets/main-abc.js')).toBe(true);
    expect(isScannableBundleFile('index.html')).toBe(true);
    expect(isScannableBundleFile('assets/main-abc.css')).toBe(true);
    // A source map contains the original text of everything, so scanning it is all false positives.
    expect(isScannableBundleFile('assets/main-abc.js.map')).toBe(false);
    expect(isScannableBundleFile('assets/poster.png')).toBe(false);
  });
});

/**
 * The hole this file exists to keep closed.
 *
 * The scan matched `createElement('video')` and nothing else, which is the shape React stopped
 * emitting when the app moved to the automatic JSX runtime. Every one of these strings is a
 * `<video>` on its way to a viewer's screen, and every one of them used to pass.
 */
describe('the JSX runtime', () => {
  it.each([
    ['the automatic runtime', 'jsx("video", { src: "x" })'],
    ['the multi-child form', 'jsxs("video", { children: [a, b] })'],
    ["Babel's alias", '_jsx("video", { src: "x" })'],
    ["Babel's multi-child alias", '_jsxs("video", { children: [a, b] })'],
    ['the development runtime', 'jsxDEV("video", {}, void 0, false, undefined, this)'],
    ["Babel's development alias", '_jsxDEV("video", {}, void 0, false)'],
    // What `pnpm build` emits today: the runtime arrives as a CommonJS namespace object, so the
    // call keeps a readable property name even though everything around it is minified.
    ['a namespace call', 'N.jsx("video",{className:"player"})'],
    ['spread props', 'jsx("video", { ...rest })'],
    ['no props at all', 'jsx("video", {})'],
  ])('flags %s', (_label, source) => {
    expect(rulesFor(source)).toContain('no <video> element');
  });

  /**
   * Minification renames the imported factory (`import { jsx as o }`), so by the time the chunk
   * is written there is no `jsx` left to grep for. The argument list is the part esbuild cannot
   * rewrite: a quoted element name followed by a props argument is an element being constructed,
   * whatever the callee ended up being called.
   */
  it.each([
    ['a mangled factory', 'o("video",{src:c})'],
    ['a two-character factory', 'Ne("video",{children:t})'],
    ['a null props argument', 'e("video",null)'],
    ['an undefined props argument', 'e("video",void 0)'],
  ])('flags %s', (_label, source) => {
    expect(rulesFor(source)).toContain('no <video> element');
  });

  it.each(BANNED_ELEMENTS)('covers <%s> in every call shape', (element) => {
    expect(rulesFor(`document.createElement("${element}")`)).toContain(`no <${element}> element`);
    expect(rulesFor(`jsx("${element}", { id: "x" })`)).toContain(`no <${element}> element`);
    expect(rulesFor(`o("${element}",{id:"x"})`)).toContain(`no <${element}> element`);
  });

  it.each([
    ['an ordinary element', 'jsx("div", { className: "feed" })'],
    ['a minified ordinary element', 'o("span",{children:t})'],
    ['a typeof check', 'if (typeof value === "object") return null;'],
    ['a discriminated union tag', 'const asset = { kind: "video", url: u };'],
    ['a lookup table', 'const posters = { video: p, audio: q };'],
    ['an element name inside a longer word', 'jsx("video-card", { id: "x" })'],
  ])('leaves %s alone', (_label, source) => {
    expect(rulesFor(source)).toEqual([]);
  });
});

/**
 * The patterns above are hand-written guesses at what a compiler emits, and the rule they replaced
 * was a hand-written guess that turned out to be wrong. So the last word goes to the compiler:
 * these cases run the real toolchain over real JSX and scan what comes out.
 */
describe('against the real toolchain', () => {
  async function compile(source: string, minify: boolean): Promise<string> {
    const { code } = await transformWithEsbuild(source, 'probe.tsx', {
      jsx: 'automatic',
      target: 'es2020',
      minify,
    });
    return code;
  }

  it.each([false, true])('flags a compiled <video> component (minified: %s)', async (minify) => {
    const code = await compile(
      'export const Clip = () => <video src="x" playsInline />;\n',
      minify,
    );
    expect(rulesFor(code)).toContain('no <video> element');
  });

  it.each([false, true])('flags a compiled <iframe> component (minified: %s)', async (minify) => {
    const code = await compile('export const Frame = () => <iframe title="t" />;\n', minify);
    expect(rulesFor(code)).toContain('no <iframe> element');
  });

  it.each([false, true])('flags a compiled <video> with spread props (minified: %s)', async (m) => {
    const code = await compile('export const Clip = (p) => <video {...p} />;\n', m);
    expect(rulesFor(code)).toContain('no <video> element');
  });

  it.each([false, true])('leaves a compiled ordinary component alone (minified: %s)', async (m) => {
    const code = await compile(
      'export const Card = (p) => <div className="card"><span>{p.title}</span></div>;\n',
      m,
    );
    expect(rulesFor(code)).toEqual([]);
  });
});
