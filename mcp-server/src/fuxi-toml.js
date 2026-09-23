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
// 路径在文档里的"被定义成了什么"。标准 TOML 要求同一路径只能有一种身份：
// 值、内联表（不可再扩展）、[table] 表、dotted key 建的表、表头隐式建出的父表、
// 或数组表。只看字面重复是抓不到 value/table 重定义的（内联表与 dotted key 都会
// 建立命名空间），因此必须按路径追踪语义身份。
const DEFINITION_KIND = Object.freeze({
  VALUE: 'value',
  INLINE_TABLE: 'inline-table',
  TABLE: 'table',
  DOTTED: 'dotted',
  IMPLICIT: 'implicit',
  ARRAY_OF_TABLES: 'array-of-tables'
});
// 伏羲只管理自己条目的这三个字段；Codex 还支持 env_vars / startup_timeout_sec
// 等字段，凡是用户自己加的都不属于我们，绝不能在重写时丢弃。
const MANAGED_SERVER_KEYS = new Set(['command', 'args', 'env']);
// 伏羲安装器写进自己条目的环境变量白名单（与 bootstrap.js 的 mcpEntry 对应）。
// env 里除此之外的任何变量都是用户资产：重写会丢，因此必须探测出来。
// FUXI_CONNECT_CODE 保留在白名单里有两个作用：一是历史版本可能把连接码写进过
// 用户配置，列入白名单才能在重写时被清掉（而不是被当成用户资产 fail closed 挡住）；
// 二是现行安装器已不再写入它，见 bootstrap.js 的 mcpEntry()。
const FUXI_MANAGED_ENV_KEYS = Object.freeze([
  'FUXI_API_URL',
  'FUXI_CREDENTIALS_FILE',
  'FUXI_MCP_TARGET',
  'FUXI_INSTALL_ROOT',
  'FUXI_SKILL_TARGET',
  'FUXI_CONNECT_CODE'
]);
const MANAGED_ENV_KEY_SET = new Set(FUXI_MANAGED_ENV_KEYS);
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
  constructor(text, comments) {
    this.text = text;
    this.pos = 0;
    this.lineStarts = computeLineStarts(text);
    // 注释位置按需记录：重写只允许落在没有用户注释的区间上。
    this.comments = comments || null;
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
    const start = this.pos;
    while (!this.atEnd() && this.peek() !== '\n') this.pos += 1;
    if (this.comments) this.comments.push({ start, end: this.pos });
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

  // 内联表内部同样要区分"由 dotted key 建立的命名空间"与"由内联表值建立的命名空间"：
  // 后者是自包含的，之后（包括同一表达式内）不得再被 dotted key 扩展。
  assignInline(table, path, value, kinds) {
    let current = table;
    for (let index = 0; index < path.length - 1; index += 1) {
      const key = path[index];
      const localKey = JSON.stringify(path.slice(0, index + 1));
      const kind = kinds.get(localKey);
      if (kind === 'inline-table') this.fail('Cannot extend an inline table with a dotted key');
      if (kind === 'value') this.fail(`Cannot overwrite a value with a table`);
      if (!kind) kinds.set(localKey, 'dotted');
      if (!Object.prototype.hasOwnProperty.call(current, key)) current[key] = {};
      if (!current[key] || typeof current[key] !== 'object' || Array.isArray(current[key])) {
        this.fail(`Duplicate key "${path.join('.')}"`);
      }
      current = current[key];
    }
    const last = path[path.length - 1];
    if (Object.prototype.hasOwnProperty.call(current, last)) this.fail(`Duplicate key "${path.join('.')}"`);
    kinds.set(JSON.stringify(path), isPlainTable(value) ? 'inline-table' : 'value');
    current[last] = value;
  }

  readInlineTable() {
    this.pos += 1;
    const table = {};
    const kinds = new Map();
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
      this.assignInline(table, path, value, kinds);
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
  const comments = [];
  const scanner = new Scanner(body, comments);
  const tables = [];
  const rootAssignments = [];
  const rootKeys = new Set();
  // 语义定义表：作用域路径 -> DEFINITION_KIND。用于拒绝 TOML 语义上的重定义
  // （值当表用、内联表再扩展、dotted key 与 [table] 互相覆盖等）。
  const definitions = new Map();
  // 容器身份与当前 AoT 元素索引分离：键只包含祖先 AoT 的元素身份，
  // 不包含当前容器自己的元素索引。重复 [[a]] 因而仍指向同一个容器；
  // [[a.b]] 则按父级 a 元素分别拥有容器。
  const arrayOfTables = new Map();
  const lineStarts = scanner.lineStarts;
  const containerKey = parts => {
    const segments = [];
    let parentKey = null;
    for (let index = 0; index < parts.length; index += 1) {
      segments.push([
        parts[index],
        parentKey !== null && arrayOfTables.has(parentKey) ? arrayOfTables.get(parentKey) : null
      ]);
      parentKey = JSON.stringify(segments);
    }
    return parentKey;
  };
  // 作用域键：路径里每个数组表前缀都拼上"当前元素下标"，于是 [[a]] 的每个元素
  // 拥有独立命名空间（合法的重复 AoT 元素互不干扰），而元素内部的
  // value/table/inline-table 重定义仍旧照常检出——不再整体跳过 AoT 子树。
  const scopeKey = parts => {
    const segments = [];
    for (let index = 1; index <= parts.length; index += 1) {
      const prefix = parts.slice(0, index);
      const key = containerKey(prefix);
      segments.push([
        parts[index - 1],
        arrayOfTables.has(key) ? arrayOfTables.get(key) : null
      ]);
    }
    return JSON.stringify(segments);
  };
  const kindOf = parts => definitions.get(scopeKey(parts));
  const define = (parts, kind) => definitions.set(scopeKey(parts), kind);
  const semanticError = (message, position) => {
    const line = lineNumberAt(lineStarts, position);
    throw new TomlError('TOML_INVALID', `${message} (line ${line})`, { line });
  };
  // [table] 表头：祖先不能是值/内联表；自身不能被声明过（隐式父表可以被显式声明）。
  const defineTablePath = (headerPath, isArrayOfTables, position) => {
    for (let index = 1; index < headerPath.length; index += 1) {
      const prefix = headerPath.slice(0, index);
      const kind = kindOf(prefix);
      if (kind === DEFINITION_KIND.VALUE) semanticError('Cannot overwrite a value with a table', position);
      if (kind === DEFINITION_KIND.INLINE_TABLE) semanticError('Cannot extend an inline table', position);
      if (!kind) define(prefix, DEFINITION_KIND.IMPLICIT);
    }
    if (isArrayOfTables) {
      const key = containerKey(headerPath);
      if (!arrayOfTables.has(key)) {
        if (kindOf(headerPath)) {
          semanticError(`Cannot redefine "${headerPath.join('.')}" as an array of tables`, position);
        }
        arrayOfTables.set(key, 0);
        define(headerPath, DEFINITION_KIND.ARRAY_OF_TABLES);
        return;
      }
      // 重复 [[...]] 表示"新元素"：下标 +1，作用域随之切到全新命名空间。
      arrayOfTables.set(key, arrayOfTables.get(key) + 1);
      return;
    }
    if (arrayOfTables.has(containerKey(headerPath))) {
      semanticError(`Cannot declare array-of-tables "${headerPath.join('.')}" as a table`, position);
    }
    const existing = kindOf(headerPath);
    if (existing === DEFINITION_KIND.VALUE) semanticError('Cannot overwrite a value with a table', position);
    if (existing === DEFINITION_KIND.INLINE_TABLE) semanticError('Cannot extend an inline table', position);
    if (existing && existing !== DEFINITION_KIND.IMPLICIT) {
      semanticError(`Cannot declare table "${headerPath.join('.')}" twice`, position);
    }
    define(headerPath, DEFINITION_KIND.TABLE);
  };
  // 赋值（含 dotted key）：中间段建立/沿用命名空间，末段写值。
  const defineValuePath = (scopePath, assignmentPath, value, position) => {
    const fullPath = scopePath.concat(assignmentPath);
    for (let index = 1; index < assignmentPath.length; index += 1) {
      const prefix = scopePath.concat(assignmentPath.slice(0, index));
      const kind = kindOf(prefix);
      if (kind === DEFINITION_KIND.VALUE) semanticError('Cannot overwrite a value with a table', position);
      if (kind === DEFINITION_KIND.INLINE_TABLE) semanticError('Cannot mutate an inline table', position);
      if (kind === DEFINITION_KIND.TABLE) {
        semanticError(`Cannot redefine table "${prefix.join('.')}" with a dotted key`, position);
      }
      if (!kind) define(prefix, DEFINITION_KIND.DOTTED);
    }
    const existing = kindOf(fullPath);
    if (existing) semanticError(`Cannot overwrite "${fullPath.join('.')}"`, position);
    define(fullPath, isPlainTable(value)
      ? DEFINITION_KIND.INLINE_TABLE
      : DEFINITION_KIND.VALUE);
  };
  let current = null;
  let lastStatementEnd = 0;

  for (;;) {
    scanner.skipTrivia();
    if (scanner.atEnd()) break;
    const statementStart = scanner.pos;
    if (scanner.peek() === '[') {
      const header = scanner.readTableHeader();
      defineTablePath(header.path, header.arrayOfTables, statementStart);
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
    defineValuePath(current ? current.path : [], path, value, statementStart);
    const assignment = { path, value, start: statementStart, end: scanner.pos };
    if (current) current.assignments.push(assignment);
    else rootAssignments.push(assignment);
    scanner.skipSpaces();
    scanner.skipComment();
    if (!scanner.atEnd() && !scanner.consumeNewline()) scanner.fail('Unexpected content after value');
    // statementEnd 含行尾注释与换行：整"行"都属于这条语句，重写会整行替换。
    assignment.statementEnd = scanner.pos;
    lastStatementEnd = scanner.pos;
  }

  return {
    text,
    body,
    bom,
    tables,
    rootAssignments,
    lastStatementEnd,
    lineStarts: scanner.lineStarts,
    comments,
    lineEnding: body.includes('\r\n') ? '\r\n' : '\n'
  };
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

function isPlainTable(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

// 列出伏羲条目里不由我们管理的字段、子表和 env 变量。任何一项非空都表示
// "重写会丢用户数据"，调用方据此 fail closed，而不是静默删除。
// env 需要逐键判断：伏羲只拥有 FUXI_* 白名单，用户加的 NODE_OPTIONS / HTTP_PROXY
// 等同样属于用户资产，三种写法（内联 env 表、点号键、[....env] 子表）都要覆盖。
function unmanagedServerContent(document, name) {
  const fields = [];
  const envKeys = [];
  const addEnvKey = key => {
    if (MANAGED_ENV_KEY_SET.has(key)) return;
    if (!envKeys.includes(key)) envKeys.push(key);
  };
  for (const table of document.tables) {
    const path = table.path;
    if (path[0] !== 'mcp_servers' || path[1] !== name) continue;
    if (path.length === 2) {
      for (const assignment of table.assignments) {
        const [head, ...rest] = assignment.path;
        if (head === 'env') {
          if (!rest.length) {
            if (isPlainTable(assignment.value)) Object.keys(assignment.value).forEach(addEnvKey);
            else fields.push(`mcp_servers.${name}.env`);
          } else {
            addEnvKey(rest.join('.'));
          }
          continue;
        }
        if (MANAGED_SERVER_KEYS.has(head) && !rest.length) continue;
        fields.push(assignment.path.join('.'));
      }
      continue;
    }
    if (path.length === 3 && path[2] === 'env') {
      for (const assignment of table.assignments) {
        if (assignment.path.length === 1) addEnvKey(assignment.path[0]);
        else fields.push(`mcp_servers.${name}.env.${assignment.path.join('.')}`);
      }
      continue;
    }
    fields.push(path.join('.'));
  }
  return { fields, envKeys };
}

// 未管理内容的完整路径清单（env 变量按 mcp_servers.<name>.env.<KEY> 展开）。
function unmanagedPaths(name, found) {
  return [
    ...found.fields,
    ...found.envKeys.map(key => `mcp_servers.${name}.env.${key}`)
  ];
}

function sameStringArray(expected, actual) {
  if (!Array.isArray(expected) || !Array.isArray(actual)) return false;
  if (expected.length !== actual.length) return false;
  return expected.every((value, index) => value === actual[index]);
}

// 只保留白名单里的键（伏羲写进去的那几个）。用户加的变量不参与"是否已匹配"的判断：
// 它们的存在不代表需要重写，只有伏羲自己的值变了才算需要重写。
function managedEnvProjection(env) {
  const source = isPlainTable(env) ? env : {};
  const projection = {};
  for (const key of FUXI_MANAGED_ENV_KEYS) {
    if (Object.prototype.hasOwnProperty.call(source, key)) projection[key] = source[key];
  }
  return projection;
}

function sameStringMap(left, right) {
  const leftKeys = Object.keys(left);
  if (leftKeys.length !== Object.keys(right).length) return false;
  return leftKeys.every(key => Object.prototype.hasOwnProperty.call(right, key)
    && String(left[key]) === String(right[key]));
}

// 判断条目是否已经完全是伏羲要写入的内容。为真时不做任何重写，用户的注释与额外
// 字段因此逐字节保持原样（重复接入必须是空操作）。
function entryMatchesEntry(expected, actual) {
  if (!isPlainTable(actual)) return false;
  if (String(expected.command) !== String(actual.command)) return false;
  if (!sameStringArray(expected.args || [], actual.args || [])) return false;
  return sameStringMap(managedEnvProjection(expected.env), managedEnvProjection(actual.env));
}

// 被替换区间内的用户注释（含表头与赋值之间、赋值之间、行尾注释）。
// 区间末尾到下一个表头之间的注释不在替换范围内，会被原样保留，因此不算阻塞项。
function commentLinesIn(document, start, end) {
  const lines = [];
  for (const comment of document.comments) {
    if (comment.start < start || comment.start >= end) continue;
    const line = lineNumberAt(document.lineStarts, comment.start);
    if (!lines.includes(line)) lines.push(line);
  }
  return lines;
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
  const unmanagedEnv = {};
  for (const name of names) {
    const found = unmanagedServerContent(document, name);
    const paths = unmanagedPaths(name, found);
    if (paths.length) unmanaged[name] = paths;
    if (found.envKeys.length) unmanagedEnv[name] = found.envKeys;
  }
  return { names, servers, unmanaged, unmanagedEnv };
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

// 重写前把"会被替换掉的区间"里所有用户内容列出来。只要区间落在用户写的内容上
// （未知字段、未知 env 变量、任何注释），就 fail closed，不做有损重写。
// 注意：只有"确实需要重写"时才会走到这里 —— 条目已经匹配时 upsert 直接返回空操作。
function assertRewritePreservesUserContent(document, name, start, end) {
  const found = unmanagedServerContent(document, name);
  const paths = unmanagedPaths(name, found);
  const commentLines = commentLinesIn(document, start, end);
  if (!paths.length && !commentLines.length) return;
  const reasons = [];
  if (found.fields.length) reasons.push(`不管理的字段/子表：${found.fields.join(', ')}`);
  if (found.envKeys.length) reasons.push(`不管理的环境变量：${found.envKeys.join(', ')}`);
  if (commentLines.length) reasons.push(`用户注释（第 ${commentLines.join(', ')} 行）`);
  throw new TomlError(
    'TOML_UNSUPPORTED',
    `[mcp_servers.${name}] 需要重写，但它含有${reasons.join('；')}；重写会丢失这些用户内容，请先人工确认如何处理`,
    { server: name, unmanaged: paths, unmanagedEnvKeys: found.envKeys, commentLines }
  );
}

// Replaces only the [mcp_servers.<name>] region. The returned text keeps every
// unrelated byte untouched. When the entry already carries exactly the managed
// values nothing is rewritten, so repeated installs are byte-for-byte idempotent
// even if the user added their own keys or comments to the block.
function upsertMcpServer(text, name, entry) {
  const document = parseDocument(text);
  assertSupportedDocument(document);
  const body = document.body;
  const blocks = document.tables.filter(table => table.path.length >= 2
    && table.path[0] === 'mcp_servers' && table.path[1] === name);

  // 空操作优先于一切检查：条目已经是我们要写入的内容时，用户的注释和额外字段
  // 都不需要被触碰，重复接入必须逐字节不变。
  if (blocks.length && entryMatchesEntry(entry, readServerEntry(document, name))) {
    return { text, changed: false };
  }

  const rendered = renderMcpServerBlock(name, entry, document.lineEnding);
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
  // 用 statementEnd（含行尾注释与换行）而不是 end（值之后）：整行都属于本条目，
  // 否则行尾注释会被当成"块外空白"而被搬走，用户注释的归属就被悄悄改掉了。
  const lastStatementEnd = lastBlock.assignments.length
    ? lastBlock.assignments[lastBlock.assignments.length - 1].statementEnd
    : lastBlock.headerEnd;
  // 被替换的区间是 [firstStart, lastStatementEnd)；末尾到下一个表头之间只可能是
  // 空白与注释（TOML 语法保证），原样保留以避免删除用户注释。
  assertRewritePreservesUserContent(document, name, firstStart, lastStatementEnd);
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
  FUXI_MANAGED_ENV_KEYS,
  parseDocument,
  readMcpServers,
  upsertMcpServer,
  unmanagedServerContent,
  renderMcpServerBlock
};
