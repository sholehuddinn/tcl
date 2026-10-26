import { connection } from "next/server";
import type { ZodType } from "zod";
import { authenticate, type Actor } from "./auth";
import { Errors, toErrorBody } from "./errors";

export function json(body: unknown, status = 200, headers?: HeadersInit): Response {
  return Response.json(body, { status, headers });
}

export async function readJson<T>(req: Request, schema: ZodType<T>): Promise<T> {
  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    throw Errors.validation("Content-Type harus application/json.");
  }
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw Errors.validation("Body harus berupa JSON yang valid.");
  }
  return schema.parse(raw);
}

export function parseQuery<T>(req: Request, schema: ZodType<T>): T {
  const params = Object.fromEntries(new URL(req.url).searchParams);
  return schema.parse(params);
}

function errorResponse(error: unknown): Response {
  const body = toErrorBody(error);
  return json(body, body.statusCode);
}

type Params = Record<string, string>;
type RouteContext<P> = { params: Promise<P> };

/** Route Handler yang butuh login. Memanggil connection() agar tidak pernah diprerender (cacheComponents). */
export function authed<P extends Params = Params>(
  handler: (ctx: { req: Request; actor: Actor; params: P }) => Promise<Response>,
) {
  return async (req: Request, ctx: RouteContext<P>): Promise<Response> => {
    await connection();
    try {
      const actor = await authenticate(req);
      return await handler({ req, actor, params: await ctx.params });
    } catch (error) {
      return errorResponse(error);
    }
  };
}

/** Route Handler publik (login, health). */
export function open<P extends Params = Params>(
  handler: (ctx: { req: Request; params: P }) => Promise<Response>,
) {
  return async (req: Request, ctx: RouteContext<P>): Promise<Response> => {
    await connection();
    try {
      return await handler({ req, params: await ctx.params });
    } catch (error) {
      return errorResponse(error);
    }
  };
}
