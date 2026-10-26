import { authed, json } from "@/src/server/http";
import { toUserDto } from "@/src/server/services/auth";

export const GET = authed(async ({ actor }) => json({ data: { user: toUserDto(actor) } }));
