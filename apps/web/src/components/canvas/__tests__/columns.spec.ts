import { describe, expect, it } from 'vitest'
import { COLUMN_TYPES, KEY_SIGN, columnsFromText } from '../columns'

describe('columnsFromText', () => {
  it('reads a column per line: its name, its type, and its key from the words after', () => {
    expect(columnsFromText('id uuid pk\ncustomer_id uuid fk\nemail text unique\nnote')).toEqual([
      { name: 'id', type: 'uuid', key: 'primary' },
      { name: 'customer_id', type: 'uuid', key: 'foreign' },
      { name: 'email', type: 'text', key: 'unique' },
      { name: 'note', type: '', key: '' },
    ])
  })

  it('reads the columns of a CREATE TABLE, and leaves out what is no column', () => {
    const sql = `CREATE TABLE orders (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      "customer_id" uuid NOT NULL REFERENCES customers(id),
      total numeric(10, 2) NOT NULL,
      \`status\` varchar(20) DEFAULT 'new',
      created_at timestamp with time zone,
      CONSTRAINT positive CHECK (total > 0),
      PRIMARY KEY (id),
      UNIQUE (customer_id, created_at)
    );`
    expect(columnsFromText(sql)).toEqual([
      { name: 'id', type: 'UUID', key: 'primary' },
      { name: 'customer_id', type: 'uuid', key: 'foreign' },
      { name: 'total', type: 'numeric(10, 2)', key: '' },
      { name: 'status', type: 'varchar(20)', key: '' },
      { name: 'created_at', type: 'timestamp with time zone', key: '' },
    ])
  })

  it('reads a name and a type with a colon or a tab between them', () => {
    expect(columnsFromText('id: int\nname:\tvarchar(80)\ncreated\ttimestamptz')).toEqual([
      { name: 'id', type: 'int', key: '' },
      { name: 'name', type: 'varchar(80)', key: '' },
      { name: 'created', type: 'timestamptz', key: '' },
    ])
  })

  it('gives nothing for nothing', () => {
    expect(columnsFromText('')).toEqual([])
    expect(columnsFromText('  \n );\n')).toEqual([])
  })

  it('has a short sign for every key and the usual types to pick from', () => {
    expect(KEY_SIGN).toEqual({ primary: 'PK', foreign: 'FK', unique: 'UQ' })
    expect(COLUMN_TYPES).toEqual(expect.arrayContaining(['uuid', 'text', 'timestamptz', 'jsonb']))
  })
})
