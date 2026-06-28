import { NextResponse } from 'next/server'

/** Standardized success response: { success: true, message, data } */
export function ok(data: unknown, message = 'ok', status = 200) {
  return NextResponse.json({ success: true, message, data }, { status })
}

/** Standardized error response: { success: false, message } */
export function fail(message: string, status = 400) {
  return NextResponse.json({ success: false, message }, { status })
}

/**
 * Normalize a participant identifier. Currently identifierType is always PHONE,
 * so we strip spaces/dashes/parentheses and keep digits + leading '+'.
 * (When EMAIL/STUDENT_ID identifier types are added, branch on the type here.)
 */
export function normalizeIdentifier(
  raw: string,
  _type: string = 'PHONE'
): string {
  return raw.trim().replace(/[\s\-()]/g, '')
}
