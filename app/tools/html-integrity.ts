/**
 * `index.html` integrity.
 *
 * The document is the highest-leverage file in the package: it is where a forbidden external
 * script or a native media element would enter, and it is read closely by the platform code
 * scanner. Script and CSS sources must come from self, with the platform SDK as the single
 * sanctioned exception (`docs/architecture/system-overview.md` §3.2).
 */

export const SDK_SCRIPT_SRC = 'https://connect.tiktok-minis.com/drama/sdk.js';

export interface HtmlViolation {
  readonly rule: string;
  readonly evidence: string;
}

const FORBIDDEN_ELEMENTS = ['video', 'audio', 'iframe', 'object', 'embed'] as const;

export function checkIndexHtml(html: string): readonly HtmlViolation[] {
  const violations: HtmlViolation[] = [];

  for (const element of FORBIDDEN_ELEMENTS) {
    const pattern = new RegExp(`<${element}[\\s>]`, 'i');
    if (pattern.test(html)) {
      violations.push({ rule: `no <${element}> element`, evidence: `<${element}> found` });
    }
  }

  const externalScripts = [...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["']/gi)]
    .map((match) => match[1] ?? '')
    .filter((src) => /^(?:https?:)?\/\//.test(src));

  for (const src of externalScripts) {
    if (src !== SDK_SCRIPT_SRC) {
      violations.push({ rule: 'only the platform SDK may be loaded externally', evidence: src });
    }
  }

  if (!externalScripts.includes(SDK_SCRIPT_SRC)) {
    violations.push({
      rule: 'the platform SDK script tag is required',
      evidence: `missing ${SDK_SCRIPT_SRC}`,
    });
  }

  const externalStyles = [...html.matchAll(/<link\b[^>]*\bhref=["']([^"']+)["'][^>]*>/gi)]
    .filter((match) => /rel=["']?stylesheet/i.test(match[0]))
    .map((match) => match[1] ?? '')
    .filter((href) => /^(?:https?:)?\/\//.test(href));

  for (const href of externalStyles) {
    violations.push({ rule: 'stylesheets must be self-hosted', evidence: href });
  }

  return violations;
}
