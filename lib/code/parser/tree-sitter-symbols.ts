// Tree-sitter-based symbol, type, and class extraction.
// Async — requires WASM. Returns null when unsupported/fails → caller falls back to regex.

import type { ExtractedSymbol } from '@/components/features/code/hooks/use-symbol-extraction'
import type { ExtractedType, ExtractedClass } from './types'
import { parseFile, queryTree, isLanguageSupported, type TSNode } from '@/lib/parsers/tree-sitter'

// ---------------------------------------------------------------------------
// Per-language S-expression queries
// ---------------------------------------------------------------------------

interface LanguageQueries {
  symbols: string
  types?: string
  classes?: string
}

const QUERIES: Record<string, LanguageQueries> = {
  java: {
    symbols: `[
      (class_declaration name: (identifier) @name)
      (method_declaration name: (identifier) @name)
      (interface_declaration name: (identifier) @name)
      (enum_declaration name: (identifier) @name)
      (constructor_declaration name: (identifier) @name)
    ]`,
    types: `[
      (interface_declaration name: (identifier) @name body: (interface_body) @body)
      (enum_declaration name: (identifier) @name body: (enum_body) @body)
    ]`,
    classes: `(class_declaration name: (identifier) @name body: (class_body) @body)`,
  },
  go: {
    symbols: `[
      (function_declaration name: (identifier) @name)
      (method_declaration name: (field_identifier) @name)
      (type_declaration (type_spec name: (type_identifier) @name))
    ]`,
    types: `[
      (type_declaration (type_spec name: (type_identifier) @name type: (struct_type) @body))
      (type_declaration (type_spec name: (type_identifier) @name type: (interface_type) @body))
    ]`,
  },
  rust: {
    symbols: `[
      (function_item name: (identifier) @name)
      (struct_item name: (type_identifier) @name)
      (enum_item name: (type_identifier) @name)
      (trait_item name: (type_identifier) @name)
      (const_item name: (identifier) @name)
    ]`,
    types: `[
      (struct_item name: (type_identifier) @name body: (field_declaration_list) @body)
      (enum_item name: (type_identifier) @name body: (enum_variant_list) @body)
      (trait_item name: (type_identifier) @name body: (declaration_list) @body)
    ]`,
    classes: `(impl_item type: (_) @name body: (declaration_list) @body)`,
  },
  c: {
    symbols: `[
      (function_definition declarator: (function_declarator declarator: (identifier) @name))
      (struct_specifier name: (type_identifier) @name)
      (enum_specifier name: (type_identifier) @name)
    ]`,
    types: `[
      (struct_specifier name: (type_identifier) @name body: (field_declaration_list) @body)
      (enum_specifier name: (type_identifier) @name body: (enumerator_list) @body)
    ]`,
  },
  cpp: {
    symbols: `[
      (function_definition declarator: (function_declarator declarator: (_) @name))
      (class_specifier name: (type_identifier) @name)
      (struct_specifier name: (type_identifier) @name)
      (enum_specifier name: (type_identifier) @name)
      (namespace_definition name: (namespace_identifier) @name)
    ]`,
    types: `[
      (struct_specifier name: (type_identifier) @name body: (field_declaration_list) @body)
      (enum_specifier name: (type_identifier) @name body: (enumerator_list) @body)
    ]`,
    classes: `(class_specifier name: (type_identifier) @name body: (field_declaration_list) @body)`,
  },
  ruby: {
    symbols: `[
      (class name: (constant) @name)
      (method name: (identifier) @name)
      (module name: (constant) @name)
      (singleton_method name: (identifier) @name)
    ]`,
    classes: `(class name: (constant) @name body: (body_statement) @body)`,
  },
  php: {
    symbols: `[
      (class_declaration name: (name) @name)
      (function_definition name: (name) @name)
      (interface_declaration name: (name) @name)
      (method_declaration name: (name) @name)
      (trait_declaration name: (name) @name)
    ]`,
    types: `(interface_declaration name: (name) @name body: (declaration_list) @body)`,
    classes: `(class_declaration name: (name) @name body: (declaration_list) @body)`,
  },
  kotlin: {
    symbols: `[
      (class_declaration (type_identifier) @name)
      (function_declaration (simple_identifier) @name)
      (object_declaration (type_identifier) @name)
    ]`,
    classes: `(class_declaration (type_identifier) @name (class_body) @body)`,
  },
  swift: {
    symbols: `[
      (class_declaration name: (type_identifier) @name)
      (function_declaration name: (simple_identifier) @name)
      (protocol_declaration name: (type_identifier) @name)
      (struct_declaration name: (type_identifier) @name)
      (enum_declaration name: (type_identifier) @name)
    ]`,
    types: `[
      (struct_declaration name: (type_identifier) @name body: (class_body) @body)
      (protocol_declaration name: (type_identifier) @name body: (protocol_body) @body)
      (enum_declaration name: (type_identifier) @name body: (enum_class_body) @body)
    ]`,
    classes: `(class_declaration name: (type_identifier) @name body: (class_body) @body)`,
  },
  csharp: {
    symbols: `[
      (class_declaration name: (identifier) @name)
      (method_declaration name: (identifier) @name)
      (interface_declaration name: (identifier) @name)
      (struct_declaration name: (identifier) @name)
      (enum_declaration name: (identifier) @name)
    ]`,
    types: `[
      (interface_declaration name: (identifier) @name body: (declaration_list) @body)
      (struct_declaration name: (identifier) @name body: (declaration_list) @body)
      (enum_declaration name: (identifier) @name body: (enum_member_declaration_list) @body)
    ]`,
    classes: `(class_declaration name: (identifier) @name body: (declaration_list) @body)`,
  },
}

// ---------------------------------------------------------------------------
// Kind inference
// ---------------------------------------------------------------------------

const NODE_KIND_MAP: Record<string, ExtractedSymbol['kind']> = {
  class_declaration: 'class', method_declaration: 'method',
  interface_declaration: 'interface', enum_declaration: 'enum',
  constructor_declaration: 'method',
  function_declaration: 'function', function_item: 'function',
  struct_item: 'class', enum_item: 'enum', trait_item: 'interface',
  const_item: 'variable', impl_item: 'class',
  function_definition: 'function',
  class_specifier: 'class', struct_specifier: 'type', enum_specifier: 'enum',
  namespace_definition: 'class',
  class: 'class', method: 'method', module: 'class', singleton_method: 'method',
  trait_declaration: 'class', object_declaration: 'class',
  protocol_declaration: 'interface', struct_declaration: 'type',
}

function inferSymbolKind(node: TSNode, language: string): ExtractedSymbol['kind'] {
  const parentType = node.parent?.type ?? ''
  if (language === 'go' && parentType === 'method_declaration') return 'method'
  if (language === 'go' && parentType === 'type_spec') return 'type'
  if (language === 'php' && parentType === 'function_definition') return 'function'
  if (language === 'php' && parentType === 'method_declaration') return 'method'
  if (language === 'kotlin' && parentType === 'function_declaration') return 'function'
  if (language === 'kotlin' && (parentType === 'class_declaration' || parentType === 'object_declaration')) return 'class'
  if (language === 'swift' && parentType === 'function_declaration') return 'function'
  if (language === 'cpp' && parentType === 'namespace_definition') return 'class'
  return NODE_KIND_MAP[parentType] ?? 'function'
}

// ---------------------------------------------------------------------------
// Export / visibility detection
// ---------------------------------------------------------------------------

function isNodeExported(node: TSNode, language: string): boolean {
  const parent = node.parent
  if (!parent) return false

  switch (language) {
    case 'java':
    case 'kotlin':
    case 'csharp': {
      const modifiers = parent.childForFieldName('modifiers')
        ?? parent.namedChildren.find(c => c.type.includes('modifier'))
      return modifiers ? modifiers.text.includes('public') : true
    }
    case 'go':
      return /^[A-Z]/.test(node.text)
    case 'rust':
      return parent.childForFieldName('visibility') != null
    case 'php': {
      const mods = parent.childForFieldName('modifiers')
        ?? parent.namedChildren.find(c => c.type === 'visibility_modifier')
      return mods ? mods.text.includes('public') : parent.type === 'function_definition'
    }
    case 'swift': {
      const mods = parent.childForFieldName('modifiers')
        ?? parent.namedChildren.find(c => c.type === 'modifiers')
      return mods ? (mods.text.includes('public') || mods.text.includes('open')) : true
    }
    default:
      return true
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Extract symbols via Tree-sitter. Returns null if unsupported → fall back to regex. */
export async function extractSymbolsTreeSitter(
  content: string,
  language: string,
): Promise<ExtractedSymbol[] | null> {
  const queries = QUERIES[language]
  if (!queries || !isLanguageSupported(language)) return null

  const tree = await parseFile(content, language)
  if (!tree) return null

  try {
    const matches = await queryTree(tree, language, queries.symbols)
    const symbols: ExtractedSymbol[] = []
    for (const match of matches) {
      const nameNodes = match.captures['name']
      if (!nameNodes?.length) continue
      const nameNode = nameNodes[0]
      symbols.push({
        name: nameNode.text,
        kind: inferSymbolKind(nameNode, language),
        line: nameNode.startPosition.row + 1,
        isExported: isNodeExported(nameNode, language),
      })
    }
    return symbols
  } catch {
    return null
  } finally {
    tree.delete()
  }
}

/** Extract types via Tree-sitter. Returns null if unsupported. */
export async function extractTypesTreeSitter(
  content: string,
  language: string,
): Promise<ExtractedType[] | null> {
  const queries = QUERIES[language]
  if (!queries?.types || !isLanguageSupported(language)) return null

  const tree = await parseFile(content, language)
  if (!tree) return null

  try {
    const matches = await queryTree(tree, language, queries.types)
    const types: ExtractedType[] = []
    for (const match of matches) {
      const nameNodes = match.captures['name']
      if (!nameNodes?.length) continue
      const nameNode = nameNodes[0]
      const bodyText = match.captures['body']?.[0]?.text ?? ''
      const properties = bodyText
        .split('\n')
        .map(l => l.trim())
        .filter(l => l && !l.startsWith('//') && !l.startsWith('/*') && l !== '{' && l !== '}')
      types.push({
        name: nameNode.text,
        kind: inferTypeKind(nameNode),
        properties,
        exported: isNodeExported(nameNode, language),
      })
    }
    return types
  } catch {
    return null
  } finally {
    tree.delete()
  }
}

/** Extract classes via Tree-sitter. Returns null if unsupported. */
export async function extractClassesTreeSitter(
  content: string,
  language: string,
): Promise<ExtractedClass[] | null> {
  const queries = QUERIES[language]
  if (!queries?.classes || !isLanguageSupported(language)) return null

  const tree = await parseFile(content, language)
  if (!tree) return null

  try {
    const matches = await queryTree(tree, language, queries.classes)
    const classes: ExtractedClass[] = []
    for (const match of matches) {
      const nameNodes = match.captures['name']
      if (!nameNodes?.length) continue
      const nameNode = nameNodes[0]
      const bodyNode = match.captures['body']?.[0]
      const methods: string[] = []
      const properties: string[] = []
      if (bodyNode) extractMembersFromBody(bodyNode, language, methods, properties)

      classes.push({
        name: nameNode.text,
        methods,
        properties,
        extends: findExtends(nameNode, language) ?? undefined,
        implements: findImplements(nameNode, language) ?? undefined,
        exported: isNodeExported(nameNode, language),
      })
    }
    return classes
  } catch {
    return null
  } finally {
    tree.delete()
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function inferTypeKind(node: TSNode): 'interface' | 'type' | 'enum' {
  const parentType = node.parent?.type ?? ''
  if (parentType.includes('enum')) return 'enum'
  if (parentType.includes('interface') || parentType.includes('trait') || parentType.includes('protocol')) return 'interface'
  return 'interface'
}

function extractMembersFromBody(
  bodyNode: TSNode,
  language: string,
  methods: string[],
  properties: string[],
): void {
  for (const child of bodyNode.namedChildren) {
    const type = child.type
    if (
      type === 'method_declaration' || type === 'method_definition' ||
      type === 'function_definition' || type === 'function_declaration' ||
      type === 'function_item'
    ) {
      const name = child.childForFieldName('name')
      if (name && name.text !== 'constructor' && name.text !== '__init__') {
        methods.push(name.text)
      }
      continue
    }
    if (type === 'field_declaration' || type === 'property_declaration' || type === 'variable_declaration') {
      const name = child.childForFieldName('name')
        ?? child.childForFieldName('declarator')?.childForFieldName('name')
      if (name) properties.push(name.text)
      continue
    }
  }
}

function findExtends(nameNode: TSNode, language: string): string | null {
  const decl = nameNode.parent
  if (!decl) return null
  const superclass = decl.childForFieldName('superclass') ?? decl.childForFieldName('supertype')
  if (superclass) return superclass.text
  if (language === 'cpp') {
    const baseClause = decl.namedChildren.find(c => c.type === 'base_class_clause')
    const first = baseClause?.namedChildren.find(c => c.type === 'type_identifier')
    if (first) return first.text
  }
  return null
}

function findImplements(nameNode: TSNode, _language: string): string[] | null {
  const decl = nameNode.parent
  if (!decl) return null
  const interfaces = decl.childForFieldName('interfaces')
  if (interfaces) return interfaces.namedChildren.map(c => c.text)
  return null
}
