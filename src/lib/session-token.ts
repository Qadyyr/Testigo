import jwt, { type JwtPayload } from 'jsonwebtoken'

/**
 * Participant session token (signed JWT).
 *
 * Issued the moment a participant passes the access gate. Contains the testId,
 * attemptId, identifier, and an expiry. Every test-taking API route requires it
 * — this prevents participants from hitting load/save/submit endpoints without
 * going through verification.
 *
 * The token is short-lived (test time limit + a buffer). The server-validated
 * source of truth for "is this attempt still active" is the DB (Attempt.status
 * + Attempt.startTime), NOT the token — the token is identity, the DB is state.
 */

const SECRET =
  process.env.NEXTAUTH_SECRET ?? process.env.JWT_SECRET ?? 'testigo-dev-secret'

export interface SessionToken {
  testId: string
  attemptId: string
  identifier: string | null
  // exp (seconds) is set by jwt.
}

export function signSessionToken(
  payload: Omit<SessionToken, 'exp'>,
  expiresInSeconds: number
): string {
  return jwt.sign(payload, SECRET, { expiresIn: expiresInSeconds })
}

export function verifySessionToken(token: string): SessionToken | null {
  try {
    const decoded = jwt.verify(token, SECRET) as JwtPayload & SessionToken
    return {
      testId: decoded.testId,
      attemptId: decoded.attemptId,
      identifier: decoded.identifier ?? null,
    }
  } catch {
    return null
  }
}

/**
 * Extract + verify a Bearer token from an Authorization header.
 * Returns the decoded payload, or null if missing/invalid.
 */
export function getSessionFromAuthHeader(
  authHeader: string | null
): SessionToken | null {
  if (!authHeader) return null
  const match = authHeader.match(/^Bearer\s+(.+)$/i)
  if (!match) return null
  return verifySessionToken(match[1])
}
