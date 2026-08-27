// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { isScannableBundleFile, scanBundleText } from './bundle-scan.js';

describe('bundle scan', () => {
  it('passes a clean chunk', () => {
    expect(scanBundleText('assets/main.js', 'const a=1;export{a};')).toEqual([]);
  });

  it.each([
    ['eval', 'const x = eval("1+1");', 'no eval'],
    ['Function constructor', 'const f = new Function("return 1");', 'no Function constructor'],
    ['string setTimeout', 'setTimeout("doThing()", 10);', 'no string-form setTimeout/setInterval'],
    ['iframe', "document.createElement('iframe')", 'no iframe element'],
    ['native video', "document.createElement('video')", 'no native video element'],
    ['third-party player', 'import "hls.js";', 'no third-party media player'],
    ['remote script', 's.src = "https://cdn.example.com/a.js"', 'no remote script injection'],
  ])('flags %s', (_label, source, rule) => {
    const violations = scanBundleText('assets/main.js', source);
    expect(violations.map((violation) => violation.rule)).toContain(rule);
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
