import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { markdownSection } from './markdown-section.js';
import { repoRoot } from './paths.js';

/**
 * QA-011 / C-12 / X-04 / X-05 writeback. Reverting the test plan to "P2, 不阻断"
 * or restoring native APK/ANR budgets must fail here. Wiring axe-core is QA-010
 * and is not this slice.
 */

const testPlan = readFileSync(join(repoRoot, 'docs/14-test-plan.md'), 'utf8');
const qualityGates = readFileSync(join(repoRoot, 'docs/14-quality-gates.md'), 'utf8');

describe('QA-011 a11y adjudication (C-12 / X-12)', () => {
  const section = markdownSection(testPlan, '### 6.4 可用性与无障碍(上架阻断)');

  it('is present as a release blocker rather than a P2 observation', () => {
    expect(section).not.toBe('');
    expect(testPlan).not.toMatch(/### 6\.4 可用性与无障碍\(P2,不阻断首个上架版本\)/);
    expect(section).not.toMatch(/不阻断首个上架版本/);
    expect(section).toMatch(/definition-of-done\.md/);
    expect(section).toMatch(/上架阻断/);
  });

  it('does not treat wiring axe-core as this writeback', () => {
    expect(section).toMatch(/QA-010/);
    expect(section).toMatch(/不把 axe-core job 当作本裁决的落地/);
  });
});

describe('QA-011 compatibility matrix (X-04)', () => {
  const section = markdownSection(testPlan, '### 6.2 兼容性矩阵(上架级,TikTok WebView)');

  it('names TikTok WebView as the host and drops WeChat as a matrix row', () => {
    expect(section).not.toBe('');
    expect(testPlan).not.toMatch(/### 6\.2 兼容性矩阵\(上架级,云真机\)/);
    expect(section).toMatch(/WKWebView/);
    expect(section).toMatch(/Chromium WebView/);
    expect(section).not.toMatch(/\*\*H5\*\*:微信内置 WebView/);
  });
});

describe('QA-011 Minis budgets (X-05)', () => {
  const section = markdownSection(qualityGates, '### 5.4 性能与体积预算(Minis 形态;允许收紧、放宽须豁免)');

  it('replaces native APK/iOS rows with ZIP and first-screen JS', () => {
    expect(section).not.toBe('');
    expect(section).toMatch(/ZIP 包体积/);
    expect(section).toMatch(/首屏 JS\(gzip\)/);
    expect(section).not.toMatch(/安卓包体积\(APK\/AAB 下载大小\)/);
    expect(section).not.toMatch(/iOS 包体积\(App Store 下载大小\)/);
  });

  it('rewrites G3.8 to the Minis JS-error / blank-screen bar', () => {
    expect(qualityGates).toMatch(/G3\.8 稳定性准入/);
    expect(qualityGates).toMatch(/JS 错误率 < 0\.5% 会话/);
    expect(qualityGates).not.toMatch(/G3\.8 崩溃率准入/);
    expect(qualityGates).not.toMatch(/灰度阶段崩溃率 < 0\.3%、ANR 率 < 0\.3%/);
  });
});
