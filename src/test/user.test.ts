import { beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_DISPLAY_NAME,
  DISPLAY_NAME_MAX,
  PROFILE_STORAGE_KEY,
  getCurrentUser,
  setDisplayName,
  shouldShowNameHint,
} from '../lib/user';

beforeEach(() => localStorage.clear());

describe('getCurrentUser / setDisplayName', () => {
  it('defaults to "Guest" before anything is set', () => {
    expect(getCurrentUser().name).toBe(DEFAULT_DISPLAY_NAME);
  });

  it('persists a set name across reads', () => {
    setDisplayName('Priya Raman');
    expect(getCurrentUser().name).toBe('Priya Raman');
  });

  it('trims whitespace', () => {
    setDisplayName('  Priya  ');
    expect(getCurrentUser().name).toBe('Priya');
  });

  it('caps at DISPLAY_NAME_MAX characters', () => {
    setDisplayName('x'.repeat(DISPLAY_NAME_MAX + 20));
    expect(getCurrentUser().name).toHaveLength(DISPLAY_NAME_MAX);
  });

  it('resets to the default on an empty/whitespace-only name', () => {
    setDisplayName('Priya');
    setDisplayName('   ');
    expect(getCurrentUser().name).toBe(DEFAULT_DISPLAY_NAME);
  });

  it('tolerates corrupt storage rather than throwing', () => {
    localStorage.setItem(PROFILE_STORAGE_KEY, 'not json');
    expect(getCurrentUser().name).toBe(DEFAULT_DISPLAY_NAME);
  });

  it('stores no HTML — the value is read back as plain text', () => {
    setDisplayName('<b>Priya</b>');
    expect(getCurrentUser().name).toBe('<b>Priya</b>'); // stored literally; rendering as text is the UI's job
  });
});

describe('shouldShowNameHint', () => {
  it('is true exactly once while the name is still the default', () => {
    expect(shouldShowNameHint()).toBe(true);
    expect(shouldShowNameHint()).toBe(false);
  });

  it('is false once a real name has been set', () => {
    setDisplayName('Priya');
    expect(shouldShowNameHint()).toBe(false);
  });

  it('stays false after being shown once, even if the name reverts to the default', () => {
    expect(shouldShowNameHint()).toBe(true);
    setDisplayName('Priya');
    setDisplayName(''); // back to Guest
    expect(shouldShowNameHint()).toBe(false);
  });
});
