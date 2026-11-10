/**
 * Minimal SQL lexer helpers. These do not parse SQL; they only need to be
 * reliable about comments, string literals, quoted identifiers, dollar quotes
 * and parenthesis depth, so that keyword checks are not fooled by text that
 * appears inside a string or a comment.
 */

/** Replace comments with a space and the contents of literals with blanks. */
export function maskSql(sql: string): string {
  let out = '';
  let i = 0;
  const n = sql.length;
  while (i < n) {
    const c = sql[i];
    const next = sql[i + 1];
    // -- line comment
    if (c === '-' && next === '-') {
      while (i < n && sql[i] !== '\n') i++;
      out += ' ';
      continue;
    }
    // /* block comment */ (Postgres allows nesting)
    if (c === '/' && next === '*') {
      let depth = 1;
      i += 2;
      while (i < n && depth > 0) {
        if (sql[i] === '/' && sql[i + 1] === '*') {
          depth++;
          i += 2;
        } else if (sql[i] === '*' && sql[i + 1] === '/') {
          depth--;
          i += 2;
        } else i++;
      }
      out += ' ';
      continue;
    }
    // 'string' with '' escapes (also covers E'..' and B'..' prefixes)
    if (c === "'") {
      out += "'";
      i++;
      while (i < n) {
        if (sql[i] === "'" && sql[i + 1] === "'") {
          out += '  ';
          i += 2;
        } else if (sql[i] === '\\' && i > 0) {
          // conservative: treat backslash escapes as two masked chars
          out += '  ';
          i += 2;
        } else if (sql[i] === "'") {
          break;
        } else {
          out += sql[i] === '\n' ? '\n' : ' ';
          i++;
        }
      }
      out += "'";
      i++;
      continue;
    }
    // "quoted identifier"
    if (c === '"') {
      out += '"';
      i++;
      while (i < n) {
        if (sql[i] === '"' && sql[i + 1] === '"') {
          out += '  ';
          i += 2;
        } else if (sql[i] === '"') break;
        else {
          out += 'x';
          i++;
        }
      }
      out += '"';
      i++;
      continue;
    }
    // $tag$ dollar quoting $tag$
    if (c === '$') {
      const m = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(sql.slice(i));
      if (m) {
        const tag = m[0];
        const end = sql.indexOf(tag, i + tag.length);
        const stop = end === -1 ? n : end + tag.length;
        out += "'" + ' '.repeat(Math.max(0, stop - i - 2)) + "'";
        i = stop;
        continue;
      }
    }
    out += c;
    i++;
  }
  return out;
}

/**
 * Split on top-level semicolons. Returns the original text of each
 * non-empty statement, trimmed, without the trailing semicolon.
 */
export function splitStatements(sql: string): string[] {
  const parts: string[] = [];
  let start = 0;
  for (const p of semicolonPositions(sql)) {
    parts.push(sql.slice(start, p));
    start = p + 1;
  }
  parts.push(sql.slice(start));
  return parts.map((s) => s.trim()).filter((s) => maskSql(s).trim().length > 0);
}

/** Positions of semicolons that are not inside comments or literals. */
function semicolonPositions(sql: string): number[] {
  const out: number[] = [];
  let i = 0;
  const n = sql.length;
  while (i < n) {
    const c = sql[i];
    const next = sql[i + 1];
    if (c === '-' && next === '-') {
      while (i < n && sql[i] !== '\n') i++;
      continue;
    }
    if (c === '/' && next === '*') {
      let depth = 1;
      i += 2;
      while (i < n && depth > 0) {
        if (sql[i] === '/' && sql[i + 1] === '*') {
          depth++;
          i += 2;
        } else if (sql[i] === '*' && sql[i + 1] === '/') {
          depth--;
          i += 2;
        } else i++;
      }
      continue;
    }
    if (c === "'" || c === '"') {
      const q = c;
      i++;
      while (i < n) {
        if (sql[i] === q && sql[i + 1] === q) i += 2;
        else if (sql[i] === q) break;
        else i++;
      }
      i++;
      continue;
    }
    if (c === '$') {
      const m = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(sql.slice(i));
      if (m) {
        const end = sql.indexOf(m[0], i + m[0].length);
        i = end === -1 ? n : end + m[0].length;
        continue;
      }
    }
    if (c === ';') out.push(i);
    i++;
  }
  return out;
}

/** Upper-cased words of the masked SQL, outside literals and comments. */
export function keywords(sql: string): string[] {
  return (maskSql(sql).match(/[A-Za-z_][A-Za-z0-9_$]*/g) ?? []).map((w) => w.toUpperCase());
}

export function firstKeyword(sql: string): string | null {
  const m = /[A-Za-z_][A-Za-z0-9_]*/.exec(maskSql(sql));
  return m ? m[0].toUpperCase() : null;
}

/**
 * True when the statement has an ORDER BY at parenthesis depth 0, i.e. one
 * that orders the final result rather than a subquery or window.
 */
export function hasTopLevelOrderBy(sql: string): boolean {
  const masked = maskSql(sql);
  let depth = 0;
  const re = /\(|\)|\bORDER\s+BY\b/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(masked))) {
    if (m[0] === '(') depth++;
    else if (m[0] === ')') depth = Math.max(0, depth - 1);
    else if (depth === 0) return true;
  }
  return false;
}

/** Collapse whitespace and case outside literals, for de-duplication. */
export function normalizeForCompare(sql: string): string {
  return sql
    .replace(/;\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** Plain string literals ('…') in the SQL, de-duplicated, for seeding test data. */
export function stringLiterals(sql: string, max = 20): string[] {
  const out = new Set<string>();
  const masked = maskSql(sql);
  const re = /'/g;
  let open = -1;
  let m: RegExpExecArray | null;
  // maskSql keeps quote characters in place and blanks their contents,
  // so quote positions in the masked text line up with the original.
  while ((m = re.exec(masked))) {
    if (open === -1) open = m.index;
    else {
      const raw = sql.slice(open + 1, m.index).replace(/''/g, "'");
      if (raw.length > 0 && raw.length <= 100 && !sql.slice(Math.max(0, open - 1), open).match(/[A-Za-z]/)) out.add(raw);
      open = -1;
      if (out.size >= max) break;
    }
  }
  return [...out];
}
