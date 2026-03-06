import re
from typing import List, Tuple

INDENT = "    "
SEP_LINE = "-------------------------------------------------------------------------------"


def normalize_line_endings(text: str) -> str:
    return text.replace("\r\n", "\n").replace("\r", "\n")


def compress_blank_lines(text: str) -> str:
    return re.sub(r"\n{3,}", "\n\n", text)


def split_inline_comment(line: str) -> Tuple[str, str]:
    quote = None
    i = 0
    while i < len(line) - 1:
        ch = line[i]
        nxt = line[i + 1]
        if quote is None and ch in ('"', "'"):
            quote = ch
            i += 1
            continue
        if quote is not None and ch == quote:
            quote = None
            i += 1
            continue
        if quote is None and ch == "-" and nxt == "-":
            return line[:i].rstrip(), line[i:]
        i += 1
    return line, ""


def detect_block_comment_start(line: str) -> bool:
    code, comment = split_inline_comment(line)
    if comment.startswith("--"):
        return False
    return "/*" in code


def normalize_nolock(line: str) -> str:
    line = re.sub(r"\bWITH\s*\(\s*NOLOCK\s*\)", "( NOLOCK )", line, flags=re.I)
    line = re.sub(r"\(\s*NOLOCK\s*\)", "( NOLOCK )", line, flags=re.I)
    return line


def alias_as_equals(expr: str) -> str:
    return re.sub(r"(.+?)\s+AS\s+([\[\]A-Za-z0-9_]+)", lambda m: f"{m.group(2)} = {m.group(1).strip()}", expr, flags=re.I)


def normalize_functions(expr: str) -> str:
    return re.sub(r"([A-Za-z_][A-Za-z0-9_]*)\s*\(", r"\1 (", expr)


def tokenize_items(segment: str) -> List[str]:
    out, current = [], []
    depth = 0
    quote = None
    for ch in segment:
        if quote is None and ch in ('"', "'"):
            quote = ch
            current.append(ch)
            continue
        if quote is not None and ch == quote:
            quote = None
            current.append(ch)
            continue
        if quote is None and ch == "(":
            depth += 1
        elif quote is None and ch == ")" and depth > 0:
            depth -= 1
        if quote is None and depth == 0 and ch == ",":
            item = "".join(current).strip()
            if item:
                out.append(item)
            current = []
            continue
        current.append(ch)
    tail = "".join(current).strip()
    if tail:
        out.append(tail)
    return out


def align_clause(line: str, indent: str) -> str:
    t = line.strip()
    m = re.match(r"^(LEFT|RIGHT|INNER|FULL|CROSS)?\s*JOIN\b\s*(.*)$", t, flags=re.I)
    if m:
        pfx = f"{m.group(1).upper()} JOIN" if m.group(1) else "JOIN"
        return f"{indent}         {pfx} {m.group(2)}".rstrip()
    if re.match(r"^FROM\b", t, flags=re.I):
        val = re.sub(r"^FROM\s*", "", t, flags=re.I)
        return f"{indent}FROM     {val}"
    if re.match(r"^ON\b", t, flags=re.I):
        val = re.sub(r"^ON\s*", "", t, flags=re.I)
        return f"{indent}         ON       {val}"
    if re.match(r"^WHERE\b", t, flags=re.I):
        val = re.sub(r"^WHERE\s*", "", t, flags=re.I)
        return f"{indent}WHERE    {val}"
    if re.match(r"^GROUP\s+BY\b", t, flags=re.I):
        val = re.sub(r"^GROUP\s+BY\s*", "", t, flags=re.I)
        return f"{indent}GROUP BY {val}"
    if re.match(r"^ORDER\s+BY\b", t, flags=re.I):
        val = re.sub(r"^ORDER\s+BY\s*", "", t, flags=re.I)
        return f"{indent}ORDER BY {val}"
    if re.match(r"^(AND|OR)\b", t, flags=re.I):
        return f"{indent}         {t}"
    return f"{indent}{t}"


def format_select_line(line: str, indent: str) -> List[str]:
    m = re.match(r"^SELECT\s+(.+)$", line.strip(), flags=re.I)
    if not m:
        return [line]
    items = tokenize_items(m.group(1))
    if len(items) <= 1:
        return [f"{indent}SELECT   {alias_as_equals(normalize_functions(m.group(1)))}"]
    out = [f"{indent}SELECT   {alias_as_equals(normalize_functions(items[0]))}"]
    for item in items[1:]:
        out.append(f"{indent}       , {alias_as_equals(normalize_functions(item))}")
    return out


def format_create_table(lines: List[str], start: int):
    out = []
    out.append(re.sub(r"\s*\(\s*$", " (", lines[start].strip()))
    i = start + 1
    rows = []
    while i < len(lines):
        t = lines[i].strip()
        if t == ")":
            break
        if t:
            rows.append(lines[i])
        i += 1

    parsed = []
    for r in rows:
        code, comment = split_inline_comment(r)
        c = code.strip().lstrip(",").strip()
        if re.match(r"^CONSTRAINT\b", c, flags=re.I):
            parsed.append({"raw": c, "comment": comment, "constraint": True})
            continue
        m = re.match(r"^([\[\]A-Za-z0-9_]+)\s+(.+?)(\s+NOT\s+NULL|\s+NULL)?\s*$", c, flags=re.I)
        if not m:
            parsed.append({"raw": c, "comment": comment, "free": True})
            continue
        parsed.append({
            "name": m.group(1),
            "type": m.group(2),
            "nullable": (m.group(3) or "").strip(),
            "comment": comment,
        })

    max_name = max((len(p.get("name", "")) for p in parsed), default=0)
    max_type = max((len(p.get("type", "")) for p in parsed), default=0)
    for idx, p in enumerate(parsed):
        lead = "      " if idx == 0 else "    , "
        if p.get("constraint") or p.get("free"):
            out.append(f"{lead}{p['raw']}{(' ' + p['comment']) if p.get('comment') else ''}".rstrip())
            continue
        line = f"{lead}{p['name'].ljust(max_name)} {p['type'].ljust(max_type)} {p['nullable']}".rstrip()
        out.append(f"{line}{(' ' + p['comment']) if p.get('comment') else ''}".rstrip())

    out.append(")")
    return out, i


def format_sql(source: str) -> str:
    text = normalize_line_endings(source)
    lines = text.split("\n")
    out: List[str] = []

    indent_depth = 0
    in_block_comment = False

    i = 0
    while i < len(lines):
        line = re.sub(r"\s+$", "", lines[i])
        trimmed = line.strip()

        if re.match(r"^-{8,}\s*$", trimmed):
            line = SEP_LINE
            trimmed = SEP_LINE

        if not trimmed:
            out.append("")
            i += 1
            continue

        if re.match(r"^CREATE\s+TABLE\b", trimmed, flags=re.I):
            block, end_idx = format_create_table(lines, i)
            out.extend(block)
            i = end_idx + 1
            continue

        if in_block_comment:
            out.append(line)
            if "*/" in trimmed:
                in_block_comment = False
            i += 1
            continue

        if re.match(r"^--\s*$", trimmed):
            i += 1
            continue

        if re.match(r"^--", trimmed):
            out.append(f"{INDENT * indent_depth}{trimmed}")
            i += 1
            continue

        if detect_block_comment_start(line) and not trimmed.startswith("/*"):
            idx = line.find("/*")
            left = line[:idx].rstrip()
            right = line[idx:]
            if left:
                out.append(f"{INDENT * indent_depth}{left}")
            out.append(f"{INDENT * indent_depth}{right}")
            if "*/" not in right:
                in_block_comment = True
            i += 1
            continue

        if trimmed.startswith("/*"):
            out.append(f"{INDENT * indent_depth}{trimmed}")
            if "*/" not in trimmed:
                in_block_comment = True
            i += 1
            continue

        if re.match(r"^END\b", trimmed, flags=re.I):
            indent_depth = max(0, indent_depth - 1)

        indent = "" if trimmed == SEP_LINE else INDENT * indent_depth

        if re.match(r"^SELECT\b", trimmed, flags=re.I):
            select_lines = format_select_line(trimmed, indent)
            out.extend(normalize_nolock(align_clause(x, "")) for x in select_lines)
        else:
            current = alias_as_equals(normalize_functions(normalize_nolock(trimmed)))
            m = re.match(r"^(GROUP\s+BY|ORDER\s+BY)\s+(.+)$", current, flags=re.I)
            if re.match(r"^FROM\s*\($", current, flags=re.I):
                out.append(f"{indent}FROM     (")
            elif m:
                items = tokenize_items(m.group(2))
                if items:
                    out.append(align_clause(f"{m.group(1)} {items[0]}", indent))
                    for item in items[1:]:
                        out.append(f"{indent}         , {item}")
                else:
                    out.append(align_clause(current, indent))
            else:
                out.append(align_clause(current, indent))

        if re.search(r"\bBEGIN\b", trimmed, flags=re.I) and not re.match(r"^END\b", trimmed, flags=re.I):
            indent_depth += 1

        i += 1

    return compress_blank_lines("\n".join(out)).rstrip() + "\n"
