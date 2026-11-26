// The tour starts by itself once in a browser. That it was shown belongs to the browser, like
// the theme: a second browser of the same user only starts it on a workspace that is empty.

export const TOUR_KEY = 'drillgram.tour'

/** Whether the tour was begun or skipped in this browser. */
export function tourSeen(storage: Storage = window.localStorage): boolean {
  return storage.getItem(TOUR_KEY) !== null
}

export function markTourSeen(storage: Storage = window.localStorage): void {
  storage.setItem(TOUR_KEY, 'seen')
}
