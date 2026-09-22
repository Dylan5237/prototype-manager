'use strict';

// Dependency-free TOML subset reader/writer for the Codex user config
// (~/.codex/config.toml). This module ships inside the standalone Bootstrap
// bundle, so it must not require any third-party package.
//
// Contract:
// - The whole document is scanned up front. Anything outside the supported
//   subset fails closed with a TomlError, so a caller never rewrites a file it
//   could not fully understand.
// - Only [mcp_servers.<name>] and its sub-tables are rewritten. Every other
//   byte of the file is preserved, including unrelated Codex settings.

const BARE_KEY_RE = /^[A-Za-z0-9_-]+$/;
// 伏羲只管理自己条目的这三个字段；Codex 还支持 env_vars / startup_timeout_sec
// 等字段，凡是用户自己加的都不属于我们，绝不能在重写时丢弃。
const MANAGED_SERVER_KEYS = new Set(['command', 'args', 'env']);
const MANAGED_SERVER_TABLES = new Set(['env']);
const BARE_KEY_TOKEN_RE = /[A-Za-z0-9_-]+/y;
const INTEGER_RE = /^[+-]?(?:0[xX][0-9A-Fa-f](?:_?[0-9A-Fa-f])*|0[oO][0-7](?:_?[0-7])*|0[bB][01](?:_?[01])*|(?:0|[1-9](?:_?\d)*))$/;
const FLOAT_RE = /^[+-]?(?:0|[1-9](?:_?\d)*)(?:\.\d(?:_?\d)*)?(?:[eE][+-]?\d(?:_?\d)*)?$/;
const SPECIAL_FLOAT_RE = /^[+-]?(?:inf|nan)$/;
const OFFSET_DATE_TIME_RE = /^\d{4}-\d{2}-\d{2}(?:[Tt ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:[Zz]|[+-]\d{2}:\d{2})?)?$/;
const LOCAL_TIME_RE = /^\d{2}:\d{2}:\d{2}(?:\.\d+)?$/;

class TomlError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'TomlError';
    this.code = code;
    this.details = details;
  }
}

const unsupported = (message, details) => new TomlError('TOML_UNSUPPORTED', message, details);

function computeLineStarts(text) {
  const starts = [0];
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === '\n') starts.push(index + 1);
  }
  return starts;
}

function lineNumberAt(lineStarts, position) {
  let low = 0;
  let high = lineStarts.length - 1;
  while (low < high) {
    const middle = (low + high + 1) >> 1;
    if (lineStarts[middle] <= position) low = middle;
    else high = middle - 1;
  }
  return low + 1;
}

class Scanner {
  constructor(text) {
    this.text = text;
    this.pos = 0;
    this.lineStarts = computeLineStarts(text);
  }

  atEnd() {
    return this.pos >= this.text.length;
  }

  peek(offset = 0) {
    return this.text[this.pos + offset];
  }

  startsWith(token) {
    return this.text.startsWith(token, this.pos);
  }

  line() {
    const position = this.pos >= this.text.length ? Math.max(0, this.text.length - 1) : this.pos;
    return lineNumberAt(this.lineStarts, position);
  }

  fail(message) {
    const line = this.line();
    throw new TomlError('TOML_INVALID', `${message} (line ${line})`, { line });
  }

  skipSpaces() {
    while (!this.atEnd() && (this.peek() === ' ' || this.peek() === '\t')) this.pos += 1;
  }

  skipComment() {
    if (this.peek() !== '#') return;
    while (!this.atEnd() && this.peek() !== '\n') this.pos += 1;
  }

  consumeNewline() {
    if (this.peek() === '\r' && this.peek(1) === '\n') {
      this.pos += 2;
      return true;
    }
    if (this.peek() === '\n') {
      this.pos += 1;
      return true;
    }
    return false;
  }

  skipTrivia() {
    for (;;) {
      this.skipSpaces();
      this.skipComment();
      if (this.consumeNewline()) continue;
      return;
    }
  }

  readEscape(multiline) {
    this.pos += 1;
    if (this.atEnd()) this.fail('Unterminated escape sequence');
    const char = this.peek();
    const simple = { b: '\b', t: '\t', n: '\n', f: '\f', r: '\r', '"': '"', '\\': '\\' };
    if (Object.prototype.hasOwnProperty.call(simple, char)) {
      this.pos += 1;
      return simple[char];
    }
    if (multiline && (char === '\n' || char === '\r' || char === ' ' || char === '\t')) {
      while (!this.atEnd() && (this.peek() === ' ' || this.peek() === '\t')) this.pos += 1;
      if (!this.consumeNewline()) this.fail('Invalid escape sequence');
      while (!this.atEnd() && [' ', '\t', '\n', '\r'].includes(this.peek())) {
        if (this.peek() === '\r' && this.peek(1) === '\n') this.pos += 2;
        else this.pos += 1;
      }
      return '';
    }
    if (char === 'u' || char === 'U') {
      const length = char === 'u' ? 4 : 8;
      const hex = this.text.slice(this.pos + 1, this.pos + 1 + length);
      if (!new RegExp(`^[0-9A-Fa-f]{${length}}$`).test(hex)) this.fail('Invalid unicode escape');
      this.pos += 1 + length;
      return String.fromCodePoint(parseInt(hex, 16));
    }
    return this.fail(`Unsupported escape sequence "\\${char}"`);
  }

  readString(literal, multiline) {
    const quote = literal ? "'" : '"';
    this.pos += multiline ? 3 : 1;
    let out = '';
    for (;;) {
      if (this.atEnd()) this.fail('Unterminated string');
      const char = this.peek();
      if (multiline && this.startsWith(quote.repeat(3))) {
        let run = 0;
        while (this.peek(run) === quote) run += 1;
        const consumed = Math.min(run, 5);
        out += quote.repeat(consumed - 3);
        this.pos += consumed;
        return out;
      }
      if (!multiline && char === quote) {
        this.pos += 1;
        return out;
      }
      if (char === '\r') {
        if (this.peek(1) !== '\n') {
          if (!multiline) this.fail('Unterminated string');
          out += '\r';
          this.pos += 1;
          continue;
        }
        this.pos += 2;
        out += '\n';
        continue;
      }
      if (char === '\n') {
        if (!multiline) this.fail('Unterminated string');
        out += '\n';
        this.pos += 1;
        continue;
      }
      if (!literal && char === '\\') {
        out += this.readEscape(multiline);
        continue;
      }
      out += char;
      this.pos += 1;
    }
  }

  readKeySegment() {
    const char = this.peek();
    if (char === '"' || char === "'") return this.readString(char === "'", false);
    BARE_KEY_TOKEN_RE.lastIndex = this.pos;
    const match = BARE_KEY_TOKEN_RE.exec(this.text);
    if (!match) return this.fail('Expected a key segment');
    this.pos += match[0].length;
    return match[0];
  }

  readKeyPath() {
    const path = [this.readKeySegment()];
    for (;;) {
      this.skipSpaces();
      if (this.peek() !== '.') return path;
      this.pos += 1;
      this.skipSpaces();
      path.push(this.readKeySegment());
    }
  }

  readBareValue() {
    const start = this.pos;
    while (!this.atEnd() && ![',', ']', '}', '#', '\n', '\r'].includes(this.peek())) this.pos += 1;
    const raw = this.text.slice(start, this.pos).trim();
    if (!raw) return this.fail('Expected a value');
    if (raw === 'true' || raw === 'false') return raw === 'true';
    if (INTEGER_RE.test(raw) || FLOAT_RE.test(raw) || SPECIAL_FLOAT_RE.test(raw)
      || OFFSET_DATE_TIME_RE.test(raw) || LOCAL_TIME_RE.test(raw)) {
      return raw;
    }
    return this.fail(`Unsupported or malformed value "${raw}"`);
  }

  readArray() {
    this.pos += 1;
    const items = [];
    for (;;) {
      this.skipTrivia();
      if (this.atEnd()) this.fail('Unterminated array');
      if (this.peek() === ']') {
        this.pos += 1;
        return items;
      }
      items.push(this.readValue());
      this.skipTrivia();
      if (this.peek() === ',') {
        this.pos += 1;
        continue;
      }
      if (this.peek() === ']') {
        this.pos += 1;
        return items;
      }
      this.fail('Expected "," or "]" in array');
    }
  }

  assignInline(table, path, value) {
    let current = table;
    for (let index = 0; index < path.length - 1; index += 1) {
      const key = path[index];
      if (!Object.prototype.hasOwnProperty.call(current, key)) current[key] = {};
      if (!current[key] || typeof current[key] !== 'object' || Array.isArray(current[key])) {
        this.fail(`Duplicate key "${path.join('.')}"`);
      }
      current = current[key];
    }
    const last = path[path.length - 1];
    if (Object.prototype.hasOwnProperty.call(current, last)) this.fail(`Duplicate key "${path.join('.')}"`);
    current[last] = value;
  }

  readInlineTable() {
    this.pos += 1;
    const table = {};
    for (;;) {
      this.skipTrivia();
      if (this.atEnd()) this.fail('Unterminated inline table');
      if (this.peek() === '}') {
        this.pos += 1;
        return table;
      }
      const path = this.readKeyPath();
      this.skipSpaces();
      if (this.peek() !== '=') this.fail('Expected "=" in inline table');
      this.pos += 1;
      this.skipSpaces();
      const value = this.readValue();
      this.assignInline(table, path, value);
      this.skipTrivia();
      if (this.peek() === ',') {
        this.pos += 1;
        continue;
      }
      if (this.peek() === '}') {
        this.pos += 1;
        return table;
      }
      this.fail('Expected "," or "}" in inline table');
    }
  }

  readValue() {
    const char = this.peek();
    if (char === '"') return this.readString(false, this.startsWith('"""'));
    if (char === "'") return this.readString(true, this.startsWith("'''"));
    if (char === '[') return this.readArray();
    if (char === '{') return this.readInlineTable();
    return this.readBareValue();
  }

  readTableHeader() {
    this.pos += 1;
    let arrayOfTables = false;
    if (this.peek() === '[') {
      arrayOfTables = true;
      this.pos += 1;
    }
    this.skipSpaces();
    const path = this.readKeyPath();
    this.skipSpaces();
    if (this.peek() !== ']') this.fail('Expected "]" in table header');
    this.pos += 1;
    if (arrayOfTables) {
      if (this.peek() !== ']') this.fail('Expected "]]" in array-of-tables header');
      this.pos += 1;
    }
    return { path, arrayOfTables };
  }
}

function parseDocument(text) {
  const bom = text.charCodeAt(0) === 0xfeff;
  const body = bom ? text.slice(1) : text;
  const scanner = new Scanner(body);
  const tables = [];
  const rootAssignments = [];
  const rootKeys = new Set();
  const seenTables = new Set();
  let current = null;
  let lastStatementEnd = 0;

  for (;;) {
    scanner.skipTrivia();
    if (scanner.atEnd()) break;
    const statementStart = scanner.pos;
    if (scanner.peek() === '[') {
      const header = scanner.readTableHeader();
      const headerKey = `${header.arrayOfTables ? 'a' : 't'}:${header.path.join('\u0000')}`;
      if (!header.arrayOfTables && seenTables.has(headerKey)) {
        scanner.fail(`Duplicate table [${header.path.join('.')}]`);
      }
      seenTables.add(headerKey);
      scanner.skipSpaces();
      scanner.skipComment();
      if (!scanner.atEnd() && !scanner.consumeNewline()) scanner.fail('Unexpected content after table header');
      current = {
        path: header.path,
        arrayOfTables: header.arrayOfTables,
        headerStart: statementStart,
        headerEnd: scanner.pos,
        assignments: [],
        keys: new Set()
      };
      tables.push(current);
      lastStatementEnd = scanner.pos;
      continue;
    }
    const path = scanner.readKeyPath();
    scanner.skipSpaces();
    if (scanner.peek() !== '=') scanner.fail('Expected "=" after key');
    scanner.pos += 1;
    scanner.skipSpaces();
    const value = scanner.readValue();
    const keys = current ? current.keys : rootKeys;
    const assignmentKey = path.join('\u0000');
    if (keys.has(assignmentKey)) scanner.fail(`Duplicate key "${path.join('.')}"`);
    keys.add(assignmentKey);
    const assignment = { path, value, start: statementStart, end: scanner.pos };
    if (current) current.assignments.push(assignment);
    else rootAssignments.push(assignment);
    scanner.skipSpaces();
    scanner.skipComment();
    if (!scanner.atEnd() && !scanner.consumeNewline()) scanner.fail('Unexpected content after value');
    lastStatementEnd = scanner.pos;
  }

  return { text, body, bom, tables, rootAssignments, lastStatementEnd, lineEnding: body.includes('\r\n') ? '\r\n' : '\n' };
}

// The Fuxi installer writes only canonical [mcp_servers.<name>] tables. Any
// other representation of the same data is unverifiable for us, so it stops the
// install instead of being silently flattened or discarded.
function assertSupportedDocument(document) {
  for (const assignment of document.rootAssignments) {
    if (assignment.path[0] !== 'mcp_servers') continue;
    throw unsupported(
      'mcp_servers must be declared with [mcp_servers.<name>] tables; key, dotted-key and inline-table forms are not supported',
      { line: lineNumberAt(computeLineStarts(document.body), assignment.start) }
    );
  }
  for (const table of document.tables) {
    if (table.path[0] !== 'mcp_servers') continue;
    if (table.arrayOfTables) {
      throw unsupported('[[mcp_servers.*]] array-of-tables is not supported', {
        line: lineNumberAt(computeLineStarts(document.body), table.headerStart)
      });
    }
    if (table.path.length === 1 && table.assignments.length) {
      throw unsupported('servers must be declared as [mcp_servers.<name>] tables, not as keys inside [mcp_servers]', {
        line: lineNumberAt(computeLineStarts(document.body), table.assignments[0].start)
      });
    }
  }
}

function mcpServerNames(document) {
  const names = [];
  for (const table of document.tables) {
    if (table.path.length !== 2 || table.path[0] !== 'mcp_servers') continue;
    if (!names.includes(table.path[1])) names.push(table.path[1]);
  }
  return names;
}

function readServerEntry(document, name) {
  const block = document.tables.find(table => !table.arrayOfTables
    && table.path.length === 2 && table.path[0] === 'mcp_servers' && table.path[1] === name);
  const envBlock = document.tables.find(table => !table.arrayOfTables
    && table.path.length === 3 && table.path[0] === 'mcp_servers' && table.path[1] === name && table.path[2] === 'env');
  const entry = {};
  const env = {};
  if (block) {
    for (const assignment of block.assignments) {
      const [head, ...rest] = assignment.path;
      if (head === 'command' && !rest.length) entry.command = assignment.value;
      else if (head === 'args' && !rest.length) entry.args = assignment.value;
      else if (head === 'env' && !rest.length && assignment.value && typeof assignment.value === 'object' && !Array.isArray(assignment.value)) Object.assign(env, assignment.value);
      else if (head === 'env' && rest.length) env[rest.join('.')] = assignment.value;
    }
  }
  if (envBlock) {
    for (const assignment of envBlock.assignments) {
      if (assignment.path.length === 1) env[assignment.path[0]] = assignment.value;
    }
  }
  if (Object.keys(env).length) entry.env = env;
  return entry;
}

// 列出伏羲条目里不由我们管理的 assignment / 子表。返回非空表示"重写会丢用户数据"，
// 调用方据此 fail closed，而不是把用户字段静默删掉。
function unmanagedServerContent(document, name) {
  const extras = [];
  for (const table of document.tables) {
    const path = table.path;
    if (path[0] !== 'mcp_servers' || path[1] !== name) continue;
    if (path.length === 2) {
      for (const assignment of table.assignments) {
        const [head, ...rest] = assignment.path;
        if (MANAGED_SERVER_KEYS.has(head) && rest.length === 0) continue;
        if (head === 'env') continue;
        extras.push(assignment.path.join('.'));
      }
      continue;
    }
    if (path.length === 3 && MANAGED_SERVER_TABLES.has(path[2])) continue;
    extras.push(path.join('.'));
  }
  return extras;
}

// Returns the normalized view of mcp_servers that the installer compares and
// merges against. Throws TomlError for anything it cannot verify.
function readMcpServers(text) {
  const document = parseDocument(text);
  assertSupportedDocument(document);
  const names = mcpServerNames(document);
  const servers = {};
  for (const name of names) servers[name] = readServerEntry(document, name);
  const unmanaged = {};
  for (const name of names) {
    const extras = unmanagedServerContent(document, name);
    if (extras.length) unmanaged[name] = extras;
  }
  return { names, servers, unmanaged };
}

function renderKeySegment(key) {
  return BARE_KEY_RE.test(key) ? key : JSON.stringify(key);
}

function renderValue(value) {
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return `[${value.map(renderValue).join(', ')}]`;
  return JSON.stringify(String(value));
}

function renderMcpServerBlock(name, entry, lineEnding) {
  const head = `mcp_servers.${renderKeySegment(name)}`;
  const lines = [`[${head}]`, `command = ${renderValue(entry.command)}`];
  if (Array.isArray(entry.args)) lines.push(`args = ${renderValue(entry.args)}`);
  const env = entry.env && typeof entry.env === 'object' && !Array.isArray(entry.env) ? entry.env : {};
  const envKeys = Object.keys(env);
  if (envKeys.length) {
    lines.push('', `[${head}.env]`);
    for (const key of envKeys) lines.push(`${renderKeySegment(key)} = ${renderValue(env[key])}`);
  }
  return lines.join(lineEnding);
}

// Replaces only the [mcp_servers.<name>] region. The returned text keeps every
// unrelated byte untouched, and `changed` stays false when the entry already
// matches so a repeated install is byte-for-byte idempotent.
function upsertMcpServer(text, name, entry) {
  const document = parseDocument(text);
  assertSupportedDocument(document);
  const extras = unmanagedServerContent(document, name);
  if (extras.length) {
    throw new TomlError(
      'TOML_UNSUPPORTED',
      `[mcp_servers.${name}] 含有伏羲不管理的字段（${extras.join(', ')}）；重写会丢失这些用户配置，请先人工确认如何处理`,
      { unmanaged: extras, server: name }
    );
  }
  const rendered = renderMcpServerBlock(name, entry, document.lineEnding);
  const body = document.body;
  const blocks = document.tables.filter(table => table.path.length >= 2
    && table.path[0] === 'mcp_servers' && table.path[1] === name);

  if (!blocks.length) {
    const trimmed = body.replace(/[ \t\r\n]+$/, '');
    const prefix = trimmed ? document.lineEnding + document.lineEnding : '';
    const next = `${trimmed}${prefix}${rendered}${document.lineEnding}`;
    const nextText = `${document.bom ? '\ufeff' : ''}${next}`;
    return { text: nextText, changed: nextText !== text };
  }

  const indices = blocks.map(block => document.tables.indexOf(block));
  const firstIndex = Math.min(...indices);
  const lastIndex = Math.max(...indices);
  if (lastIndex - firstIndex !== indices.length - 1) {
    return throwUnsupported(`[mcp_servers.${name}] and its sub-tables must stay contiguous`, document, blocks[0].headerStart);
  }

  const firstStart = document.tables[firstIndex].headerStart;
  const regionEnd = document.tables[lastIndex + 1]
    ? document.tables[lastIndex + 1].headerStart
    : body.length;
  const lastBlock = document.tables[lastIndex];
  const lastStatementEnd = lastBlock.assignments.length
    ? lastBlock.assignments[lastBlock.assignments.length - 1].end
    : lastBlock.headerEnd;
  // 末尾到下一个表头之间只可能是空白与注释（TOML 语法保证）。原样保留，
  // 避免在用户注释上做静默删除；缺少换行时补一个，保证不会与表头粘连。
  const gap = body.slice(lastStatementEnd, regionEnd);
  const separator = /^[\r\n]/.test(gap) ? gap : `${document.lineEnding}${gap}`;
  const tail = `${rendered}${separator}`;
  const nextText = `${document.bom ? '\ufeff' : ''}${body.slice(0, firstStart)}${tail}${body.slice(regionEnd)}`;
  return { text: nextText, changed: nextText !== text };
}

function throwUnsupported(message, document, position) {
  throw unsupported(message, { line: lineNumberAt(computeLineStarts(document.body), position) });
}

module.exports = {
  TomlError,
  parseDocument,
  readMcpServers,
  upsertMcpServer,
  unmanagedServerContent,
  renderMcpServerBlock
};
