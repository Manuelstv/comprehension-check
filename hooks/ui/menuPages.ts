// Paging for the mod's menus. A dialog holds at most QUESTION_LIMITS.perDialog
// options, so a longer list comes in pages: the items, then one row to move
// on ("More …"), the last page's row going back to the first. Pure.

import { QUESTION_LIMITS } from '../config'

export type PageRows = { more: string; back: string }

// The items on each page: all of them when they fit one dialog, else pages
// of `perDialog - 1`, leaving a row to move between pages.
export const menuPages = <T>(items: readonly T[], perDialog: number = QUESTION_LIMITS.perDialog): T[][] => {
  if (items.length <= perDialog) return [[...items]]
  const pages: T[][] = []
  for (let at = 0; at < items.length; at += perDialog - 1) pages.push(items.slice(at, at + perDialog - 1))
  return pages
}

// The row that moves on from `page`: none on a single page, `back` on the
// last, `more` before it.
export const pageRow = (page: number, pageCount: number, rows: PageRows): string | undefined => {
  if (pageCount <= 1) return undefined
  return page === pageCount - 1 ? rows.back : rows.more
}
