import { authed, json, parseQuery, readJson } from "@/src/server/http";
import { documentCreateSchema, documentListQuery } from "@/src/server/schemas";
import { createDocument, listDocuments } from "@/src/server/services/receiving";

export const GET = authed(async ({ req }) => {
  return json(await listDocuments(parseQuery(req, documentListQuery)));
});

export const POST = authed(async ({ req, actor }) => {
  const input = await readJson(req, documentCreateSchema);
  return json({ data: await createDocument(actor, input) }, 201);
});
