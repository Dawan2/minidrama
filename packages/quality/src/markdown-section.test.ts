import { describe, expect, it } from 'vitest';

import { markdownSection } from './markdown-section.js';

describe('markdownSection', () => {
  it('returns empty when the heading is absent', () => {
    expect(markdownSection('# Title\n\nbody\n', '### 6.4 missing')).toBe('');
  });

  it('stops at the next heading of the same or higher level', () => {
    const markdown = [
      '## 6. 专项测试',
      '',
      '### 6.2 matrix',
      'tiktok',
      '',
      '### 6.3 security',
      'sast',
      '',
      '### 6.4 a11y',
      'blocker',
    ].join('\n');

    expect(markdownSection(markdown, '### 6.2 matrix')).toBe('### 6.2 matrix\ntiktok\n');
    expect(markdownSection(markdown, '### 6.4 a11y')).toBe('### 6.4 a11y\nblocker');
  });

  it('does not stop at a deeper heading', () => {
    const markdown = ['## 5. L3', '### 5.4 budgets', '#### note', 'zip', '## 6. 豁免'].join('\n');
    expect(markdownSection(markdown, '### 5.4 budgets')).toBe('### 5.4 budgets\n#### note\nzip');
  });
});
