import { describe, expect, it } from 'vitest';
import { brandDisplayName, brandSubtitle, DEFAULT_BRAND_NAME } from './branding';

describe('branding', () => {
  it('usa o nome salvo mesmo quando o par é Sonder + Clinic', () => {
    expect(brandDisplayName({ name: 'Sonder', subtitle: 'Clinic', source: 'tenant' })).toBe('Sonder');
    expect(brandSubtitle({ name: 'Sonder', subtitle: 'Clinic', source: 'tenant' })).toBe('Clinic');
  });

  it('cai no fallback só quando o nome está vazio', () => {
    expect(brandDisplayName(null)).toBe(DEFAULT_BRAND_NAME);
    expect(brandDisplayName({ subtitle: 'Clinic' })).toBe(DEFAULT_BRAND_NAME);
  });
});
