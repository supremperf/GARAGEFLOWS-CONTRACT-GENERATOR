import { describe, expect, it, vi } from 'vitest';
import { resolveOcrWorkerPath } from '../core/ocr/ocr-engine';

describe('OCR worker logical module resolution', () => {
  it.each([
    '/opt/GarageFlows/resources/app.asar/dist-electron/core/ocr/tesseract-worker.js',
    String.raw`C:\Application GarageFlows\resources\app.asar\dist-electron\core\ocr\tesseract-worker.js`,
    '/development/dist-electron/core/ocr/tesseract-worker.js',
  ])('preserves the resolver entry point and its dependency parents: %s', entry => {
    const resolve = vi.fn(() => entry);
    expect(resolveOcrWorkerPath(resolve)).toBe(entry);
    expect(resolve).toHaveBeenCalledExactlyOnceWith('./tesseract-worker');
  });
});
