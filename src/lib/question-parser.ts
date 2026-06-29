/**
 * Testigo — Dry-Run Question Parser
 * =============================================================================
 * Parses pasted/uploaded question content in three formats (CSV, JSON, Markdown),
 * validates EVERY row, and returns the valid questions plus a list of errors
 * (with row number + excerpt) so the admin can fix and re-upload.
 *
 * SIMPLIFIED FORMAT — the import contains ONLY:
 *   - questionText   (the question)
 *   - type           (MCQ | TRUE_FALSE | SHORT)
 *   - options        (for MCQ/TRUE_FALSE; omitted for SHORT)
 *   - correctAnswers (option index/indices for MCQ/TRUE_FALSE; acceptable
 *                     strings for SHORT)
 *   - explanation    (optional — shown in the result review)
 *
 * Marks (positive/negative) are NOT in the import — they are test-level
 * settings configured in Step 2 of the wizard and applied to all questions.
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
 *        "explanation": "2+2 = 4."
 *      },
 *      {
 *        "questionText": "The Earth is flat.",
 *        "type": "TRUE_FALSE",
 *        "correctAnswers": [1],
 *        "explanation": "The Earth is an oblate spheroid."
 *      },
 *      {
 *        "questionText": "Capital of France?",
 *        "type": "SHORT",
 *        "correctAnswers": ["Paris","paris"],
 *        "explanation": "Paris has been the capital of France since 987 AD."
 *      }
 *    ]
 *    - type defaults to "MCQ" if omitted.
 *    - TRUE_FALSE with no options auto-generates ["True","False"].
 *
 * 2) CSV — header row required:
 *    questionText,type,options,correctAnswers,explanation
 *    "What is 2+2?",MCQ,"1;2;3;4","3","2+2 = 4."
 *    "The Earth is flat.",TRUE_FALSE,,"1","Earth is round."
 *    "Capital of France?",SHORT,,"Paris|paris","Paris since 987 AD."
 *    - options: semicolon-separated (MCQ). Empty for SHORT/TRUE_FALSE.
 *    - correctAnswers: semicolon-separated indices (MCQ/TRUE_FALSE) OR
 *      pipe-separated strings (SHORT).
 *
 * 3) Markdown — each question starts with "### ":
 *    ### What is 2+2?
 *    - [ ] 1
 *    - [ ] 2
 *    - [ ] 3
 *    - [x] 4
 *    > 2+2 = 4.
 *
 *    ### The Earth is flat.
 *    type: true_false
 *    - [x] False
 *    - [ ] True
 *    > The Earth is an oblate spheroid.
 *
 *    ### Capital of France?
 *    type: short
 *    answer: Paris
 *    answer: paris
 *    > Paris has been the capital since 987 AD.
 *    - MCQ/TRUE_FALSE options use `- [ ]` (wrong) and `- [x]` (correct).
 *    - SHORT questions use `type: short` and one or more `answer:` lines.
 *    - The `> ` line after the question/options is the explanation.
 */

export type QuestionType = 'MCQ' | 'TRUE_FALSE' | 'SHORT'

export interface ParsedQuestion {
  questionText: string
  type: QuestionType
  options: string[] // MCQ / TRUE_FALSE; [] for SHORT
  correctAnswers: number[] | string[] // indices (MCQ/TRUE_FALSE) | strings (SHORT)
  explanation: string | null
}

export interface ParseError {
  row: number // 1-indexed
  excerpt: string // first ~60 chars of the question/row
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

function normalizeType(raw: unknown): QuestionType | null {
  if (raw === undefined || raw === null || raw === '') return 'MCQ'
  const t = String(raw).trim().toUpperCase().replace(/[-\s]/g, '_')
  if (t === 'MCQ' || t === 'MULTIPLE' || t === 'MULTIPLE_CHOICE') return 'MCQ'
  if (t === 'TRUE_FALSE' || t === 'TRUEFALSE' || t === 'TF' || t === 'BOOLEAN')
    return 'TRUE_FALSE'
  if (t === 'SHORT' || t === 'SHORT_ANSWER' || t === 'TEXT') return 'SHORT'
  return null
}

/** Validate a single candidate question. */
function validateQuestion(raw: {
  questionText?: unknown
  type?: unknown
  options?: unknown
  correctAnswers?: unknown
  explanation?: unknown
}): { ok: true; question: ParsedQuestion } | { ok: false; error: string } {
  const questionText =
    typeof raw.questionText === 'string' ? raw.questionText.trim() : ''
  if (!questionText) {
    return { ok: false, error: 'Missing question text' }
  }

  const type = normalizeType(raw.type)
  if (!type) {
    return { ok: false, error: `Invalid type "${raw.type}" (use MCQ, TRUE_FALSE, or SHORT)` }
  }

  const explanation =
    typeof raw.explanation === 'string' && raw.explanation.trim()
      ? raw.explanation.trim()
      : null

  if (type === 'SHORT') {
    const answers = toStringArray(raw.correctAnswers)
    if (answers.length === 0) {
      return { ok: false, error: 'SHORT question needs at least one acceptable answer' }
    }
    return {
      ok: true,
      question: {
        questionText,
        type: 'SHORT',
        options: [],
        correctAnswers: answers,
        explanation,
      },
    }
  }

  // MCQ or TRUE_FALSE
  let options = toStringArray(raw.options)
  if (type === 'TRUE_FALSE' && options.length === 0) {
    options = ['True', 'False'] // auto-generate
  }
  if (options.length < 2) {
    return {
      ok: false,
      error: `${type} needs at least 2 options`,
    }
  }
  const correct = toNumberArray(raw.correctAnswers)
  if (correct.length === 0) {
    return { ok: false, error: 'Missing correct answer (correctAnswers)' }
  }
  for (const idx of correct) {
    if (!Number.isInteger(idx) || idx < 0 || idx >= options.length) {
      return {
        ok: false,
        error: `correct answer index ${idx} out of range (0..${options.length - 1})`,
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
      explanation,
    },
  }
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
  const iExp = idx('explanation')

  if (iQ === -1) {
    return {
      valid: [],
      errors: [
        {
          row: 1,
          excerpt: lines[0].slice(0, 60),
          error:
            'CSV header must contain a "questionText" column (required: questionText,type,options,correctAnswers,explanation)',
        },
      ],
      total: 0,
    }
  }

  const valid: ParsedQuestion[] = []
  const errors: ParseError[] = []

  for (let r = 1; r < lines.length; r++) {
    const rowNumber = r + 1
    const cells = parseCsvLine(lines[r])

    const typeRaw = iType !== -1 ? cells[iType]?.trim() : ''
    const isShort =
      typeRaw.toUpperCase().replace(/[-\s]/g, '_') === 'SHORT' ||
      typeRaw.toUpperCase() === 'TEXT'
    const isTrueFalse =
      typeRaw.toUpperCase().replace(/[-\s]/g, '_') === 'TRUE_FALSE' ||
      typeRaw.toUpperCase() === 'TF'

    const raw = {
      questionText: cells[iQ],
      type: typeRaw || undefined,
      options: iOpt !== -1 ? cells[iOpt] : '',
      correctAnswers:
        iAns !== -1
          ? isShort
            ? (cells[iAns] ?? '')
                .split('|')
                .map((s) => s.trim())
                .filter(Boolean)
            : cells[iAns]
          : undefined,
      explanation: iExp !== -1 ? cells[iExp] : undefined,
    }

    // For TRUE_FALSE with empty options, let validateQuestion auto-generate.
    if (isTrueFalse && raw.options === '') {
      raw.options = [] as unknown as string
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
    let explanation: string | null = null

    for (let i = 1; i < block.lines.length; i++) {
      const line = block.lines[i].trim()
      if (!line) continue

      // Explanation: a blockquote line "> ..."
      if (line.startsWith('>')) {
        explanation = line.replace(/^>\s?/, '').trim()
        continue
      }

      const mcqMatch = line.match(/^-\s*\[([ xX])\]\s+(.*)$/)
      if (mcqMatch) {
        if (type === null) type = 'MCQ'
        options.push({
          text: mcqMatch[2].trim(),
          correct: mcqMatch[1].toLowerCase() === 'x',
        })
        continue
      }

      const m = line.match(/^([a-zA-Z_]+):\s*(.*)$/)
      if (m) {
        const key = m[1].toLowerCase()
        const val = m[2].trim()
        if (key === 'type') {
          const t = normalizeType(val)
          if (t) type = t
        } else if (key === 'answer') {
          if (type === null) type = 'SHORT'
          if (type === 'SHORT') answers.push(val)
        }
      }
    }

    if (type === null) type = options.length > 0 ? 'MCQ' : 'SHORT'

    const raw =
      type === 'SHORT'
        ? {
            questionText,
            type: 'SHORT' as const,
            options: [],
            correctAnswers: answers,
            explanation,
          }
        : {
            questionText,
            type: type as 'MCQ' | 'TRUE_FALSE',
            options: options.map((o) => o.text),
            correctAnswers: options
              .map((o, i) => (o.correct ? i : -1))
              .filter((i) => i >= 0),
            explanation,
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

export const SAMPLE_CSV = `questionText,type,options,correctAnswers,explanation
"What is 2 + 2?",MCQ,"1;2;3;4","3","2 + 2 = 4."
"The Earth is flat.",TRUE_FALSE,,"1","The Earth is an oblate spheroid."
"Capital of France?",SHORT,,"Paris|paris","Paris has been France's capital since 987 AD."
"Which are prime?",MCQ,"2;4;7;9","0;2","2 and 7 are prime; 4 and 9 are not."
`

export const SAMPLE_JSON = `[
  { "questionText": "What is 2 + 2?", "type": "MCQ", "options": ["1","2","3","4"], "correctAnswers": [3], "explanation": "2 + 2 = 4." },
  { "questionText": "The Earth is flat.", "type": "TRUE_FALSE", "correctAnswers": [1], "explanation": "The Earth is an oblate spheroid." },
  { "questionText": "Capital of France?", "type": "SHORT", "correctAnswers": ["Paris","paris"], "explanation": "Paris has been France's capital since 987 AD." },
  { "questionText": "Which are prime?", "type": "MCQ", "options": ["2","4","7","9"], "correctAnswers": [0,2], "explanation": "2 and 7 are prime; 4 and 9 are not." }
]
`

export const SAMPLE_MD = `### What is 2 + 2?
- [ ] 1
- [ ] 2
- [ ] 3
- [x] 4
> 2 + 2 = 4.

### The Earth is flat.
type: true_false
- [ ] True
- [x] False
> The Earth is an oblate spheroid.

### Capital of France?
type: short
answer: Paris
answer: paris
> Paris has been France's capital since 987 AD.

### Which are prime?
- [x] 2
- [ ] 4
- [x] 7
- [ ] 9
> 2 and 7 are prime; 4 and 9 are not.
`
