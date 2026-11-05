// What an edit tool call changed: its file and how many lines.

import { EDIT_TOOLS } from '../config'
import { countLines } from '../lib/text'
import { asRecord } from '../lib/values'

export const isEditTool = (tool: string) => EDIT_TOOLS.has(tool)

export const editedPath = (input: unknown): string | undefined => {
  const rec = asRecord(input)
  const path = rec?.file_path ?? rec?.notebook_path
  return typeof path === 'string' ? path : undefined
}

// Lines an edit changed, as a diff counts them: removed plus added. A Write
// counts every line it wrote.
export const linesChangedBy = (input: unknown): number => {
  const rec = asRecord(input)
  switch (rec?.tool) {
    case 'Edit':
      return countLines(rec.old_string) + countLines(rec.new_string)
    case 'Write':
      return countLines(rec.content)
    case 'NotebookEdit':
      return countLines(rec.new_source)
    default:
      return 0
  }
}
