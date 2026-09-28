export interface CalcuraPreviewTarget {
  appUrl: string;
  origin: string;
}

export function resolveCalcuraPreviewTarget(env: {
  VITE_CALCURA_APP_URL?: string;
  VITE_CALCURA_APP_ORIGIN?: string;
}): CalcuraPreviewTarget | null {
  const value =
    env.VITE_CALCURA_APP_URL?.trim() || env.VITE_CALCURA_APP_ORIGIN?.trim();
  if (!value) return null;

  try {
    const configured = new URL(value);
    if (
      (configured.protocol !== 'http:' && configured.protocol !== 'https:') ||
      configured.username ||
      configured.password ||
      configured.search ||
      configured.hash ||
      (configured.protocol !== 'https:' &&
        configured.hostname !== 'localhost' &&
        configured.hostname !== '127.0.0.1')
    ) {
      return null;
    }

    const appPath = configured.pathname.endsWith('/')
      ? configured.pathname
      : `${configured.pathname}/`;
    const preview = new URL(appPath, configured.origin);
    preview.searchParams.set('classroomProblemPreview', '1');
    return { appUrl: preview.toString(), origin: configured.origin };
  } catch {
    return null;
  }
}
