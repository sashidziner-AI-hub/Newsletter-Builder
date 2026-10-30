import { describe, expect, it } from 'vitest';
import {
  contrastRatio,
  hexToRgb,
  isLargeText,
  meetsAA,
  relativeLuminance,
  requiredRatio,
  rgbToHex,
  round2,
  suggestFix,
} from '../lib/contrast';

describe('hexToRgb', () => {
  it('reads six-digit and three-digit hex, with or without the hash', () => {
    expect(hexToRgb('#FFFFFF')).toEqual({ r: 255, g: 255, b: 255 });
    expect(hexToRgb('000000')).toEqual({ r: 0, g: 0, b: 0 });
    expect(hexToRgb('#f58220')).toEqual({ r: 245, g: 130, b: 32 });
    expect(hexToRgb('#fff')).toEqual({ r: 255, g: 255, b: 255 });
    expect(hexToRgb('#abc')).toEqual({ r: 170, g: 187, b: 204 });
  });

  it('returns null for anything it cannot read', () => {
    expect(hexToRgb('')).toBeNull();
    expect(hexToRgb('red')).toBeNull();
    expect(hexToRgb('#12345')).toBeNull();
    expect(hexToRgb('rgb(0,0,0)')).toBeNull();
    expect(hexToRgb('brand.primary')).toBeNull();
  });
});

describe('relativeLuminance', () => {
  it('matches the WCAG endpoints', () => {
    expect(relativeLuminance({ r: 255, g: 255, b: 255 })).toBeCloseTo(1, 5);
    expect(relativeLuminance({ r: 0, g: 0, b: 0 })).toBeCloseTo(0, 5);
  });
});

describe('contrastRatio', () => {
  it('gives 21:1 for black on white, both ways round', () => {
    expect(round2(contrastRatio('#000000', '#ffffff')!)).toBe(21);
    expect(round2(contrastRatio('#ffffff', '#000000')!)).toBe(21);
  });

  it('gives 1:1 for a colour against itself', () => {
    expect(round2(contrastRatio('#F58220', '#F58220')!)).toBe(1);
  });

  it('reproduces the published borderline pair', () => {
    // the classic worked example: one side of 4.5, then the other
    expect(round2(contrastRatio('#777777', '#ffffff')!)).toBeCloseTo(4.48, 2);
    expect(round2(contrastRatio('#767676', '#ffffff')!)).toBeCloseTo(4.54, 2);
  });

  it('returns null when either colour is unreadable', () => {
    expect(contrastRatio('brand.text', '#ffffff')).toBeNull();
    expect(contrastRatio('#ffffff', '')).toBeNull();
  });
});

describe('large text and the AA threshold', () => {
  it('counts 24px, or 18.66px when bold, as large', () => {
    expect(isLargeText(24, false)).toBe(true);
    expect(isLargeText(23.9, false)).toBe(false);
    expect(isLargeText(18.66, true)).toBe(true);
    expect(isLargeText(18.65, true)).toBe(false);
    // 18.66 only counts when it is actually bold
    expect(isLargeText(18.66, false)).toBe(false);
  });

  it('asks 3:1 of large text and 4.5:1 of the rest', () => {
    expect(requiredRatio(28, false)).toBe(3);
    expect(requiredRatio(20, true)).toBe(3);
    expect(requiredRatio(16, false)).toBe(4.5);
    expect(requiredRatio(16, true)).toBe(4.5);
  });

  it('passes and fails the borderline pair at normal size', () => {
    const fails = contrastRatio('#777777', '#ffffff')!;
    const passes = contrastRatio('#767676', '#ffffff')!;
    expect(meetsAA(fails, 16, false)).toBe(false);
    expect(meetsAA(passes, 16, false)).toBe(true);
  });

  it('lets the same failing pair through at large size', () => {
    // 4.48 clears the 3:1 bar that large text is held to
    const ratio = contrastRatio('#777777', '#ffffff')!;
    expect(meetsAA(ratio, 28, false)).toBe(true);
    expect(meetsAA(ratio, 20, true)).toBe(true);
  });
});

describe('suggestFix', () => {
  it('suggests a colour that actually passes', () => {
    const fix = suggestFix('#999999', '#ffffff', 16, false);
    expect(fix).not.toBeNull();
    expect(meetsAA(contrastRatio(fix!, '#ffffff')!, 16, false)).toBe(true);
  });

  it('goes lighter when the background is dark', () => {
    const fix = suggestFix('#444444', '#111111', 16, false);
    expect(fix).not.toBeNull();
    expect(meetsAA(contrastRatio(fix!, '#111111')!, 16, false)).toBe(true);
  });

  it('says nothing when a colour cannot be read', () => {
    expect(suggestFix('brand.text', '#ffffff', 16, false)).toBeNull();
  });
});

describe('rgbToHex', () => {
  it('round-trips and clamps', () => {
    expect(rgbToHex({ r: 245, g: 130, b: 32 })).toBe('#F58220');
    expect(rgbToHex({ r: -5, g: 300, b: 0 })).toBe('#00FF00');
  });
});
