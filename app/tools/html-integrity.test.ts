// @vitest-environment node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { SDK_SCRIPT_SRC, checkIndexHtml } from './html-integrity.js';

const indexHtml = readFileSync(fileURLToPath(new URL('../index.html', import.meta.url)), 'utf8');

describe('index.html integrity', () => {
  it('accepts the document that ships in this repository', () => {
    expect(checkIndexHtml(indexHtml)).toEqual([]);
  });

  it('requires the platform SDK script tag', () => {
    const violations = checkIndexHtml('<html><body></body></html>');
    expect(violations.map((violation) => violation.rule)).toContain(
      'the platform SDK script tag is required',
    );
  });

  it('rejects any other external script', () => {
    const html = `<script src="${SDK_SCRIPT_SRC}"></script><script src="https://cdn.example.com/x.js"></script>`;
    const violations = checkIndexHtml(html);
    expect(violations).toContainEqual({
      rule: 'only the platform SDK may be loaded externally',
      evidence: 'https://cdn.example.com/x.js',
    });
  });

  it('accepts a self-hosted bundled script alongside the SDK', () => {
    const html = `<script src="${SDK_SCRIPT_SRC}"></script><script type="module" src="./assets/main.js"></script>`;
    expect(checkIndexHtml(html)).toEqual([]);
  });

  it.each(['video', 'audio', 'iframe', 'object', 'embed'])('rejects a <%s> element', (element) => {
    const html = `<script src="${SDK_SCRIPT_SRC}"></script><${element} src="x"></${element}>`;
    const violations = checkIndexHtml(html);
    expect(violations.map((violation) => violation.rule)).toContain(`no <${element}> element`);
  });

  it('rejects a remote stylesheet', () => {
    const html = `<link rel="stylesheet" href="https://cdn.example.com/a.css"><script src="${SDK_SCRIPT_SRC}"></script>`;
    const violations = checkIndexHtml(html);
    expect(violations.map((violation) => violation.rule)).toContain(
      'stylesheets must be self-hosted',
    );
  });
});
