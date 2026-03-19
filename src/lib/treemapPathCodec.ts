/**
 * Treemap node paths are joined with "/". Names may contain "/" (e.g. "упрощения/ускорения"),
 * so each segment is URI-encoded at join time and decoded when splitting.
 */

export function encodeTreemapPathSegment(segment: string): string {
  return encodeURIComponent(segment);
}

/** Split an encoded treemap path back into original node name segments. */
export function splitTreemapEncodedPath(path: string): string[] {
  if (!path) return [];
  return path.split('/').map((seg) => {
    try {
      return decodeURIComponent(seg);
    } catch {
      return seg;
    }
  });
}
