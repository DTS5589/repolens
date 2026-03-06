import {
  extractSymbolsTreeSitter,
  extractTypesTreeSitter,
  extractClassesTreeSitter,
} from '../tree-sitter-symbols'

// ---------------------------------------------------------------------------
// Mock tree-sitter module — WASM cannot run in jsdom
// ---------------------------------------------------------------------------

const mockParseFile = vi.fn()
const mockQueryTree = vi.fn()
const mockIsLanguageSupported = vi.fn()

vi.mock('@/lib/parsers/tree-sitter', () => ({
  isLanguageSupported: (...args: unknown[]) => mockIsLanguageSupported(...args),
  parseFile: (...args: unknown[]) => mockParseFile(...args),
  queryTree: (...args: unknown[]) => mockQueryTree(...args),
}))

// ---------------------------------------------------------------------------
// Helpers to create mock AST nodes
// ---------------------------------------------------------------------------

interface MockNodeOptions {
  text: string
  type: string
  row?: number
  parentType?: string
  parentFields?: Record<string, Partial<MockNodeOptions> | null>
  parentNamedChildren?: Partial<MockNodeOptions>[]
}

function makeMockNode(opts: MockNodeOptions) {
  const parentNamedChildren = (opts.parentNamedChildren ?? []).map(c => ({
    type: c.type ?? '',
    text: c.text ?? '',
    namedChildren: [],
    childForFieldName: () => null,
  }))

  const parentFields: Record<string, unknown> = {}
  if (opts.parentFields) {
    for (const [k, v] of Object.entries(opts.parentFields)) {
      parentFields[k] = v
        ? { text: v.text ?? '', type: v.type ?? '', namedChildren: [] }
        : null
    }
  }

  const parent = opts.parentType
    ? {
        type: opts.parentType,
        namedChildren: parentNamedChildren,
        childForFieldName: (name: string) => parentFields[name] ?? null,
      }
    : undefined

  return {
    text: opts.text,
    type: opts.type,
    startPosition: { row: opts.row ?? 0 },
    parent,
  }
}

function makeMatch(
  nameNode: ReturnType<typeof makeMockNode>,
  bodyNode?: { text: string; namedChildren?: unknown[] },
) {
  const captures: Record<string, unknown[]> = { name: [nameNode] }
  if (bodyNode) captures['body'] = [bodyNode]
  return { pattern: 0, captures }
}

function fakeTree() {
  return { delete: vi.fn() }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockIsLanguageSupported.mockReturnValue(true)
})

// =========================================================================
// extractSymbolsTreeSitter
// =========================================================================

describe('extractSymbolsTreeSitter', () => {
  it('returns null for a language without queries', async () => {
    const result = await extractSymbolsTreeSitter('code', 'haskell')
    expect(result).toBeNull()
    expect(mockParseFile).not.toHaveBeenCalled()
  })

  it('returns null when language is not supported by tree-sitter', async () => {
    mockIsLanguageSupported.mockReturnValue(false)
    const result = await extractSymbolsTreeSitter('code', 'java')
    expect(result).toBeNull()
  })

  it('returns null when parseFile fails', async () => {
    mockParseFile.mockResolvedValue(null)
    const result = await extractSymbolsTreeSitter('code', 'java')
    expect(result).toBeNull()
  })

  it('returns null when queryTree throws', async () => {
    mockParseFile.mockResolvedValue(fakeTree())
    mockQueryTree.mockRejectedValue(new Error('query error'))
    const result = await extractSymbolsTreeSitter('code', 'java')
    expect(result).toBeNull()
  })

  it('calls tree.delete() even when queryTree throws', async () => {
    const tree = fakeTree()
    mockParseFile.mockResolvedValue(tree)
    mockQueryTree.mockRejectedValue(new Error('boom'))
    await extractSymbolsTreeSitter('code', 'java')
    expect(tree.delete).toHaveBeenCalled()
  })

  it('skips matches without name captures', async () => {
    mockParseFile.mockResolvedValue(fakeTree())
    mockQueryTree.mockResolvedValue([{ pattern: 0, captures: {} }])
    const result = await extractSymbolsTreeSitter('code', 'java')
    expect(result).toEqual([])
  })

  it('extracts Java symbols with correct fields', async () => {
    const classNode = makeMockNode({
      text: 'UserService', type: 'identifier', row: 4,
      parentType: 'class_declaration',
      parentFields: { modifiers: { text: 'public', type: 'modifiers' } },
    })
    const methodNode = makeMockNode({
      text: 'getUser', type: 'identifier', row: 10,
      parentType: 'method_declaration',
      parentFields: { modifiers: { text: 'public', type: 'modifiers' } },
    })
    const ifaceNode = makeMockNode({
      text: 'Serializable', type: 'identifier', row: 20,
      parentType: 'interface_declaration',
      parentFields: { modifiers: { text: 'public', type: 'modifiers' } },
    })

    mockParseFile.mockResolvedValue(fakeTree())
    mockQueryTree.mockResolvedValue([
      makeMatch(classNode), makeMatch(methodNode), makeMatch(ifaceNode),
    ])

    const result = await extractSymbolsTreeSitter('code', 'java')
    expect(result).toEqual([
      { name: 'UserService', kind: 'class', line: 5, isExported: true },
      { name: 'getUser', kind: 'method', line: 11, isExported: true },
      { name: 'Serializable', kind: 'interface', line: 21, isExported: true },
    ])
  })

  it('detects Java private methods as not exported', async () => {
    const node = makeMockNode({
      text: 'helper', type: 'identifier', row: 0,
      parentType: 'method_declaration',
      parentFields: { modifiers: { text: 'private', type: 'modifiers' } },
    })
    mockParseFile.mockResolvedValue(fakeTree())
    mockQueryTree.mockResolvedValue([makeMatch(node)])
    const result = await extractSymbolsTreeSitter('code', 'java')
    expect(result![0].isExported).toBe(false)
  })

  it('extracts Go symbols with correct kinds', async () => {
    const funcNode = makeMockNode({
      text: 'HandleRequest', type: 'identifier', row: 2,
      parentType: 'function_declaration',
    })
    const methodNode = makeMockNode({
      text: 'Serve', type: 'field_identifier', row: 8,
      parentType: 'method_declaration',
    })
    const typeNode = makeMockNode({
      text: 'Config', type: 'type_identifier', row: 15,
      parentType: 'type_spec',
    })

    mockParseFile.mockResolvedValue(fakeTree())
    mockQueryTree.mockResolvedValue([
      makeMatch(funcNode), makeMatch(methodNode), makeMatch(typeNode),
    ])
    const result = await extractSymbolsTreeSitter('code', 'go')
    expect(result).toEqual([
      { name: 'HandleRequest', kind: 'function', line: 3, isExported: true },
      { name: 'Serve', kind: 'method', line: 9, isExported: true },
      { name: 'Config', kind: 'type', line: 16, isExported: true },
    ])
  })

  it('detects Go unexported symbols (lowercase)', async () => {
    const node = makeMockNode({
      text: 'internalHelper', type: 'identifier', row: 0,
      parentType: 'function_declaration',
    })
    mockParseFile.mockResolvedValue(fakeTree())
    mockQueryTree.mockResolvedValue([makeMatch(node)])
    const result = await extractSymbolsTreeSitter('code', 'go')
    expect(result![0].isExported).toBe(false)
  })

  it('extracts Rust symbols with correct kind mapping', async () => {
    const fnNode = makeMockNode({ text: 'process', type: 'identifier', row: 0, parentType: 'function_item' })
    const structNode = makeMockNode({ text: 'Config', type: 'type_identifier', row: 5, parentType: 'struct_item' })
    const enumNode = makeMockNode({ text: 'Status', type: 'type_identifier', row: 10, parentType: 'enum_item' })
    const traitNode = makeMockNode({ text: 'Runnable', type: 'type_identifier', row: 15, parentType: 'trait_item' })

    mockParseFile.mockResolvedValue(fakeTree())
    mockQueryTree.mockResolvedValue([
      makeMatch(fnNode), makeMatch(structNode), makeMatch(enumNode), makeMatch(traitNode),
    ])
    const result = await extractSymbolsTreeSitter('code', 'rust')
    expect(result).toHaveLength(4)
    expect(result!.map(s => s.kind)).toEqual(['function', 'class', 'enum', 'interface'])
  })

  it('detects Rust pub visibility', async () => {
    const pubNode = makeMockNode({
      text: 'run', type: 'identifier', row: 0, parentType: 'function_item',
      parentFields: { visibility: { text: 'pub', type: 'visibility_modifier' } },
    })
    const privNode = makeMockNode({
      text: 'helper', type: 'identifier', row: 5, parentType: 'function_item',
    })
    mockParseFile.mockResolvedValue(fakeTree())
    mockQueryTree.mockResolvedValue([makeMatch(pubNode), makeMatch(privNode)])
    const result = await extractSymbolsTreeSitter('code', 'rust')
    expect(result![0].isExported).toBe(true)
    expect(result![1].isExported).toBe(false)
  })

  it('maps node types to correct symbol kinds', async () => {
    const cases = [
      { parentType: 'class_declaration', language: 'java', expected: 'class' },
      { parentType: 'method_declaration', language: 'java', expected: 'method' },
      { parentType: 'interface_declaration', language: 'java', expected: 'interface' },
      { parentType: 'enum_declaration', language: 'java', expected: 'enum' },
      { parentType: 'constructor_declaration', language: 'java', expected: 'method' },
      { parentType: 'function_item', language: 'rust', expected: 'function' },
      { parentType: 'struct_item', language: 'rust', expected: 'class' },
      { parentType: 'trait_item', language: 'rust', expected: 'interface' },
      { parentType: 'const_item', language: 'rust', expected: 'variable' },
    ]
    for (const { parentType, language, expected } of cases) {
      const node = makeMockNode({ text: 'X', type: 'identifier', row: 0, parentType })
      mockParseFile.mockResolvedValue(fakeTree())
      mockQueryTree.mockResolvedValue([makeMatch(node)])
      const result = await extractSymbolsTreeSitter('code', language)
      expect(result![0].kind).toBe(expected)
      vi.clearAllMocks()
      mockIsLanguageSupported.mockReturnValue(true)
    }
  })
})

// =========================================================================
// extractTypesTreeSitter
// =========================================================================

describe('extractTypesTreeSitter', () => {
  it('returns null for a language without type queries', async () => {
    const result = await extractTypesTreeSitter('code', 'ruby')
    expect(result).toBeNull()
  })

  it('returns null for unsupported language', async () => {
    const result = await extractTypesTreeSitter('code', 'brainfuck')
    expect(result).toBeNull()
  })

  it('returns null when isLanguageSupported returns false', async () => {
    mockIsLanguageSupported.mockReturnValue(false)
    const result = await extractTypesTreeSitter('code', 'java')
    expect(result).toBeNull()
  })

  it('returns null when parseFile returns null', async () => {
    mockParseFile.mockResolvedValue(null)
    const result = await extractTypesTreeSitter('code', 'java')
    expect(result).toBeNull()
  })

  it('extracts Java interface types', async () => {
    const nameNode = makeMockNode({
      text: 'UserRepository', type: 'identifier', row: 2,
      parentType: 'interface_declaration',
      parentFields: { modifiers: { text: 'public', type: 'modifiers' } },
    })
    const bodyNode = { text: '{\n  User findById(String id);\n  List<User> findAll();\n}' }

    mockParseFile.mockResolvedValue(fakeTree())
    mockQueryTree.mockResolvedValue([makeMatch(nameNode, bodyNode)])

    const result = await extractTypesTreeSitter('code', 'java')
    expect(result).toHaveLength(1)
    expect(result![0]).toMatchObject({
      name: 'UserRepository',
      kind: 'interface',
      exported: true,
    })
    expect(result![0].properties.length).toBeGreaterThan(0)
    expect(result![0].properties).not.toContain('{')
    expect(result![0].properties).not.toContain('}')
  })

  it('extracts Go struct types', async () => {
    const nameNode = makeMockNode({
      text: 'Server', type: 'type_identifier', row: 3,
      parentType: 'type_spec',
    })
    const bodyNode = { text: '{\n  host string\n  port int\n}' }

    mockParseFile.mockResolvedValue(fakeTree())
    mockQueryTree.mockResolvedValue([makeMatch(nameNode, bodyNode)])

    const result = await extractTypesTreeSitter('code', 'go')
    expect(result).toHaveLength(1)
    expect(result![0]).toMatchObject({ name: 'Server', exported: true })
    expect(result![0].properties).toEqual(
      expect.arrayContaining(['host string', 'port int']),
    )
  })

  it('filters out comments and braces from properties', async () => {
    const nameNode = makeMockNode({
      text: 'Config', type: 'identifier', row: 0,
      parentType: 'interface_declaration',
    })
    const bodyNode = { text: '{\n  // comment\n  /* block */\n  name string\n  }' }

    mockParseFile.mockResolvedValue(fakeTree())
    mockQueryTree.mockResolvedValue([makeMatch(nameNode, bodyNode)])

    const result = await extractTypesTreeSitter('code', 'java')
    const props = result![0].properties
    expect(props).not.toContain('{')
    expect(props).not.toContain('}')
    expect(props.every(p => !p.startsWith('//') && !p.startsWith('/*'))).toBe(true)
  })

  it('extracts Rust enum type with correct kind', async () => {
    const nameNode = makeMockNode({
      text: 'Color', type: 'type_identifier', row: 0,
      parentType: 'enum_item',
    })
    const bodyNode = { text: '{\n  Red,\n  Green,\n  Blue,\n}' }

    mockParseFile.mockResolvedValue(fakeTree())
    mockQueryTree.mockResolvedValue([makeMatch(nameNode, bodyNode)])

    const result = await extractTypesTreeSitter('code', 'rust')
    expect(result![0].kind).toBe('enum')
  })
})

// =========================================================================
// extractClassesTreeSitter
// =========================================================================

describe('extractClassesTreeSitter', () => {
  it('returns null for a language without class queries', async () => {
    const result = await extractClassesTreeSitter('code', 'go')
    expect(result).toBeNull()
  })

  it('returns null for an unknown language', async () => {
    const result = await extractClassesTreeSitter('code', 'unknown')
    expect(result).toBeNull()
  })

  it('returns null when isLanguageSupported returns false', async () => {
    mockIsLanguageSupported.mockReturnValue(false)
    const result = await extractClassesTreeSitter('code', 'java')
    expect(result).toBeNull()
  })

  it('returns null when parseFile returns null', async () => {
    mockParseFile.mockResolvedValue(null)
    const result = await extractClassesTreeSitter('code', 'java')
    expect(result).toBeNull()
  })

  it('extracts Java class with methods, properties, and extends', async () => {
    const nameNode = makeMockNode({
      text: 'AdminUser', type: 'identifier', row: 5,
      parentType: 'class_declaration',
      parentFields: {
        modifiers: { text: 'public', type: 'modifiers' },
        superclass: { text: 'BaseUser', type: 'type_identifier' },
      },
    })

    const methodChild = {
      type: 'method_declaration',
      childForFieldName: (n: string) => n === 'name' ? { text: 'getPermissions' } : null,
      namedChildren: [],
    }
    const fieldChild = {
      type: 'field_declaration',
      childForFieldName: (n: string) => n === 'name' ? { text: 'role' } : null,
      namedChildren: [],
    }
    const bodyNode = { text: '{}', namedChildren: [methodChild, fieldChild] }

    mockParseFile.mockResolvedValue(fakeTree())
    mockQueryTree.mockResolvedValue([{ pattern: 0, captures: { name: [nameNode], body: [bodyNode] } }])

    const result = await extractClassesTreeSitter('code', 'java')
    expect(result).toHaveLength(1)
    expect(result![0]).toMatchObject({
      name: 'AdminUser', methods: ['getPermissions'], properties: ['role'],
      extends: 'BaseUser', exported: true,
    })
  })

  it('extracts Rust impl block as class', async () => {
    const nameNode = makeMockNode({
      text: 'Server', type: 'type_identifier', row: 10, parentType: 'impl_item',
      parentFields: { visibility: { text: 'pub', type: 'visibility_modifier' } },
    })
    const fnChild = {
      type: 'function_item',
      childForFieldName: (n: string) => n === 'name' ? { text: 'start' } : null,
      namedChildren: [],
    }
    const bodyNode = { text: '{}', namedChildren: [fnChild] }

    mockParseFile.mockResolvedValue(fakeTree())
    mockQueryTree.mockResolvedValue([{ pattern: 0, captures: { name: [nameNode], body: [bodyNode] } }])

    const result = await extractClassesTreeSitter('code', 'rust')
    expect(result).toHaveLength(1)
    expect(result![0]).toMatchObject({ name: 'Server', methods: ['start'], exported: true })
  })

  it('skips constructor and __init__ from methods', async () => {
    const nameNode = makeMockNode({ text: 'Widget', type: 'identifier', row: 0, parentType: 'class_declaration' })
    const ctorChild = {
      type: 'method_declaration',
      childForFieldName: (n: string) => n === 'name' ? { text: 'constructor' } : null,
      namedChildren: [],
    }
    const initChild = {
      type: 'method_declaration',
      childForFieldName: (n: string) => n === 'name' ? { text: '__init__' } : null,
      namedChildren: [],
    }
    const normalChild = {
      type: 'method_declaration',
      childForFieldName: (n: string) => n === 'name' ? { text: 'render' } : null,
      namedChildren: [],
    }
    const bodyNode = { text: '{}', namedChildren: [ctorChild, initChild, normalChild] }

    mockParseFile.mockResolvedValue(fakeTree())
    mockQueryTree.mockResolvedValue([{ pattern: 0, captures: { name: [nameNode], body: [bodyNode] } }])

    const result = await extractClassesTreeSitter('code', 'java')
    expect(result![0].methods).toEqual(['render'])
  })

  it('returns empty methods/properties when body has no relevant children', async () => {
    const nameNode = makeMockNode({ text: 'Empty', type: 'identifier', row: 0, parentType: 'class_declaration' })
    const bodyNode = { text: '{}', namedChildren: [] }

    mockParseFile.mockResolvedValue(fakeTree())
    mockQueryTree.mockResolvedValue([{ pattern: 0, captures: { name: [nameNode], body: [bodyNode] } }])

    const result = await extractClassesTreeSitter('code', 'java')
    expect(result![0].methods).toEqual([])
    expect(result![0].properties).toEqual([])
  })
})

// =========================================================================
// Python-specific tests
// =========================================================================

describe('extractSymbolsTreeSitter — Python', () => {
  it('extracts Python class and function symbols', async () => {
    const classNode = makeMockNode({
      text: 'UserService', type: 'identifier', row: 2,
      parentType: 'class_definition',
    })
    const funcNode = makeMockNode({
      text: 'create_user', type: 'identifier', row: 10,
      parentType: 'function_definition',
    })

    mockParseFile.mockResolvedValue(fakeTree())
    mockQueryTree.mockResolvedValue([makeMatch(classNode), makeMatch(funcNode)])

    const result = await extractSymbolsTreeSitter('code', 'python')
    expect(result).toEqual([
      { name: 'UserService', kind: 'class', line: 3, isExported: true },
      { name: 'create_user', kind: 'function', line: 11, isExported: true },
    ])
  })

  it('extracts decorated definitions with correct kinds', async () => {
    const decoratedClassNode = makeMockNode({
      text: 'Config', type: 'identifier', row: 5,
      parentType: 'decorated_definition',
      parentFields: {
        definition: { text: 'class Config:', type: 'class_definition' },
      },
    })
    const decoratedFuncNode = makeMockNode({
      text: 'get_items', type: 'identifier', row: 12,
      parentType: 'decorated_definition',
      parentFields: {
        definition: { text: 'def get_items():', type: 'function_definition' },
      },
    })

    mockParseFile.mockResolvedValue(fakeTree())
    mockQueryTree.mockResolvedValue([makeMatch(decoratedClassNode), makeMatch(decoratedFuncNode)])

    const result = await extractSymbolsTreeSitter('code', 'python')
    expect(result).toHaveLength(2)
    expect(result![0]).toMatchObject({ name: 'Config', kind: 'class' })
    expect(result![1]).toMatchObject({ name: 'get_items', kind: 'function' })
  })

  it('detects Python underscore-prefixed symbols as not exported', async () => {
    const privateFunc = makeMockNode({
      text: '_internal_helper', type: 'identifier', row: 0,
      parentType: 'function_definition',
    })
    const privateClass = makeMockNode({
      text: '_PrivateModel', type: 'identifier', row: 5,
      parentType: 'class_definition',
    })

    mockParseFile.mockResolvedValue(fakeTree())
    mockQueryTree.mockResolvedValue([makeMatch(privateFunc), makeMatch(privateClass)])

    const result = await extractSymbolsTreeSitter('code', 'python')
    expect(result![0].isExported).toBe(false)
    expect(result![1].isExported).toBe(false)
  })

  it('detects public Python symbols as exported', async () => {
    const publicFunc = makeMockNode({
      text: 'process_data', type: 'identifier', row: 0,
      parentType: 'function_definition',
    })

    mockParseFile.mockResolvedValue(fakeTree())
    mockQueryTree.mockResolvedValue([makeMatch(publicFunc)])

    const result = await extractSymbolsTreeSitter('code', 'python')
    expect(result![0].isExported).toBe(true)
  })
})

describe('extractTypesTreeSitter — Python', () => {
  it('extracts Python class as type with properties', async () => {
    const nameNode = makeMockNode({
      text: 'UserModel', type: 'identifier', row: 3,
      parentType: 'class_definition',
    })
    const bodyNode = { text: ':\n  name: str\n  age: int\n  email: str' }

    mockParseFile.mockResolvedValue(fakeTree())
    mockQueryTree.mockResolvedValue([makeMatch(nameNode, bodyNode)])

    const result = await extractTypesTreeSitter('code', 'python')
    expect(result).toHaveLength(1)
    expect(result![0]).toMatchObject({
      name: 'UserModel',
      kind: 'interface',
      exported: true,
    })
    expect(result![0].properties.length).toBeGreaterThan(0)
  })

  it('detects underscore-prefixed Python types as not exported', async () => {
    const nameNode = makeMockNode({
      text: '_InternalConfig', type: 'identifier', row: 0,
      parentType: 'class_definition',
    })
    const bodyNode = { text: ':\n  value: int' }

    mockParseFile.mockResolvedValue(fakeTree())
    mockQueryTree.mockResolvedValue([makeMatch(nameNode, bodyNode)])

    const result = await extractTypesTreeSitter('code', 'python')
    expect(result![0].exported).toBe(false)
  })
})

describe('extractClassesTreeSitter — Python', () => {
  it('extracts Python class with methods and superclass', async () => {
    const nameNode = makeMockNode({
      text: 'AdminUser', type: 'identifier', row: 4,
      parentType: 'class_definition',
      parentFields: {
        superclasses: { text: 'BaseUser', type: 'argument_list' },
      },
    })

    const methodChild = {
      type: 'function_definition',
      childForFieldName: (n: string) => n === 'name' ? { text: 'get_permissions' } : null,
      namedChildren: [],
    }
    const initChild = {
      type: 'function_definition',
      childForFieldName: (n: string) => n === 'name' ? { text: '__init__' } : null,
      namedChildren: [],
    }
    const bodyNode = { text: ':', namedChildren: [initChild, methodChild] }

    mockParseFile.mockResolvedValue(fakeTree())
    mockQueryTree.mockResolvedValue([{ pattern: 0, captures: { name: [nameNode], body: [bodyNode] } }])

    const result = await extractClassesTreeSitter('code', 'python')
    expect(result).toHaveLength(1)
    expect(result![0]).toMatchObject({
      name: 'AdminUser',
      methods: ['get_permissions'],
      exported: true,
    })
    // __init__ should be excluded
    expect(result![0].methods).not.toContain('__init__')
  })

  it('extracts Python class with decorated methods', async () => {
    const nameNode = makeMockNode({
      text: 'Service', type: 'identifier', row: 0,
      parentType: 'class_definition',
    })

    const decoratedChild = {
      type: 'decorated_definition',
      childForFieldName: (n: string) => {
        if (n === 'definition') return {
          type: 'function_definition',
          childForFieldName: (fn: string) => fn === 'name' ? { text: 'static_method' } : null,
        }
        return null
      },
      namedChildren: [],
    }
    const bodyNode = { text: ':', namedChildren: [decoratedChild] }

    mockParseFile.mockResolvedValue(fakeTree())
    mockQueryTree.mockResolvedValue([{ pattern: 0, captures: { name: [nameNode], body: [bodyNode] } }])

    const result = await extractClassesTreeSitter('code', 'python')
    expect(result![0].methods).toContain('static_method')
  })

  it('extracts Python typed class attributes as properties', async () => {
    const nameNode = makeMockNode({
      text: 'Config', type: 'identifier', row: 0,
      parentType: 'class_definition',
    })

    const propChild = {
      type: 'expression_statement',
      namedChildren: [{
        type: 'assignment',
        namedChildren: [{ type: 'identifier', text: 'timeout' }],
      }],
      childForFieldName: () => null,
    }
    const bodyNode = { text: ':', namedChildren: [propChild] }

    mockParseFile.mockResolvedValue(fakeTree())
    mockQueryTree.mockResolvedValue([{ pattern: 0, captures: { name: [nameNode], body: [bodyNode] } }])

    const result = await extractClassesTreeSitter('code', 'python')
    expect(result![0].properties).toContain('timeout')
  })

  it('detects underscore-prefixed Python class as not exported', async () => {
    const nameNode = makeMockNode({
      text: '_InternalService', type: 'identifier', row: 0,
      parentType: 'class_definition',
    })
    const bodyNode = { text: ':', namedChildren: [] }

    mockParseFile.mockResolvedValue(fakeTree())
    mockQueryTree.mockResolvedValue([{ pattern: 0, captures: { name: [nameNode], body: [bodyNode] } }])

    const result = await extractClassesTreeSitter('code', 'python')
    expect(result![0].exported).toBe(false)
  })
})
