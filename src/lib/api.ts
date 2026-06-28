import { NextResponse } from 'next/server'

/** Standardized success response: { success: true, message, data } */
export function ok(data: unknown, message = 'ok', status = 200) {
  return NextResponse.json({ success: true, message, data }, { status })
}

/** Standardized error response: { success: false, message } */
export function fail(message: string, status = 400) {
  return NextResponse.json({ success: false, message }, { status })
}

/** Normalize an email for case-insensitive matching. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

/** Normalize a phone number (strip spaces/dashes; keep + and digits). */
export function normalizePhone(phone: string): string {
  return phone.trim().replace(/[\s\-()]/g, '')
}
