/**
 * Testigo — Dry-Run Question Parser
 * =============================================================================
 * Parses pasted/uploaded question content in three formats (CSV, JSON, Markdown),
 * validates EVERY row, and returns the valid questions plus a list of errors
 * (with row number + excerpt) so the admin can fix and re-upload.
 *
 * This is the "Dry Run" engine: nothing is written to the DB here. The create
 * endpoint receives the already-validated questions.
 * =============================================================================
 *
 * SUPPORTED FORMATS
 *
 * 1) JSON — an array of question objects:
 *    [
 *      {
 *        "questionText": "What is 2+2?",
 *        "type": "MCQ",
 *        "options": ["1","2","3","4"],
 *        "correctAnswers": [3],
 *        "positiveMarks": 1,
 *        "negativeMarks": 0
 *      },
 *      {
 *        "questionText": "Capital of France?",
 *        "type": "TEXT",
 *        "correctAnswers": ["Paris","paris"],
 *        "positiveMarks": 1
 *      }
 *    ]
 *    - type defaults to "MCQ" if omitted.
 *    - positiveMarks defaults to 1, negativeMarks to 0.
 *
 * 2) CSV — header row required:
 *    questionText,type,options,correctAnswers,positiveMarks,negativeMarks
 *    "What is 2+2?",MCQ,"1;2;3;4","3",1,0
 *    "Capital of France?",TEXT,,"Paris|paris",1,0
 *    - options: semicolon-separated (for MCQ). Empty for TEXT.
 *    - correctAnswers: semicolon-separated 0-based indices (MCQ) OR
 *      pipe-separated acceptable strings (TEXT).
 *    - Quoted fields support commas and escaped quotes ("").
 *
 * 3) Markdown — each question starts with "### ":
 *    ### What is 2+2?
 *    - [ ] 1
 *    - [ ] 2
 *    - [ ] 3
 *    - [x] 4
 *    marks: 1
 *
 *    ### Capital of France?
 *    type: text
 *    answer: Paris
 *    answer: paris
 *    marks: 1
 *    neg: 0.25
 *    - MCQ options use `- [ ]` (wrong) and `- [x]` (correct).
 *    - TEXT questions use `type: text` and one or more `answer:` lines.
 *    - `marks:` sets positiveMarks; `neg:` sets negativeMarks.
 */

export type QuestionType = 'MCQ' | 'TEXT'

export interface ParsedQuestion {
  questionText: string
  type: QuestionType
  options: string[] // MCQ only; [] for TEXT
  correctAnswers: number[] | string[] // indices (MCQ) | strings (TEXT)
  positiveMarks: number
  negativeMarks: number
}

export interface ParseError {
  row: number // 1-indexed (CSV/MD line number, or JSON array index + 1)
  excerpt: string // first ~60 chars of the question/row, for context
  error: string
}

export interface DryRunResult {
  valid: ParsedQuestion[]
  errors: ParseError[]
  total: number // valid.length + errors.length
}

export type ParseFormat = 'csv' | 'json' | 'md'

// ---- public entry point ----------------------------------------------------

export function dryRunParse(
  format: ParseFormat,
  content: string
): DryRunResult {
  if (!content.trim()) {
    return {
      valid: [],
      errors: [{ row: 0, excerpt: '', error: 'Content is empty.' }],
      total: 0,
    }
  }
  switch (format) {
    case 'json':
      return parseJson(content)
    case 'csv':
      return parseCsv(content)
    case 'md':
      return parseMarkdown(content)
  }
}

// ---- validation (shared) ---------------------------------------------------

function makeExcerpt(text: string): string {
  const t = text.replace(/\s+/g, ' ').trim()
  return t.length > 60 ? t.slice(0, 60) + '…' : t
}

/** Validate a single candidate question; returns {ok, question?, error?}. */
function validateQuestion(raw: {
  questionText?: unknown
  type?: unknown
  options?: unknown
  correctAnswers?: unknown
  positiveMarks?: unknown
  negativeMarks?: unknown
}): { ok: true; question: ParsedQuestion } | { ok: false; error: string } {
  const questionText =
    typeof raw.questionText === 'string' ? raw.questionText.trim() : ''
  if (!questionText) {
    return { ok: false, error: 'Missing question_text' }
  }

  let type: QuestionType = 'MCQ'
  if (raw.type !== undefined && raw.type !== null) {
    const t = String(raw.type).trim().toUpperCase()
    if (t !== 'MCQ' && t !== 'TEXT') {
      return { ok: false, error: `Invalid type "${raw.type}" (use MCQ or TEXT)` }
    }
    type = t
  }

  const positiveMarks = toNumber(raw.positiveMarks, 1)
  const negativeMarks = toNumber(raw.negativeMarks, 0)
  if (positiveMarks < 0) {
    return { ok: false, error: 'positiveMarks must be ≥ 0' }
  }
  if (negativeMarks < 0) {
    return { ok: false, error: 'negativeMarks must be ≥ 0' }
  }

  if (type === 'MCQ') {
    const options = toStringArray(raw.options)
    if (options.length < 2) {
      return { ok: false, error: 'MCQ needs at least 2 options' }
    }
    const correct = toNumberArray(raw.correctAnswers)
    if (correct.length === 0) {
      return { ok: false, error: 'Missing correct_answers array' }
    }
    for (const idx of correct) {
      if (!Number.isInteger(idx) || idx < 0 || idx >= options.length) {
        return {
          ok: false,
          error: `correct_answer index ${idx} out of range (0..${options.length - 1})`,
        }
      }
    }
    return {
      ok: true,
      question: {
        questionText,
        type,
        options,
        correctAnswers: correct,
        positiveMarks,
        negativeMarks,
      },
    }
  }

  // TEXT
  const answers = toStringArray(raw.correctAnswers)
  if (answers.length === 0) {
    return { ok: false, error: 'TEXT question needs at least one correct answer' }
  }
  return {
    ok: true,
    question: {
      questionText,
      type: 'TEXT',
      options: [],
      correctAnswers: answers,
      positiveMarks,
      negativeMarks,
    },
  }
}

function toNumber(v: unknown, fallback: number): number {
  if (v === undefined || v === null || v === '') return fallback
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}
function toStringArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean)
  if (typeof v === 'string') {
    return v
      .split(';')
      .map((s) => s.trim())
      .filter(Boolean)
  }
  return []
}
function toNumberArray(v: unknown): number[] {
  if (Array.isArray(v)) {
    return v
      .map((x) => Number(x))
      .filter((n) => Number.isFinite(n))
      .map((n) => Math.round(n))
  }
  if (typeof v === 'string') {
    return v
      .split(';')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => Number(s))
      .filter((n) => Number.isFinite(n))
      .map((n) => Math.round(n))
  }
  return []
}

// ---- JSON parser -----------------------------------------------------------

function parseJson(content: string): DryRunResult {
  let data: unknown
  try {
    data = JSON.parse(content)
  } catch (e) {
    return {
      valid: [],
      errors: [
        {
          row: 0,
          excerpt: '',
          error: `Invalid JSON: ${e instanceof Error ? e.message : 'parse error'}`,
        },
      ],
      total: 0,
    }
  }
  if (!Array.isArray(data)) {
    return {
      valid: [],
      errors: [
        { row: 0, excerpt: '', error: 'JSON root must be an array of questions' },
      ],
      total: 0,
    }
  }

  const valid: ParsedQuestion[] = []
  const errors: ParseError[] = []
  data.forEach((item, i) => {
    const row = i + 1
    const res = validateQuestion(item ?? {})
    if (res.ok) {
      valid.push(res.question)
    } else {
      errors.push({
        row,
        excerpt: makeExcerpt(
          typeof (item as { questionText?: unknown })?.questionText === 'string'
            ? (item as { questionText: string }).questionText
            : JSON.stringify(item).slice(0, 60)
        ),
        error: res.error,
      })
    }
  })
  return { valid, errors, total: data.length }
}

// ---- CSV parser ------------------------------------------------------------

/** RFC-4180-ish single-line CSV parser (handles quoted fields + "" escapes). */
function parseCsvLine(line: string): string[] {
  const fields: string[] = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        cur += ch
      }
    } else if (ch === '"') {
      inQuotes = true
    } else if (ch === ',') {
      fields.push(cur)
      cur = ''
    } else {
      cur += ch
    }
  }
  fields.push(cur)
  return fields
}

function parseCsv(content: string): DryRunResult {
  const lines = content
    .replace(/\r\n/g, '\n')
    .split('\n')
    .filter((l) => l.trim().length > 0)

  if (lines.length === 0) {
    return {
      valid: [],
      errors: [{ row: 0, excerpt: '', error: 'CSV is empty.' }],
      total: 0,
    }
  }

  const header = parseCsvLine(lines[0]).map((h) => h.trim().toLowerCase())
  const idx = (name: string) => header.indexOf(name)
  const iQ = idx('questiontext')
  const iType = idx('type')
  const iOpt = idx('options')
  const iAns = idx('correctanswers')
  const iPos = idx('positivemarks')
  const iNeg = idx('negativemarks')

  if (iQ === -1) {
    return {
      valid: [],
      errors: [
        {
          row: 1,
          excerpt: lines[0].slice(0, 60),
          error:
            'CSV header must contain a "questionText" column (required columns: questionText,type,options,correctAnswers,positiveMarks,negativeMarks)',
        },
      ],
      total: 0,
    }
  }

  const valid: ParsedQuestion[] = []
  const errors: ParseError[] = []

  for (let r = 1; r < lines.length; r++) {
    const rowNumber = r + 1 // header is line 1
    const cells = parseCsvLine(lines[r])

    // For TEXT questions, correctAnswers are pipe-separated strings.
    const typeRaw = iType !== -1 ? cells[iType]?.trim() : ''
    const isText = typeRaw.toUpperCase() === 'TEXT'

    const raw = {
      questionText: cells[iQ],
      type: typeRaw || undefined,
      options: iOpt !== -1 ? cells[iOpt] : '',
      correctAnswers:
        iAns !== -1
          ? isText
            ? (cells[iAns] ?? '')
                .split('|')
                .map((s) => s.trim())
                .filter(Boolean)
            : cells[iAns]
          : undefined,
      positiveMarks: iPos !== -1 ? cells[iPos] : undefined,
      negativeMarks: iNeg !== -1 ? cells[iNeg] : undefined,
    }

    const res = validateQuestion(raw)
    if (res.ok) {
      valid.push(res.question)
    } else {
      errors.push({
        row: rowNumber,
        excerpt: makeExcerpt(cells[iQ] ?? lines[r]),
        error: res.error,
      })
    }
  }

  return { valid, errors, total: lines.length - 1 }
}

// ---- Markdown parser -------------------------------------------------------

function parseMarkdown(content: string): DryRunResult {
  const lines = content.replace(/\r\n/g, '\n').split('\n')

  // Split into blocks starting with "### "
  const blocks: { startLine: number; lines: string[] }[] = []
  let current: { startLine: number; lines: string[] } | null = null
  lines.forEach((line, i) => {
    if (/^###\s+/.test(line)) {
      if (current) blocks.push(current)
      current = { startLine: i + 1, lines: [line] }
    } else if (current) {
      current.lines.push(line)
    }
  })
  if (current) blocks.push(current)

  if (blocks.length === 0) {
    return {
      valid: [],
      errors: [
        {
          row: 0,
          excerpt: '',
          error:
            'No questions found. Start each question with "### " (e.g. "### What is 2+2?").',
        },
      ],
      total: 0,
    }
  }

  const valid: ParsedQuestion[] = []
  const errors: ParseError[] = []

  for (const block of blocks) {
    const rowNumber = block.startLine
    const questionText = block.lines[0].replace(/^###\s+/, '').trim()

    const options: { text: string; correct: boolean }[] = []
    const answers: string[] = []
    let type: QuestionType | null = null
    let positiveMarks: number | undefined
    let negativeMarks: number | undefined

    for (let i = 1; i < block.lines.length; i++) {
      const line = block.lines[i].trim()
      if (!line) continue

      const mcqMatch = line.match(/^-\s*\[([ xX])\]\s+(.*)$/)
      if (mcqMatch) {
        if (type === null) type = 'MCQ'
        options.push({
          text: mcqMatch[2].trim(),
          correct: mcqMatch[1].toLowerCase() === 'x',
        })
        continue
      }

      const m = line.match(/^([a-zA-Z]+):\s*(.*)$/)
      if (m) {
        const key = m[1].toLowerCase()
        const val = m[2].trim()
        if (key === 'type') {
          const t = val.toUpperCase()
          if (t === 'TEXT' || t === 'MCQ') type = t
        } else if (key === 'answer') {
          if (type === null) type = 'TEXT'
          if (type === 'TEXT') answers.push(val)
        } else if (key === 'marks' || key === 'positivemarks') {
          positiveMarks = Number(val)
        } else if (key === 'neg' || key === 'negativemarks') {
          negativeMarks = Number(val)
        }
      }
    }

    if (type === null) type = options.length > 0 ? 'MCQ' : 'TEXT'

    const raw =
      type === 'MCQ'
        ? {
            questionText,
            type: 'MCQ' as const,
            options: options.map((o) => o.text),
            correctAnswers: options
              .map((o, i) => (o.correct ? i : -1))
              .filter((i) => i >= 0),
            positiveMarks,
            negativeMarks,
          }
        : {
            questionText,
            type: 'TEXT' as const,
            options: [],
            correctAnswers: answers,
            positiveMarks,
            negativeMarks,
          }

    const res = validateQuestion(raw)
    if (res.ok) {
      valid.push(res.question)
    } else {
      errors.push({
        row: rowNumber,
        excerpt: makeExcerpt(questionText || block.lines[0]),
        error: res.error,
      })
    }
  }

  return { valid, errors, total: blocks.length }
}

// ---- sample content (for the wizard's "Load sample" button) ----------------

export const SAMPLE_CSV = `questionText,type,options,correctAnswers,positiveMarks,negativeMarks
"What is 2 + 2?",MCQ,"1;2;3;4","3",1,0
"Capital of France?",TEXT,,"Paris|paris",1,0
"Which are prime?",MCQ,"2;4;7;9","0;2",2,0.5
"Broken row missing answer",MCQ,"A;B;C","",1,0
`

export const SAMPLE_JSON = `[
  { "questionText": "What is 2 + 2?", "type": "MCQ", "options": ["1","2","3","4"], "correctAnswers": [3], "positiveMarks": 1, "negativeMarks": 0 },
  { "questionText": "Capital of France?", "type": "TEXT", "correctAnswers": ["Paris","paris"], "positiveMarks": 1, "negativeMarks": 0 },
  { "questionText": "Which are prime?", "type": "MCQ", "options": ["2","4","7","9"], "correctAnswers": [0,2], "positiveMarks": 2, "negativeMarks": 0.5 },
  { "questionText": "", "type": "MCQ", "options": ["A","B"], "correctAnswers": [0], "positiveMarks": 1, "negativeMarks": 0 }
]
`

export const SAMPLE_MD = `### What is 2 + 2?
- [ ] 1
- [ ] 2
- [ ] 3
- [x] 4
marks: 1

### Capital of France?
type: text
answer: Paris
answer: paris
marks: 1

### Which are prime?
- [x] 2
- [ ] 4
- [x] 7
- [ ] 9
marks: 2
neg: 0.5

### Broken row missing answer
- [ ] A
- [ ] B
- [ ] C
marks: 1
`
