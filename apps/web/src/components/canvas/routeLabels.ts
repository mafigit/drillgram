import type { Point } from '@drillgram/model'
import type { LayoutEngine, Route, RouteRequest, Routes } from 'tidy-layout'
import type { Box } from './geometry'

const CLEARANCE = 4

const overlaps = (a: Box, b: Box) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height

/** Centre a covered label over one piece of its line, on the side with the closest space. */
function clearCorner(route: Route, size: Pick<Box, 'width' | 'height'>, obstacles: Box[]): Point | null {
  let best: Point | null = null
  let bestDistance = Infinity
  for (let i = 1; i < route.length; i++) {
    const from = route[i - 1]!
    const to = route[i]!
    const upright = from.x === to.x
    const along = upright ? 'y' : 'x'
    const across = upright ? 'x' : 'y'
    const length = upright ? 'height' : 'width'
    const depth = upright ? 'width' : 'height'
    const start = (from[along] + to[along] - size[length]) / 2
    const line = from[across]
    const half = size[depth] / 2
    const blocking = obstacles.filter((box) =>
      box[along] - CLEARANCE < start + size[length] && box[along] + box[length] + CLEARANCE > start,
    )
    for (const direction of [-1, 1]) {
      // Each interval is a range of distances from the line where the label would hit a box.
      const blocked = blocking
        .map((box) => {
          const near = direction * (box[across] - line)
          const far = direction * (box[across] + box[depth] - line)
          return [Math.min(near, far) - half - CLEARANCE, Math.max(near, far) + half + CLEARANCE] as const
        })
        .sort((a, b) => a[0] - b[0])
      let distance = half + CLEARANCE
      for (const [near, far] of blocked) {
        if (distance <= near) break
        distance = Math.max(distance, far)
      }
      const gap = distance - half
      if (gap < bestDistance) {
        bestDistance = gap
        const side = line + direction * distance - half
        best = upright ? { x: side, y: start } : { x: start, y: side }
      }
    }
  }
  return best
}

/** Keep any label that the router had to put on a card readable at the given card positions. */
export function routeWithClearLabels(engine: LayoutEngine, request: RouteRequest): Routes {
  const answer = engine.route(request)
  const labels = answer.labels.map((corner, i) => {
    const size = request.connections[i]?.label
    return corner && size ? { ...corner, ...size } : null
  })
  const covered = labels.flatMap((box, i) =>
    box && request.cards.some((card) => overlaps(box, card)) ? [i] : [],
  )
  if (covered.length === 0) return answer

  const lines = answer.routes.flatMap((route) =>
    route.slice(1).map((to, i) => {
      const from = route[i]!
      return {
        x: Math.min(from.x, to.x),
        y: Math.min(from.y, to.y),
        width: Math.abs(from.x - to.x),
        height: Math.abs(from.y - to.y),
      }
    }),
  )
  for (const i of covered) {
    const box = labels[i]!
    const otherLabels = labels.flatMap((label, j) => label && j !== i ? [label] : [])
    const obstacles = [...request.cards, ...lines, ...otherLabels]
    const corner = clearCorner(answer.routes[i]!, box, obstacles)
    if (!corner) continue
    answer.labels[i] = corner
    labels[i] = { ...box, ...corner }
  }
  return answer
}
