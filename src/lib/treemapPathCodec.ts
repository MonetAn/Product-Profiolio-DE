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

/** Путь клика D3-раскладки может начинаться с имени корня — для findTreeNodeByPath нужны только дочерние сегменты. */
export function normalizeTreemapFocusPath(
  root: { name: string; isRoot?: boolean },
  path: string[]
): string[] {
  if (path.length === 0) return path;
  if (path[0] === root.name) return path.slice(1);
  return path;
}
