import type { ColumnKey } from '@drillgram/model'

// The columns of a table (a box with the shape `table`), as its form has them and its card
// shows them.

/** A column as the form holds it: every field a text, `''` where nothing is said. */
export interface ColumnRow {
  name: string
  type: string
  key: ColumnKey | ''
}

/** The sign of a key on the card and in the form. */
export const KEY_SIGN: Record<ColumnKey, string> = { primary: 'PK', foreign: 'FK', unique: 'UQ' }

/** Types the type field offers; any other can be typed. */
export const COLUMN_TYPES = ['uuid', 'int', 'bigint', 'serial', 'text', 'varchar(255)', 'boolean', 'numeric', 'date', 'timestamp', 'timestamptz', 'jsonb', 'bytea']

/** A line of a table's definition that is no column: the frame around them, a constraint of the table. */
const NO_COLUMN = /^(create\s+table\b|\(|\)|constraint\b|primary\s+key\s*\(|foreign\s+key\s*\(|unique\s*\(|check\s*\(|index\b|key\s)/i
/** Where a column's type ends: at the first word that says something else about it. */
const AFTER_TYPE = /\s+(primary\s+key|references|foreign\s+key|unique|not\s+null|null|default|check|generated|auto_increment|autoincrement|collate|pk|fk|uq)\b/i

/**
 * Columns from text, a line each: `id uuid pk`, `name: varchar(80)`, or the lines between the
 * brackets of a CREATE TABLE. The first word is the name, what follows the type, up to the
 * words that say more (NOT NULL, DEFAULT); a key is read from those.
 */
export function columnsFromText(text: string): ColumnRow[] {
  return text.split(/\r?\n/).flatMap((raw): ColumnRow[] => {
    const line = raw.trim().replace(/[,;]+$/, '').trim()
    if (line === '' || NO_COLUMN.test(line)) return []
    const named = /^(?:"([^"]+)"|`([^`]+)`|\[([^\]]+)\]|([^\s:]+))\s*:?\s*(.*)$/.exec(line)
    if (!named) return []
    const name = named[1] ?? named[2] ?? named[3] ?? named[4]!
    const rest = ` ${named[5] ?? ''}`
    const end = AFTER_TYPE.exec(rest)
    const type = (end ? rest.slice(0, end.index) : rest).trim()
    const more = end ? rest.slice(end.index) : ''
    const key: ColumnKey | '' = /\b(primary\s+key|pk)\b/i.test(more)
      ? 'primary'
      : /\b(references|foreign\s+key|fk)\b/i.test(more)
        ? 'foreign'
        : /\b(unique|uq)\b/i.test(more)
          ? 'unique'
          : ''
    return [{ name, type, key }]
  })
}
