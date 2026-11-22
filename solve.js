// A faster drop-in for csv-reader 1.0.0: run(input) answers {columns, rows, errors}
// exactly as the reference does, for every input {text, header}. Written from the
// reference's written policy (RULES.txt), with its own structure:
//
//   - The text is scanned once, left to right. From a field boundary, the
//     fields up to the next quote (or the end of the line, when no quote lies
//     ahead) are split at once by the native split, stray CRs stripped and
//     counted as errors; only a field that opens with a quote, or holds one,
//     is read on its own, and even then with native scans: a quoted field's
//     closing quote is found with indexOf, and an unquoted field's end with
//     one regex pass for the next comma, LF or CR. Field values come out as
//     slices of the input, built up only when a field needs real work
//     (doubled quotes, CRs inside quotes, junk).
//   - Errors carry the record's start line and its index in rows (null for the
//     header), and are pushed in the order they are met, as the reference does.
//
// Pure: no clock, no randomness, no locale, nothing kept from one call to the
// next. Dependency-free ES module.

/** The next comma, LF or CR at or after a position (lastIndex set per call). */
const DELIM = /[,\n\r]/g;

/** How a field ended. */
const AT_COMMA = 0;
const AT_BREAK = 1;
const AT_END = 2;

/** csv-reader 1.0.0's answer for one case's input. */
export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const len = text.length;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;

  let pos = text.charCodeAt(0) === 0xfeff ? 1 : 0; // a U+FEFF at the very start is dropped
  let line = 1;

  // The record being read: the line it starts on, and the index in rows it takes.
  let recordLine = 1;
  let recordRow = null;

  // Reads an unquoted field from pos onto `value`: a CR not followed by LF is
  // dropped (stray_cr). Returns [value, ended, added]; added counts the
  // characters appended here (dropped CRs do not count).
  function readUnquoted(value) {
    let added = 0;
    for (;;) {
      DELIM.lastIndex = pos;
      const m = DELIM.exec(text);
      if (m === null) {
        if (pos < len) {
          value += text.slice(pos, len);
          added += len - pos;
        }
        pos = len;
        return [value, AT_END, added];
      }
      const at = m.index;
      const ch = m[0];
      if (ch === ',') {
        if (at > pos) {
          value += text.slice(pos, at);
          added += at - pos;
        }
        pos = at + 1;
        return [value, AT_COMMA, added];
      }
      if (ch === '\n') {
        if (at > pos) {
          value += text.slice(pos, at);
          added += at - pos;
        }
        pos = at + 1;
        line += 1;
        return [value, AT_BREAK, added];
      }
      // A CR: with an LF after it the record ends; alone it is dropped.
      if (at + 1 < len && text.charCodeAt(at + 1) === 10) {
        if (at > pos) {
          value += text.slice(pos, at);
          added += at - pos;
        }
        pos = at + 2;
        line += 1;
        return [value, AT_BREAK, added];
      }
      if (at > pos) {
        value += text.slice(pos, at);
        added += at - pos;
      }
      errors.push({ code: 'stray_cr', line: recordLine, row: recordRow });
      pos = at + 1;
    }
  }

  // Reads a quoted field whose opening quote is at pos. Returns [value, ended, 0].
  function readQuoted() {
    const open = pos;
    // Find the closing quote: the next quote that is not doubled.
    let p = pos + 1;
    let doubled = false;
    let close = -1;
    for (;;) {
      const q = text.indexOf('"', p);
      if (q === -1) break;
      if (q + 1 < len && text.charCodeAt(q + 1) === 34) {
        doubled = true;
        p = q + 2;
        continue;
      }
      close = q;
      break;
    }
    if (close === -1) {
      // The quote never closes: it is a literal character, and the text after
      // it is read again as an unquoted field. (No line was counted yet, so
      // there is nothing to undo.)
      errors.push({ code: 'unterminated_quote', line: recordLine, row: recordRow });
      pos = open + 1;
      return readUnquoted('"');
    }
    let value = text.slice(open + 1, close);
    // Line breaks inside the quotes: each LF, and each CR on its own, is one
    // line; each CRLF or lone CR in the value is read as one LF.
    const hasCR = value.indexOf('\r') !== -1;
    const hasNL = value.indexOf('\n') !== -1;
    if (hasCR || hasNL) {
      let breaks = 0;
      let i = value.indexOf('\n');
      while (i !== -1) {
        breaks += 1;
        i = value.indexOf('\n', i + 1);
      }
      let j = value.indexOf('\r');
      while (j !== -1) {
        if (j + 1 >= value.length || value.charCodeAt(j + 1) !== 10) breaks += 1;
        j = value.indexOf('\r', j + 1);
      }
      line += breaks;
      if (hasCR) value = value.replaceAll('\r\n', '\n').replaceAll('\r', '\n');
    }
    if (doubled) value = value.replaceAll('""', '"');
    pos = close + 1;
    if (pos >= len) return [value, AT_END, 0];
    const c = text.charCodeAt(pos);
    if (c === 44) {
      pos += 1;
      return [value, AT_COMMA, 0];
    }
    if (c === 10) {
      pos += 1;
      line += 1;
      return [value, AT_BREAK, 0];
    }
    if (c === 13 && pos + 1 < len && text.charCodeAt(pos + 1) === 10) {
      pos += 2;
      line += 1;
      return [value, AT_BREAK, 0];
    }
    // What follows the closing quote is appended as it stands, up to the next
    // comma or line break; quote_junk when the field ends with junk on it.
    const junk = readUnquoted(value);
    if (junk[2] > 0) {
      errors.push({ code: 'quote_junk', line: recordLine, row: recordRow });
    }
    return junk;
  }

  for (;;) {
    // Lines with no characters are no records.
    for (;;) {
      if (pos >= len) break;
      const c = text.charCodeAt(pos);
      if (c === 10) {
        pos += 1;
        line += 1;
        continue;
      }
      if (c === 13 && pos + 1 < len && text.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line += 1;
        continue;
      }
      break;
    }
    if (pos >= len) break;

    recordLine = line;
    recordRow = header && columns === null ? null : rows.length;

    // Read the record field by field, taking whole unquoted stretches in one
    // go: from a field boundary, the fields up to the next quote (or the end
    // of the line, when no quote lies ahead) are split at once; only a field
    // that opens with a quote, or holds one, is read on its own.
    const fields = [];
    let lastQuoted = false;
    let ended = AT_COMMA;
    while (ended === AT_COMMA) {
      if (text.charCodeAt(pos) === 34) {
        lastQuoted = true;
        const f = readQuoted();
        fields.push(f[0]);
        ended = f[1];
        continue;
      }
      lastQuoted = false;
      const nl2 = text.indexOf('\n', pos);
      const segEnd2 = nl2 === -1 ? len : nl2;
      const q2 = text.indexOf('"', pos);
      if (q2 === -1 || q2 >= segEnd2) {
        // No quote before the line ends: the rest of the record is unquoted.
        const raw = text.slice(pos, segEnd2);
        const ri = raw.indexOf('\r');
        if (ri === -1) {
          const rest = raw.split(',');
          for (let i = 0; i < rest.length; i++) fields.push(rest[i]);
        } else if (ri === raw.length - 1 && nl2 !== -1) {
          // The only CR is the CRLF ending: drop it, no errors.
          const rest = raw.slice(0, -1).split(',');
          for (let i = 0; i < rest.length; i++) fields.push(rest[i]);
        } else {
          const stripped = raw.replaceAll('\r', '');
          // Every CR but a trailing one before the LF is a stray CR, dropped.
          let nStray = raw.length - stripped.length;
          if (nl2 !== -1 && raw.charCodeAt(raw.length - 1) === 13) nStray -= 1;
          for (let i = 0; i < nStray; i++) {
            errors.push({ code: 'stray_cr', line: recordLine, row: recordRow });
          }
          const rest = stripped.split(',');
          for (let i = 0; i < rest.length; i++) fields.push(rest[i]);
        }
        if (nl2 === -1) pos = len;
        else {
          pos = nl2 + 1;
          line += 1;
        }
        ended = AT_BREAK;
        break;
      }
      // A quote lies ahead on this line. The stretch up to it holds no quote:
      // split it, and read on from the quote itself. The quote opens a quoted
      // field exactly when it stands right after a comma; otherwise it is a
      // literal character inside the field it sits in.
      const atBoundary = text.charCodeAt(q2 - 1) === 44;
      const raw = text.slice(pos, q2);
      let parts;
      if (raw.indexOf('\r') !== -1) {
        const stripped = raw.replaceAll('\r', '');
        // No LF lies before the quote, so every CR here is a stray CR.
        const nStray = raw.length - stripped.length;
        for (let i = 0; i < nStray; i++) {
          errors.push({ code: 'stray_cr', line: recordLine, row: recordRow });
        }
        parts = stripped.split(',');
      } else {
        parts = raw.split(',');
      }
      for (let i = 0; i < parts.length - 1; i++) fields.push(parts[i]);
      pos = q2;
      if (atBoundary) continue;
      const f = readUnquoted(parts[parts.length - 1]);
      fields.push(f[0]);
      ended = f[1];
    }
    // A line that held only stray CRs is left with no characters: no record
    // (its stray_cr errors stay).
    if (fields.length === 1 && fields[0] === '' && !lastQuoted) continue;

    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      continue;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }
  return { columns: header ? (columns ?? []) : null, rows, errors };
}
