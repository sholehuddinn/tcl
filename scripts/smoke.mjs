// Smoke test end-to-end lewat HTTP terhadap aplikasi yang sudah berjalan (docker compose up).
// Pemakaian: SEED_OPERATOR_PASSWORD=... SEED_SUPERVISOR_PASSWORD=... node scripts/smoke.mjs
// Opsional: BASE_URL (default http://localhost:3000). Keluar dengan kode 1 bila ada yang gagal.
import { randomUUID } from "node:crypto";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const passwords = {
  operator: process.env.SEED_OPERATOR_PASSWORD,
  supervisor: process.env.SEED_SUPERVISOR_PASSWORD,
};
if (!passwords.operator || !passwords.supervisor) {
  console.error("Set SEED_OPERATOR_PASSWORD dan SEED_SUPERVISOR_PASSWORD (nilai sama dengan di .env).");
  process.exit(2);
}

let failures = 0;
const check = (name, ok, detail = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
};

async function call(method, path, { token, body, headers = {} } = {}) {
  const response = await fetch(`${BASE}/api/v1${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

async function login(username) {
  const res = await call("POST", "/auth/login", { body: { username, password: passwords[username] } });
  if (res.status !== 200) throw new Error(`login ${username} gagal: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.data.token;
}

const stockOf = async (token, sku) => {
  const res = await call("GET", `/inventory?q=${sku}`, { token });
  return res.body.data.find((row) => row.sku === sku)?.quantity ?? 0;
};

const health = await call("GET", "/health");
check("health check", health.status === 200 && health.body.status === "ok");

const operator = await login("operator");
const supervisor = await login("supervisor");
check("login operator dan supervisor", Boolean(operator && supervisor));
check("tanpa token ditolak 401", (await call("GET", "/products")).status === 401);

// Produk uji unik per eksekusi agar skrip dapat diulang.
const sku = `SMK-${Date.now().toString(36).toUpperCase()}`;
const product = await call("POST", "/products", { token: supervisor, body: { sku, name: "Produk Smoke Test" } });
check("supervisor membuat produk (201)", product.status === 201, sku);
check("operator tidak boleh membuat produk (403)", (await call("POST", "/products", { token: operator, body: { sku: "X-1", name: "x" } })).status === 403);
const productId = product.body.data.id;
const before = await stockOf(operator, sku);

const created = await call("POST", "/receiving-documents", {
  token: operator,
  body: { supplierName: "PT Smoke", items: [{ productId, expectedQty: 8 }] },
});
check("buat dokumen DRAFT (201)", created.status === 201 && created.body.data.status === "DRAFT", created.body.data?.number);
const docId = created.body.data.id;
const itemId = created.body.data.items[0].id;
const receipts = `/receiving-documents/${docId}/receipts`;
const receive = (quantity, key = randomUUID(), token = operator) =>
  call("POST", receipts, { token, body: { itemId, quantity }, headers: { "Idempotency-Key": key } });

check("penerimaan pada DRAFT ditolak 409", (await receive(1)).status === 409);
check("submit -> OPEN", (await call("POST", `/receiving-documents/${docId}/submit`, { token: operator })).body.data.status === "OPEN");
check("tanpa Idempotency-Key ditolak 400", (await call("POST", receipts, { token: operator, body: { itemId, quantity: 1 } })).status === 400);

const key = randomUUID();
const first = await receive(5, key);
check("terima 5 dari 8 (201)", first.status === 201 && first.body.data.item.remainingQty === 3 && first.body.data.documentStatus === "PARTIALLY_RECEIVED");
const replay = await receive(5, key);
check("kirim ulang key sama -> 200 replayed", replay.status === 200 && replay.body.replayed === true);
check("stok hanya bertambah sekali (+5)", (await stockOf(operator, sku)) === before + 5);
check("key sama isi berbeda -> 409", (await receive(4, key)).status === 409);

const over = await receive(4);
check("melebihi sisa (4 > 3) -> 422", over.status === 422 && over.body.error === "QUANTITY_EXCEEDS_REMAINING");
check("stok tidak berubah setelah penolakan", (await stockOf(operator, sku)) === before + 5);
for (const bad of [0, -1, 1.5]) check(`jumlah ${bad} ditolak 400`, (await receive(bad)).status === 400);

const early = await call("POST", `/receiving-documents/${docId}/complete`, { token: supervisor });
check("complete sebelum penuh -> 409", early.status === 409 && early.body.error === "DOCUMENT_NOT_FULLY_RECEIVED");

const parallel = await Promise.all(Array.from({ length: 6 }, () => receive(1)));
const accepted = parallel.filter((r) => r.status === 201).length;
check("6 request paralel untuk sisa 3: tepat 3 diterima", accepted === 3 && parallel.filter((r) => r.status === 422).length === 3, `diterima=${accepted}`);
check("stok = awal + 8", (await stockOf(operator, sku)) === before + 8);

check("operator tidak boleh complete (403)", (await call("POST", `/receiving-documents/${docId}/complete`, { token: operator })).status === 403);
const done = await call("POST", `/receiving-documents/${docId}/complete`, { token: supervisor });
check("supervisor complete -> COMPLETED", done.status === 200 && done.body.data.status === "COMPLETED");
check("setelah COMPLETED tidak bisa menerima lagi (409)", (await receive(1)).status === 409);

const history = await call("GET", `/inventory/transactions?documentId=${docId}`, { token: operator });
const delta = history.body.data.reduce((sum, t) => sum + t.quantityDelta, 0);
check("riwayat transaksi: jumlah delta = 8", history.body.meta.total === 4 && delta === 8, `${history.body.meta.total} transaksi`);

console.log(failures === 0 ? "\nSEMUA PEMERIKSAAN LULUS" : `\n${failures} PEMERIKSAAN GAGAL`);
process.exit(failures === 0 ? 0 : 1);
