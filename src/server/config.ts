export const SESSION_COOKIE = "session";
export const SESSION_TTL_SECONDS = 8 * 60 * 60;

/** Dibaca saat dipakai (bukan saat import) agar build tidak butuh secret. */
export function jwtSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("JWT_SECRET wajib diisi (minimal 32 karakter)");
  }
  return new TextEncoder().encode(secret);
}

export function cookieSecure(): boolean {
  return process.env.COOKIE_SECURE === "true";
}
