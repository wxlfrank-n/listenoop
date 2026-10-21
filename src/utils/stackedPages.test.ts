import {describe, expect, it} from 'vitest';
import {isClipOnPage} from './stackedPages';

const page = {start: 20, end: 45};

describe('isClipOnPage', () => {
  it('is true when the clip is fully inside the page', () => {
    expect(isClipOnPage(page, 25, 35)).toBe(true);
  });

  it('is true when the clip starts before the page and runs into it', () => {
    expect(isClipOnPage(page, 10, 22)).toBe(true);
  });

  it('is true when the clip starts inside the page and runs past it', () => {
    expect(isClipOnPage(page, 40, 60)).toBe(true);
  });

  it('is true when the clip covers the page', () => {
    expect(isClipOnPage(page, 0, 120)).toBe(true);
  });

  it('is false when the clip ends before the page starts', () => {
    expect(isClipOnPage(page, 5, 19.999)).toBe(false);
  });

  it('is false when the clip starts after the page ends', () => {
    expect(isClipOnPage(page, 45.001, 60)).toBe(false);
  });

  it('is false when no page is on screen yet', () => {
    expect(isClipOnPage(undefined, 25, 35)).toBe(false);
  });
});
