import { describe, expect, it } from 'vitest';
import { resolveCalcuraPreviewTarget } from '../../src/features/assignments/calcuraPreviewTarget';

describe('Calcura teacher-preview URL configuration', () => {
  it('keeps the local root-app origin working', () => {
    expect(
      resolveCalcuraPreviewTarget({
        VITE_CALCURA_APP_ORIGIN: 'http://127.0.0.1:5173',
      }),
    ).toEqual({
      appUrl: 'http://127.0.0.1:5173/?classroomProblemPreview=1',
      origin: 'http://127.0.0.1:5173',
    });
  });

  it('supports the public Calcura app mounted under /app without changing message origin', () => {
    expect(
      resolveCalcuraPreviewTarget({
        VITE_CALCURA_APP_URL: 'https://calcura.study/app/',
      }),
    ).toEqual({
      appUrl: 'https://calcura.study/app/?classroomProblemPreview=1',
      origin: 'https://calcura.study',
    });
  });

  it('prefers the explicit app URL over the legacy origin setting', () => {
    expect(
      resolveCalcuraPreviewTarget({
        VITE_CALCURA_APP_URL: 'https://calcura.study/app/',
        VITE_CALCURA_APP_ORIGIN: 'http://127.0.0.1:5173',
      })?.appUrl,
    ).toBe('https://calcura.study/app/?classroomProblemPreview=1');
  });

  it.each([
    'http://calcura.study/app/',
    'https://user:pass@calcura.study/app/',
    'https://calcura.study/app/?redirect=https://attacker.example',
    'https://calcura.study/app/#preview',
    'javascript:alert(1)',
  ])('rejects unsafe app URL configuration: %s', (value) => {
    expect(resolveCalcuraPreviewTarget({ VITE_CALCURA_APP_URL: value })).toBe(
      null,
    );
  });
});
