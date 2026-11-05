// Small string and path helpers.

export const countLines = (text: unknown): number =>
  typeof text === 'string' && text !== '' ? text.split('\n').length : 0

export const lastNonEmptyLine = (text: string): string | undefined =>
  text
    .split('\n')
    .map(line => line.trim())
    .filter(line => line !== '')
    .pop()

export const baseName = (path: string): string => path.split('/').pop() ?? path

export const dirName = (path: string): string => path.slice(0, path.lastIndexOf('/')) || '/'

export const plural = (count: number, one: string, many = `${one}s`): string => (count === 1 ? one : many)

// A stable pick from a pool: the same seed always gets the same item, so a
// redraw never swaps a line under the reader.
export const pickStable = <T>(pool: readonly T[], seed: string): T => {
  let hash = 0
  for (const ch of seed) hash = (hash * 31 + ch.charCodeAt(0)) | 0
  return pool[Math.abs(hash) % pool.length] as T
}
