const inputSql = document.getElementById('inputSql');
const outputSql = document.getElementById('outputSql');
const formatBtn = document.getElementById('formatBtn');
const copyBtn = document.getElementById('copyBtn');

const INDENT = '    ';
const SEP_LINE = '-------------------------------------------------------------------------------';

formatBtn.addEventListener('click', () => {
  outputSql.value = formatSql(inputSql.value);
});

copyBtn.addEventListener('click', async () => {
  if (!outputSql.value) return;
  await navigator.clipboard.writeText(outputSql.value);
});

function normalizeLineEndings(text) {
  return text.replace(/\r\n?/g, '\n');
}

function compressBlankLines(text) {
  return text.replace(/\n{3,}/g, '\n\n');
}

function splitOutInlineComment(line) {
  let quote = null;

  for (let i = 0; i < line.length - 1; i += 1) {
    const ch = line[i];
    const next = line[i + 1];

    if (!quote && (ch === '"' || ch === "'")) {
      quote = ch;
      continue;
    }

    if (quote && ch === quote) {
      quote = null;
      continue;
    }

    if (!quote && ch === '-' && next === '-') {
      return {
        code: line.slice(0, i).trimEnd(),
        comment: line.slice(i)
      };
    }
  }

  return { code: line, comment: '' };
}

function detectBlockCommentStart(line) {
  const { code, comment } = splitOutInlineComment(line);
  if (comment.startsWith('--')) return false;
  return code.includes('/*');
}

function formatNoLock(line) {
  return line
    .replace(/\bWITH\s*\(\s*NOLOCK\s*\)/gi, '( NOLOCK )')
    .replace(/\(\s*NOLOCK\s*\)/gi, '( NOLOCK )');
}

function mapAsAliasToEquals(line) {
  return line.replace(/(.+?)\s+AS\s+([\[\]A-Za-z0-9_]+)/gi, (m, expr, alias) => `${alias} = ${expr.trim()}`);
}

function normalizeFunctions(line) {
  return line.replace(/([A-Za-z_][A-Za-z0-9_]*)\s*\(/g, '$1 (');
}

function tokenizeSelectItems(segment) {
  const out = [];
  let depth = 0;
  let quote = null;
  let current = '';

  for (let i = 0; i < segment.length; i += 1) {
    const ch = segment[i];

    if (!quote && (ch === '"' || ch === "'")) {
      quote = ch;
      current += ch;
      continue;
    }

    if (quote && ch === quote) {
      quote = null;
      current += ch;
      continue;
    }

    if (!quote && ch === '(') depth += 1;
    if (!quote && ch === ')' && depth > 0) depth -= 1;

    if (!quote && depth === 0 && ch === ',') {
      out.push(current.trim());
      current = '';
      continue;
    }

    current += ch;
  }

  if (current.trim()) out.push(current.trim());
  return out;
}

function standardizeSeparator(line) {
  if (/^-{8,}\s*$/.test(line.trim())) {
    return SEP_LINE;
  }
  return line;
}

function formatSelectItems(line, indent) {
  const match = line.match(/^(\s*)SELECT\s+(.+)$/i);
  if (!match) return [line];

  const items = tokenizeSelectItems(match[2]);
  if (items.length <= 1) return [`${indent}SELECT   ${mapAsAliasToEquals(normalizeFunctions(match[2]))}`];

  const rows = [`${indent}SELECT   ${mapAsAliasToEquals(normalizeFunctions(items[0]))}`];
  for (let i = 1; i < items.length; i += 1) {
    rows.push(`${indent}       , ${mapAsAliasToEquals(normalizeFunctions(items[i]))}`);
  }
  return rows;
}

function formatClauseAlignment(line, indent) {
  const trimmed = line.trim();

  const joinMatch = trimmed.match(/^(LEFT|RIGHT|INNER|FULL|CROSS)?\s*JOIN\b\s*(.*)$/i);
  if (joinMatch) {
    const prefix = joinMatch[1] ? `${joinMatch[1].toUpperCase()} JOIN` : 'JOIN';
    return `${indent}         ${prefix} ${joinMatch[2]}`.trimEnd();
  }

  if (/^FROM\b/i.test(trimmed)) return `${indent}FROM     ${trimmed.replace(/^FROM\s*/i, '')}`;
  if (/^ON\b/i.test(trimmed)) return `${indent}         ON       ${trimmed.replace(/^ON\s*/i, '')}`;
  if (/^WHERE\b/i.test(trimmed)) return `${indent}WHERE    ${trimmed.replace(/^WHERE\s*/i, '')}`;
  if (/^GROUP\s+BY\b/i.test(trimmed)) return `${indent}GROUP BY ${trimmed.replace(/^GROUP\s+BY\s*/i, '')}`;
  if (/^ORDER\s+BY\b/i.test(trimmed)) return `${indent}ORDER BY ${trimmed.replace(/^ORDER\s+BY\s*/i, '')}`;
  if (/^(AND|OR)\b/i.test(trimmed)) return `${indent}         ${trimmed}`;

  return `${indent}${trimmed}`;
}

function formatCreateTable(lines, start) {
  const out = [];
  const head = lines[start].trim();
  out.push(head.replace(/\s*\(\s*$/, ' ('));

  let i = start + 1;
  const cols = [];
  while (i < lines.length) {
    const t = lines[i].trim();
    if (t === ')') {
      break;
    }
    cols.push(lines[i]);
    i += 1;
  }

  const parsed = cols
    .map((line) => {
      const { code, comment } = splitOutInlineComment(line);
      if (!code.trim()) return null;
      if (/^CONSTRAINT\b/i.test(code.trim())) {
        return { raw: code.trim(), comment, constraint: true };
      }
      const clean = code.trim().replace(/^,\s*/, '');
      const m = clean.match(/^([\[\]A-Za-z0-9_]+)\s+(.+?)(\s+NOT\s+NULL|\s+NULL)?\s*$/i);
      if (!m) return { raw: clean, comment, free: true };
      return { name: m[1], type: m[2], nullable: (m[3] || '').trim(), comment, constraint: false };
    })
    .filter(Boolean);

  const maxName = Math.max(0, ...parsed.filter((p) => p.name).map((p) => p.name.length));
  const maxType = Math.max(0, ...parsed.filter((p) => p.type).map((p) => p.type.length));

  parsed.forEach((p, idx) => {
    const lead = idx === 0 ? '      ' : '    , ';
    if (p.constraint || p.free) {
      out.push(`${lead}${p.raw}${p.comment ? ` ${p.comment}` : ''}`.trimEnd());
      return;
    }
    const line = `${lead}${p.name.padEnd(maxName)} ${p.type.padEnd(maxType)} ${p.nullable || ''}`.trimEnd();
    out.push(`${line}${p.comment ? ` ${p.comment}` : ''}`.trimEnd());
  });

  out.push(')');
  return { block: out, end: i };
}

function formatSql(source) {
  const normalized = normalizeLineEndings(source);
  const rawLines = normalized.split('\n');
  const out = [];

  let indentDepth = 0;
  let inBlockComment = false;

  for (let i = 0; i < rawLines.length; i += 1) {
    const original = rawLines[i];
    const line = standardizeSeparator(original.replace(/\s+$/g, ''));
    const trimmed = line.trim();

    if (!trimmed) {
      out.push('');
      continue;
    }

    if (/^CREATE\s+TABLE\b/i.test(trimmed)) {
      const { block, end } = formatCreateTable(rawLines, i);
      out.push(...block);
      i = end;
      continue;
    }

    if (inBlockComment) {
      out.push(line);
      if (trimmed.includes('*/')) inBlockComment = false;
      continue;
    }

    if (/^--\s*$/.test(trimmed)) {
      continue;
    }

    if (/^--/.test(trimmed)) {
      out.push(`${INDENT.repeat(indentDepth)}${trimmed}`);
      continue;
    }

    if (detectBlockCommentStart(line) && !trimmed.startsWith('/*')) {
      const idx = line.indexOf('/*');
      const left = line.slice(0, idx).trimEnd();
      const right = line.slice(idx);
      if (left) out.push(`${INDENT.repeat(indentDepth)}${left}`);
      out.push(`${INDENT.repeat(indentDepth)}${right}`);
      if (!right.includes('*/')) inBlockComment = true;
      continue;
    }

    if (trimmed.startsWith('/*')) {
      out.push(`${INDENT.repeat(indentDepth)}${line.trim()}`);
      if (!trimmed.includes('*/')) inBlockComment = true;
      continue;
    }

    if (/^END\b/i.test(trimmed)) {
      indentDepth = Math.max(0, indentDepth - 1);
    }

    const indent = trimmed === SEP_LINE ? '' : INDENT.repeat(indentDepth);

    if (/^SELECT\b/i.test(trimmed)) {
      const lines = formatSelectItems(trimmed, indent);
      out.push(...lines.map((l) => formatNoLock(formatClauseAlignment(l, ''))));
    } else {
      let current = mapAsAliasToEquals(normalizeFunctions(formatNoLock(trimmed)));

      if (/^FROM\s*\($/i.test(current)) {
        out.push(`${indent}FROM     (`);
      } else if (/^GROUP\s+BY\b/i.test(current) || /^ORDER\s+BY\b/i.test(current)) {
        const m = current.match(/^(GROUP\s+BY|ORDER\s+BY)\s+(.+)$/i);
        const items = tokenizeSelectItems(m[2]);
        out.push(formatClauseAlignment(`${m[1]} ${items[0]}`, indent));
        for (let j = 1; j < items.length; j += 1) {
          out.push(`${indent}         , ${items[j]}`);
        }
      } else {
        out.push(formatClauseAlignment(current, indent));
      }
    }

    if (/\bBEGIN\b/i.test(trimmed) && !/^END\b/i.test(trimmed)) {
      indentDepth += 1;
    }
  }

  return compressBlankLines(out.join('\n')).trimEnd() + '\n';
}

inputSql.value = `CREATE TABLE dbo.Example (
    T_LU_ID INT NOT NULL,
    U_SYMBOLS VARCHAR(6) NOT NULL, --CHAR (1)
    T_LF_SPEC TEXT NOT NULL,
    CONSTRAINT PK_Example PRIMARY KEY (T_LU_ID)
)

SELECT a.Id AS item_id, a.Name AS item_name, IIF(a.Flag=1,'Y','N') AS is_active
FROM dbo.Items WITH (NOLOCK)
LEFT JOIN dbo.ItemChild c WITH (NOLOCK)
ON a.Id = c.ItemId
AND c.Active = 1
WHERE a.Active = 1
AND a.Name IS NOT NULL
ORDER BY a.Name, a.Id`;
