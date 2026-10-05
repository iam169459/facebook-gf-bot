import { list } from "@vercel/blob";
const tok = process.env.BLOB_READ_WRITE_TOKEN;
const paths = [
  "bot-config/inbox/27471503829191909.json",
  "bot-config/claim/27471503829191909.json",
  "bot-config/claim/27471503829191909/05pkf0qvk0j6musn0b74.json",
  "bot-config/facts/27471503829191909.json",
  "bot-config/history/27471503829191909.json",
];
for (const p of paths) {
  const r = await list({ prefix: p, token: tok });
  const b = (r.blobs || []).find((x) => x.pathname === p);
  if (!b) { console.log("==", p, "-> missing"); continue; }
  const body = await (await fetch(b.url, { cache: "no-store" })).text();
  console.log("==", p, "| uploaded:", b.uploadedAt);
  console.log(body.slice(0, 500));
  console.log();
}
