import { extractExports } from '@/lib/code/parser/extract-exports'

describe('extractExports', () => {
  describe('TypeScript/JavaScript exports', () => {
    it.each([
      {
        desc: 'named function export',
        code: `export function getUserById(id: string) { return id }`,
        expected: { name: 'getUserById', kind: 'function', isDefault: false },
      },
      {
        desc: 'named const export',
        code: `export const MAX_SIZE = 100`,
        expected: { name: 'MAX_SIZE', kind: 'component', isDefault: false },
      },
      {
        desc: 'named class export',
        code: `export class UserService { }`,
        expected: { name: 'UserService', kind: 'class', isDefault: false },
      },
      {
        desc: 'named interface export',
        code: `export interface User { name: string }`,
        expected: { name: 'User', kind: 'interface', isDefault: false },
      },
      {
        desc: 'named type export',
        code: `export type Status = 'active' | 'inactive'`,
        expected: { name: 'Status', kind: 'type', isDefault: false },
      },
      {
        desc: 'named enum export',
        code: `export enum Color { Red, Green, Blue }`,
        expected: { name: 'Color', kind: 'enum', isDefault: false },
      },
    ])('$desc', ({ code, expected }) => {
      const result = extractExports(code, 'typescript')
      expect(result.length).toBeGreaterThanOrEqual(1)
      expect(result).toEqual(
        expect.arrayContaining([expect.objectContaining(expected)])
      )
    })

    it('extracts default export function', () => {
      const code = `export default function handler() { }`
      const result = extractExports(code, 'typescript')
      expect(result.length).toBeGreaterThanOrEqual(1)
      const defaultExport = result.find(e => e.isDefault)
      expect(defaultExport).toBeTruthy()
    })

    it('extracts default export class', () => {
      const code = `export default class MyComponent { }`
      const result = extractExports(code, 'typescript')
      expect(result.length).toBeGreaterThanOrEqual(1)
      const defaultExport = result.find(e => e.isDefault)
      expect(defaultExport).toBeTruthy()
    })

    it('detects component kind for PascalCase function', () => {
      const code = `export function Button() { return null }`
      const result = extractExports(code, 'typescript')
      expect(result).toHaveLength(1)
      expect(result[0].kind).toBe('component')
    })

    it('handles async function export', () => {
      const code = `export async function fetchData() { }`
      const result = extractExports(code, 'typescript')
      expect(result.length).toBeGreaterThanOrEqual(1)
      expect(result[0].kind).toBe('function')
    })

    it('handles export default identifier', () => {
      const code = `const App = () => {}\nexport default App`
      const result = extractExports(code, 'typescript')
      expect(result.length).toBeGreaterThanOrEqual(1)
      const defaultExport = result.find(e => e.isDefault)
      expect(defaultExport).toBeTruthy()
    })
  })

  describe('Python exports', () => {
    it('extracts public functions', () => {
      const code = [
        `def get_user():`,
        `    pass`,
        `def _private_helper():`,
        `    pass`,
      ].join('\n')
      const result = extractExports(code, 'python')
      expect(result).toHaveLength(1)
      expect(result[0]).toMatchObject({ name: 'get_user', kind: 'function' })
    })

    it('extracts public classes', () => {
      const code = [
        `class UserService:`,
        `    pass`,
        `class _InternalCache:`,
        `    pass`,
      ].join('\n')
      const result = extractExports(code, 'python')
      expect(result).toHaveLength(1)
      expect(result[0]).toMatchObject({ name: 'UserService', kind: 'class' })
    })

    it('extracts async def', () => {
      const code = `async def fetch_data():\n    pass`
      const result = extractExports(code, 'python')
      expect(result).toHaveLength(1)
      expect(result[0].name).toBe('fetch_data')
    })
  })

  describe('Go exports', () => {
    it('extracts uppercase functions', () => {
      const code = [
        `func HandleRequest() {}`,
        `func handleInternal() {}`,
      ].join('\n')
      const result = extractExports(code, 'go')
      expect(result).toHaveLength(1)
      expect(result[0]).toMatchObject({ name: 'HandleRequest', kind: 'function' })
    })

    it('extracts method with receiver', () => {
      const code = `func (s *Server) Start() {}`
      const result = extractExports(code, 'go')
      expect(result).toHaveLength(1)
      expect(result[0].name).toBe('Start')
    })
  })

  describe('Rust exports', () => {
    it('extracts pub functions', () => {
      const code = [
        `pub fn handle_request() {}`,
        `fn internal_helper() {}`,
      ].join('\n')
      const result = extractExports(code, 'rust')
      expect(result).toHaveLength(1)
      expect(result[0]).toMatchObject({ name: 'handle_request', kind: 'function' })
    })

    it('extracts pub struct', () => {
      const code = `pub struct Config {}`
      const result = extractExports(code, 'rust')
      expect(result).toHaveLength(1)
      expect(result[0].name).toBe('Config')
    })

    it('extracts pub async fn', () => {
      const code = `pub async fn fetch_data() {}`
      const result = extractExports(code, 'rust')
      expect(result).toHaveLength(1)
      expect(result[0].name).toBe('fetch_data')
    })
  })

  describe('unsupported languages', () => {
    it('returns empty for unknown language', () => {
      const code = `some random code`
      const result = extractExports(code, 'ruby')
      expect(result).toHaveLength(0)
    })
  })
})
