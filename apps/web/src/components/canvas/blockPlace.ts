import type { Point } from '@drillgram/model'
import type { Box } from './geometry'

/** Whether two boxes neither overlap nor come closer than `gap`. */
function apart(a: Box, b: Box, gap: number): boolean {
  return a.x >= b.x + b.width + gap || a.x + a.width + gap <= b.x || a.y >= b.y + b.height + gap || a.y + a.height + gap <= b.y
}

/**
 * How far to move a group of cards, all by the same amount, so that each keeps `gap` to every
 * other card: nothing where the group is free already, else a near free place in steps of
 * `grid`. The search goes outwards ring by ring and takes the nearest place of the first ring
 * that has one; `undefined` when `reach` rings have none.
 */
export function placeBlock(block: readonly Box[], others: readonly Box[], gap: number, grid: number, reach = 200): Point | undefined {
  const free = (by: Point) =>
    block.every((card) => others.every((other) => apart({ ...card, x: card.x + by.x, y: card.y + by.y }, other, gap)))
  for (let ring = 0; ring <= reach; ring++) {
    const steps: Point[] = []
    for (let i = -ring; i <= ring; i++) {
      steps.push({ x: i, y: -ring }, { x: i, y: ring })
      if (Math.abs(i) < ring) steps.push({ x: -ring, y: i }, { x: ring, y: i })
    }
    const found = steps
      // Stable: the same diagram always gets the same place.
      .sort((a, b) => a.x * a.x + a.y * a.y - (b.x * b.x + b.y * b.y) || a.y - b.y || a.x - b.x)
      // `|| 0`: never a negative zero.
      .map((step) => ({ x: step.x * grid || 0, y: step.y * grid || 0 }))
      .find(free)
    if (found) return found
  }
  return undefined
}

/**
 * The place nearest to a wanted one, on a grid, that `fits`; the wanted place itself (rounded to
 * the grid) when it does. The search goes outwards ring by ring, as `placeBlock` does;
 * `undefined` when `reach` rings have none.
 */
export function nearestPlace(wanted: Point, grid: number, fits: (place: Point) => boolean, reach = 60): Point | undefined {
  const origin = { x: Math.round(wanted.x / grid) * grid, y: Math.round(wanted.y / grid) * grid }
  for (let ring = 0; ring <= reach; ring++) {
    const steps: Point[] = []
    for (let i = -ring; i <= ring; i++) {
      steps.push({ x: i, y: -ring }, { x: i, y: ring })
      if (Math.abs(i) < ring) steps.push({ x: -ring, y: i }, { x: ring, y: i })
    }
    const found = steps
      .sort((a, b) => a.x * a.x + a.y * a.y - (b.x * b.x + b.y * b.y) || a.y - b.y || a.x - b.x)
      .map((step) => ({ x: origin.x + step.x * grid || 0, y: origin.y + step.y * grid || 0 }))
      .find(fits)
    if (found) return found
  }
  return undefined
}
