import { describe, expect, it } from 'vitest'
import { cloudColor } from './weather'

describe('cloudColor', () => {
  it('spans sage to grey and clamps', () => {
    expect(cloudColor(0)).toBe('rgb(105,193,181)')
    expect(cloudColor(1)).toBe('rgb(110,103,92)')
    expect(cloudColor(-1)).toBe(cloudColor(0))
    expect(cloudColor(2)).toBe(cloudColor(1))
  })
})
