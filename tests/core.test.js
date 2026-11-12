import { describe, it, expect } from 'vitest';
import { computeRenderSize, DynamicResolution, QUALITY_PRESETS, RESOLUTIONS } from '../src/core/engine.js';

describe('render size', () => {
  it('maps 720p..2.5K targets to the canvas aspect', () => {
    expect(computeRenderSize(1920, 1080, 1, '720p', 1, 1)).toEqual([1280, 720]);
    expect(computeRenderSize(1920, 1080, 1, '1080p', 1, 1)).toEqual([1920, 1080]);
    expect(computeRenderSize(1920, 1080, 2, '2.5K', 1, 1)).toEqual([2560, 1440]);
    const [w, h] = computeRenderSize(2560, 1080, 1, '1080p', 1, 1); // ultrawide
    expect(h).toBe(1080); expect(w).toBe(2560);
  });
  it('native uses devicePixelRatio and scales', () => {
    expect(computeRenderSize(1000, 500, 2, 'native', 0.5, 1)).toEqual([1000, 500]);
    expect(computeRenderSize(1000, 500, 1, 'native', 1, 0.6)).toEqual([600, 300]);
  });
  it('has all presets and resolutions', () => {
    expect(Object.keys(QUALITY_PRESETS)).toEqual(['low', 'medium', 'high', 'ultra']);
    for (const k of ['720p', '1080p', '1440p', '2.5K', 'native']) expect(k in RESOLUTIONS).toBe(true);
  });
});

describe('dynamic resolution', () => {
  it('drops scale when frames are slow and recovers when fast', () => {
    const d = new DynamicResolution(60);
    for (let i = 0; i < 200; i++) d.sample(30);
    expect(d.scale).toBeLessThan(1); expect(d.scale).toBeGreaterThanOrEqual(d.min);
    const low = d.scale;
    for (let i = 0; i < 600; i++) d.sample(8);
    expect(d.scale).toBeGreaterThan(low); expect(d.scale).toBeLessThanOrEqual(1);
  });
  it('does nothing when disabled', () => {
    const d = new DynamicResolution(60); d.enabled = false;
    for (let i = 0; i < 200; i++) d.sample(50);
    expect(d.scale).toBe(1);
  });
});
