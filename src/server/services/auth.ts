import { signSession, verifyPassword, hashPassword, type Actor } from "../auth";
import { prisma } from "../db";
import { Errors } from "../errors";

// Hash palsu agar waktu respons sama untuk username yang tidak ada (cegah user enumeration).
let dummyHash: Promise<string> | undefined;

export function toUserDto(user: Actor) {
  return { id: user.id, username: user.username, fullName: user.fullName, role: user.role };
}

export async function login(username: string, password: string) {
  const user = await prisma.user.findUnique({ where: { username: username.toLowerCase() } });
  const hash = user?.passwordHash ?? (await (dummyHash ??= hashPassword("tidak-dipakai")));
  const valid = await verifyPassword(password, hash);
  if (!user || !valid || !user.isActive) throw Errors.invalidCredentials();

  const token = await signSession(user.id);
  return { token, user: toUserDto(user) };
}
