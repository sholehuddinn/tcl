import { clearSessionCookie } from "@/src/server/auth";
import { authed } from "@/src/server/http";

export const POST = authed(async () => {
  return new Response(null, { status: 204, headers: { "Set-Cookie": clearSessionCookie() } });
});
