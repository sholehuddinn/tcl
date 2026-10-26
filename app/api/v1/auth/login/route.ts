import { sessionCookie } from "@/src/server/auth";
import { json, open, readJson } from "@/src/server/http";
import { loginSchema } from "@/src/server/schemas";
import { login } from "@/src/server/services/auth";

export const POST = open(async ({ req }) => {
  const { username, password } = await readJson(req, loginSchema);
  const { token, user } = await login(username, password);
  return json({ data: { user, token } }, 200, { "Set-Cookie": sessionCookie(token) });
});
