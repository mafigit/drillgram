import MarkdownIt from 'markdown-it'

// The text of a card is Markdown (CommonMark with tables, strikethrough, links found in plain
// text, and task lists). It is turned into HTML here, for `v-html`, so this is also where it is
// made safe: HTML written in the text is shown as text, never run (`html: false`), and
// markdown-it refuses links that could run code (`javascript:` and the like).
const markdown = new MarkdownIt({ html: false, linkify: true, breaks: true })
// A line of --- is always a rule, also right under a line of text, where Markdown would make
// that line a heading: a code element's fields and methods are divided that way, and a heading
// is written with #.
markdown.disable('lheading')

// A link opens in another tab and tells the other site nothing about this one.
markdown.renderer.rules.link_open = (tokens, index, options, _env, self) => {
  const token = tokens[index]!
  token.attrSet('target', '_blank')
  token.attrSet('rel', 'noopener noreferrer nofollow')
  return self.renderToken(tokens, index, options)
}

// A picture is fetched only when it comes into view, and without a referrer.
const image = markdown.renderer.rules.image!
markdown.renderer.rules.image = (tokens, index, options, env, self) => {
  const token = tokens[index]!
  token.attrSet('loading', 'lazy')
  token.attrSet('referrerpolicy', 'no-referrer')
  return image(tokens, index, options, env, self)
}

// Task lists: "- [ ] open" and "- [x] done" become boxes. They only show: the text is the truth.
markdown.core.ruler.after('inline', 'task-lists', (state) => {
  const tokens = state.tokens
  for (let i = 2; i < tokens.length; i++) {
    const inline = tokens[i]!
    if (inline.type !== 'inline' || tokens[i - 1]!.type !== 'paragraph_open' || tokens[i - 2]!.type !== 'list_item_open') continue
    const first = inline.children?.[0]
    const mark = first?.type === 'text' ? /^\[([ xX])\] /.exec(first.content) : null
    if (!first || !mark) continue
    first.content = first.content.slice(mark[0].length)
    const box = new state.Token('html_inline', '', 0)
    box.content = `<input type="checkbox" disabled${mark[1] === ' ' ? '' : ' checked'}> `
    inline.children!.unshift(box)
    tokens[i - 2]!.attrJoin('class', 'task')
  }
})

/** The HTML of a Markdown text, safe to put on the page. */
export function renderMarkdown(text: string): string {
  return markdown.render(text)
}

/**
 * A Markdown text as plain lines, without its marks, for where nothing but text can be drawn
 * (the SVG and PNG export): one line per paragraph, heading, list item or table row.
 */
export function plainLines(text: string): string[] {
  const lines: string[] = []
  let row: string[] | undefined
  for (const token of markdown.parse(text, {})) {
    if (token.type === 'tr_open') row = []
    else if (token.type === 'tr_close' && row) {
      lines.push(row.join(' | '))
      row = undefined
    } else if (token.type === 'fence' || token.type === 'code_block') {
      lines.push(...token.content.replace(/\n$/, '').split('\n'))
    } else if (token.type === 'inline') {
      const said = (token.children ?? [])
        .map((child) => {
          if (child.type === 'softbreak' || child.type === 'hardbreak') return '\n'
          // The box of a task: the only HTML the rules above put in.
          if (child.type === 'html_inline') return child.content.includes('checked') ? '☑ ' : '☐ '
          if (child.type.endsWith('_open') || child.type.endsWith('_close')) return ''
          return child.content
        })
        .join('')
      if (row) row.push(said.replace(/\n/g, ' '))
      else lines.push(...said.split('\n'))
    }
  }
  return lines.map((line) => line.trim()).filter((line) => line !== '')
}
