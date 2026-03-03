import { extractTypes, extractClasses, extractJsxComponents } from '@/lib/code/parser/extract-types'

describe('extractTypes', () => {
  describe('TypeScript interfaces', () => {
    it('extracts interface with properties', () => {
      const code = `export interface User {
  name: string
  age: number
  email: string
}`
      const result = extractTypes(code, 'typescript')
      expect(result).toHaveLength(1)
      expect(result[0]).toMatchObject({
        name: 'User',
        kind: 'interface',
      })
      expect(result[0].properties.length).toBeGreaterThanOrEqual(2)
    })

    it('extracts interface with extends', () => {
      const code = `interface Admin extends User {
  permissions: string[]
}`
      const result = extractTypes(code, 'typescript')
      expect(result).toHaveLength(1)
      expect(result[0].extends).toEqual(['User'])
    })
  })

  describe('TypeScript type aliases', () => {
    it('extracts union type', () => {
      const code = `export type Status = 'active' | 'inactive' | 'pending'`
      const result = extractTypes(code, 'typescript')
      expect(result).toHaveLength(1)
      expect(result[0]).toMatchObject({
        name: 'Status',
        kind: 'type',
      })
      expect(result[0].properties.length).toBeGreaterThanOrEqual(2)
    })

    it('extracts intersection type', () => {
      const code = `type FullUser = User & Admin`
      const result = extractTypes(code, 'typescript')
      expect(result).toHaveLength(1)
      expect(result[0].kind).toBe('type')
      expect(result[0].properties).toEqual(expect.arrayContaining(['User', 'Admin']))
    })
  })

  describe('TypeScript enums', () => {
    it('extracts enum members', () => {
      const code = `export enum Color {
  Red,
  Green,
  Blue,
}`
      const result = extractTypes(code, 'typescript')
      expect(result).toHaveLength(1)
      expect(result[0]).toMatchObject({
        name: 'Color',
        kind: 'enum',
      })
      expect(result[0].properties).toEqual(expect.arrayContaining(['Red', 'Green', 'Blue']))
    })

    it('extracts enum with values', () => {
      const code = `enum Direction {
  Up = "UP",
  Down = "DOWN",
}`
      const result = extractTypes(code, 'typescript')
      expect(result).toHaveLength(1)
      expect(result[0].properties).toEqual(expect.arrayContaining(['Up', 'Down']))
    })
  })

  describe('Go structs', () => {
    it('extracts exported struct', () => {
      const code = `type Config struct {
  Host string
  Port int
}`
      const result = extractTypes(code, 'go')
      expect(result).toHaveLength(1)
      expect(result[0]).toMatchObject({
        name: 'Config',
        kind: 'interface',
        exported: true,
      })
    })

    it('extracts Go interface', () => {
      const code = `type Handler interface {
  ServeHTTP(w ResponseWriter, r *Request)
}`
      const result = extractTypes(code, 'go')
      expect(result).toHaveLength(1)
      expect(result[0].name).toBe('Handler')
    })
  })

  describe('Rust structs/enums', () => {
    it('extracts Rust struct', () => {
      const code = `pub struct Config {
  host: String,
  port: u16,
}`
      const result = extractTypes(code, 'rust')
      expect(result).toHaveLength(1)
      expect(result[0]).toMatchObject({
        name: 'Config',
        kind: 'interface',
      })
    })

    it('extracts Rust enum', () => {
      const code = `pub enum Color {
  Red,
  Green,
  Blue,
}`
      const result = extractTypes(code, 'rust')
      expect(result).toHaveLength(1)
      expect(result[0]).toMatchObject({
        name: 'Color',
        kind: 'enum',
      })
    })
  })

  describe('unsupported languages', () => {
    it('returns empty for unknown lang', () => {
      const result = extractTypes('some code', 'ruby')
      expect(result).toHaveLength(0)
    })
  })
})

describe('extractClasses', () => {
  describe('TypeScript/JavaScript classes', () => {
    it('extracts class with methods', () => {
      const code = `export class UserService {
  private db: Database

  async getUser(id: string) {
    return this.db.find(id)
  }

  async deleteUser(id: string) {
    return this.db.delete(id)
  }
}`
      const result = extractClasses(code, 'typescript')
      expect(result).toHaveLength(1)
      expect(result[0].name).toBe('UserService')
      expect(result[0].methods).toContain('getUser')
      expect(result[0].methods).toContain('deleteUser')
    })

    it('extracts class with extends', () => {
      const code = `class Admin extends User {
  role: string
}`
      const result = extractClasses(code, 'typescript')
      expect(result).toHaveLength(1)
      expect(result[0].extends).toBe('User')
    })

    it('extracts class with implements', () => {
      const code = `class Handler implements RequestHandler, Logger {
  handle() {}
  log() {}
}`
      const result = extractClasses(code, 'typescript')
      expect(result).toHaveLength(1)
      expect(result[0].implements).toEqual(expect.arrayContaining(['RequestHandler', 'Logger']))
    })

    it('extracts abstract class', () => {
      const code = `export abstract class BaseService {
  abstract execute(): void
}`
      const result = extractClasses(code, 'typescript')
      expect(result).toHaveLength(1)
      expect(result[0].name).toBe('BaseService')
    })
  })

  describe('Python classes', () => {
    it('extracts class with base class', () => {
      const code = `class Admin(User):
    def get_permissions(self):
        return self.perms
    def __init__(self):
        pass`
      const result = extractClasses(code, 'python')
      expect(result).toHaveLength(1)
      expect(result[0].extends).toBe('User')
      expect(result[0].methods).toContain('get_permissions')
      // __init__ should be excluded
      expect(result[0].methods).not.toContain('__init__')
    })

    it('detects private Python class', () => {
      const code = `class _InternalCache:\n    pass`
      const result = extractClasses(code, 'python')
      expect(result).toHaveLength(1)
      expect(result[0].exported).toBe(false)
    })
  })

  describe('unsupported languages', () => {
    it('returns empty for Go', () => {
      const code = `type Server struct {}`
      const result = extractClasses(code, 'go')
      expect(result).toHaveLength(0)
    })
  })
})

describe('extractJsxComponents', () => {
  it('extracts component tags from JSX', () => {
    const code = `
      return (
        <div>
          <Header />
          <Sidebar items={items} />
          <main>
            <ContentPanel />
          </main>
        </div>
      )
    `
    const result = extractJsxComponents(code, 'typescript')
    expect(result).toContain('Header')
    expect(result).toContain('Sidebar')
    expect(result).toContain('ContentPanel')
  })

  it('does not include HTML tags', () => {
    const code = `<div><span>hello</span></div>`
    const result = extractJsxComponents(code, 'typescript')
    expect(result).toHaveLength(0)
  })

  it('returns empty for non-JS/TS languages', () => {
    const result = extractJsxComponents('<Header />', 'python')
    expect(result).toHaveLength(0)
  })

  it('deduplicates same component used multiple times', () => {
    const code = `
      <Button onClick={a}>A</Button>
      <Button onClick={b}>B</Button>
    `
    const result = extractJsxComponents(code, 'typescript')
    expect(result.filter(c => c === 'Button')).toHaveLength(1)
  })
})
