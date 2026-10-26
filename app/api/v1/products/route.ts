import { authed, json, parseQuery, readJson } from "@/src/server/http";
import { productCreateSchema, productListQuery } from "@/src/server/schemas";
import { createProduct, listProducts } from "@/src/server/services/products";

export const GET = authed(async ({ req }) => {
  return json(await listProducts(parseQuery(req, productListQuery)));
});

export const POST = authed(async ({ req, actor }) => {
  const input = await readJson(req, productCreateSchema);
  return json({ data: await createProduct(actor, input) }, 201);
});
