import { describe, it, expect } from 'vitest'
import { next } from '../index'

describe('next', () => {
  it('leads to the address of the app that was asked for before the sign-in', () => {
    expect(next('/w/abc/view/inside-Shop')).toBe('/w/abc/view/inside-Shop')
    expect(next('/users')).toBe('/users')
  })

  it('leads to the start when there is none, or it is no address of the app', () => {
    for (const wanted of [undefined, null, '', ['/users'], 'https://evil.example.com/', '//evil.example.com/', 'users', '/login', '/login?next=/login']) {
      expect(next(wanted), String(wanted)).toBe('/')
    }
  })
})
