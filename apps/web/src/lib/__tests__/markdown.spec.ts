import { describe, expect, it } from 'vitest'
import { plainLines, renderMarkdown } from '../markdown'

/** The rendered HTML as elements, to ask what is in it. */
function page(text: string): HTMLElement {
  const root = document.createElement('div')
  root.innerHTML = renderMarkdown(text)
  return root
}

describe('renderMarkdown', () => {
  it('leaves plain text a paragraph, and a line break a line break', () => {
    expect(renderMarkdown('Sells books to customers')).toBe('<p>Sells books to customers</p>\n')
    expect(page('one\ntwo').querySelectorAll('br')).toHaveLength(1)
  })

  it('renders headings, emphasis, lists, quotes, code, rules and strikethrough', () => {
    const root = page('# Plan\n\n## Next\n\n**bold** *slanted* ~~gone~~ `code`\n\n- one\n- two\n\n1. first\n\n> said\n\n---\n\n```\nlet a = 1\n```')
    expect(root.querySelector('h1')?.textContent).toBe('Plan')
    expect(root.querySelector('h2')?.textContent).toBe('Next')
    expect(root.querySelector('strong')?.textContent).toBe('bold')
    expect(root.querySelector('em')?.textContent).toBe('slanted')
    expect(root.querySelector('s')?.textContent).toBe('gone')
    expect(root.querySelector('p code')?.textContent).toBe('code')
    expect(root.querySelectorAll('ul li')).toHaveLength(2)
    expect(root.querySelectorAll('ol li')).toHaveLength(1)
    expect(root.querySelector('blockquote')?.textContent?.trim()).toBe('said')
    expect(root.querySelector('hr')).not.toBeNull()
    expect(root.querySelector('pre code')?.textContent).toBe('let a = 1\n')
  })

  it('draws a rule for --- also right under a line of text, and makes no heading of that line', () => {
    const root = page('ID string\nTotal Money\n---\nPlace() error')
    expect(root.querySelectorAll('hr')).toHaveLength(1)
    expect(root.querySelector('h1, h2')).toBeNull()
    expect(root.textContent).toContain('Total Money')
  })

  it('renders tables and task lists', () => {
    const root = page('| A | B |\n| - | - |\n| 1 | 2 |\n\n- [x] done\n- [ ] open\n- plain')
    expect([...root.querySelectorAll('th')].map((cell) => cell.textContent)).toEqual(['A', 'B'])
    expect([...root.querySelectorAll('td')].map((cell) => cell.textContent)).toEqual(['1', '2'])
    const boxes = [...root.querySelectorAll<HTMLInputElement>('li input[type=checkbox]')]
    expect(boxes.map((box) => [box.checked, box.disabled])).toEqual([
      [true, true],
      [false, true],
    ])
    expect([...root.querySelectorAll('li')].map((item) => item.textContent?.trim())).toEqual(['done', 'open', 'plain'])
  })

  it('opens links in another tab, also those written as plain addresses', () => {
    const links = [...page('[docs](https://example.com/docs) and https://example.org').querySelectorAll('a')]
    expect(links.map((link) => link.getAttribute('href'))).toEqual(['https://example.com/docs', 'https://example.org'])
    for (const link of links) {
      expect(link.getAttribute('target')).toBe('_blank')
      expect(link.getAttribute('rel')).toBe('noopener noreferrer nofollow')
    }
  })

  it('loads a picture lazily and without a referrer', () => {
    const picture = page('![logo](https://example.com/logo.png)').querySelector('img')!
    expect(picture.getAttribute('src')).toBe('https://example.com/logo.png')
    expect(picture.getAttribute('alt')).toBe('logo')
    expect(picture.getAttribute('loading')).toBe('lazy')
    expect(picture.getAttribute('referrerpolicy')).toBe('no-referrer')
  })

  it.each([
    '<script>alert(1)</script>',
    '<img src=x onerror="alert(1)">',
    '<b onclick="alert(1)">bold</b>',
    'text <iframe src="https://example.com"></iframe>',
    '- [x] <svg onload=alert(1)>',
  ])('shows HTML written in the text as text, and runs none of it: %s', (text) => {
    const root = page(text)
    expect(root.querySelector('script, iframe, svg, b, img')).toBeNull()
    const handlers = [...root.querySelectorAll('*')].flatMap((el) => el.getAttributeNames()).filter((name) => name.startsWith('on'))
    expect(handlers).toEqual([])
    expect(root.textContent).toContain('<')
  })

  it.each([
    '[x](javascript:alert(1))',
    '[x](vbscript:msgbox(1))',
    '[x](data:text/html,<script>alert(1)</script>)',
    '![x](javascript:alert(1))',
  ])('makes no link out of an address that could run code: %s', (text) => {
    expect(page(text).querySelector('a, img')).toBeNull()
  })
})

describe('plainLines', () => {
  it('gives the text without its marks, a line per block', () => {
    const text =
      '# Plan\n\nShip **fast**, not *sloppy*.\n\n- [x] Model\n- [ ] Editor\n- `code` and a [link](https://example.com)\n\n| A | B |\n| - | - |\n| 1 | 2 |'
    expect(plainLines(text)).toEqual(['Plan', 'Ship fast, not sloppy.', '☑ Model', '☐ Editor', 'code and a link', 'A | B', '1 | 2'])
  })

  it('keeps plain text, line by line, and the lines of a code block', () => {
    expect(plainLines('Sells books\nto customers')).toEqual(['Sells books', 'to customers'])
    expect(plainLines('```\na = 1\nb = 2\n```')).toEqual(['a = 1', 'b = 2'])
    expect(plainLines('')).toEqual([])
  })
})
