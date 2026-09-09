/** Public assets must stay beneath the GitHub Pages project path. */
export function assetUrl(path: string): string {
  return `${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}${path}`;
}
