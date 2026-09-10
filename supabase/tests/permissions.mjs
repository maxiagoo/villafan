import { createRequire } from "node:module";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
const require = createRequire(
  resolve(process.env.PGLITE_TEST_ROOT || process.cwd(), "package.json"),
);
const { PGlite } = require("@electric-sql/pglite");
const pg = new PGlite();
const here = dirname(fileURLToPath(import.meta.url));
let checks = 0;
const admin = "00000000-0000-4000-8000-000000000001",
  alice = "00000000-0000-4000-8000-000000000002",
  bob = "00000000-0000-4000-8000-000000000003";
const requestA = "10000000-0000-4000-8000-000000000001",
  requestB = "10000000-0000-4000-8000-000000000002",
  movement = "20000000-0000-4000-8000-000000000001";
async function as(id) {
  await pg.exec("reset role");
  await pg.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
  await pg.exec("set role authenticated");
}
async function denied(sql, args = []) {
  await assert.rejects(() => pg.query(sql, args));
  checks++;
}
async function count(sql, n, args = []) {
  const result = await pg.query(sql, args);
  assert.equal(result.rows.length, n);
  checks++;
  return result.rows;
}
await pg.exec(`
create role anon; create role authenticated;
create schema auth; create table auth.users(id uuid primary key,email text);
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
grant usage on schema auth,public to anon,authenticated; grant execute on function auth.uid() to anon,authenticated;
create schema storage;
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
alter table storage.objects enable row level security;
grant usage on schema storage to authenticated;
grant select,insert,delete on storage.objects to authenticated;
create function storage.foldername(name text) returns text[] language sql immutable as $$select (string_to_array(name,'/'))[1:array_length(string_to_array(name,'/'),1)-1]$$;
`);
await pg.exec(await readFile(resolve(here, "../schema.sql"), "utf8"));
await pg.exec(
  await readFile(resolve(here, "../migrations/002_chat_finance.sql"), "utf8"),
);
await pg.query("insert into auth.users(id) values($1),($2),($3)", [
  admin,
  alice,
  bob,
]);
await pg.query("insert into public.admins values($1)", [admin]);
await as(alice);
await pg.query(
  "insert into public.requests(id,user_id,customer_name,contact,environment,description) values($1,$2,'Alice teste','11999999999','Cozinhas','Quero uma cozinha com armários sob medida.')",
  [requestA, alice],
);
await as(bob);
await pg.query(
  "insert into public.requests(id,user_id,customer_name,contact,environment,description) values($1,$2,'Bob teste','11988888888','Quartos','Gostaria de um guarda-roupa para meu quarto.')",
  [requestB, bob],
);
await as(alice);
await count("select * from public.requests", 1);
await count("select * from public.requests where id=$1", 0, [requestB]);
await denied("insert into public.admins values($1)", [alice]);
await denied(
  "insert into public.request_messages(request_id,body) values($1,'Tentativa de ler o pedido de outra pessoa')",
  [requestB],
);
await denied(
  "insert into public.request_messages(request_id,body,sender_id) values($1,'Forjando remetente',$2)",
  [requestA, admin],
);
await denied(
  "insert into public.request_messages(request_id,body,sender_role) values($1,'Forjando função','admin')",
  [requestA],
);
await pg.query(
  "insert into public.request_messages(request_id,body) values($1,'Quero conversar sobre os acabamentos.')",
  [requestA],
);
const clientMessages = await count("select * from public.request_messages", 1);
assert.equal(clientMessages[0].sender_role, "client");
checks++;
await denied(
  "update public.request_messages set body='Alteração de histórico'",
);
await denied("delete from public.request_messages");
await denied("delete from public.requests where id=$1", [requestA]);
await pg.query("update public.requests set status='Concluída' where id=$1", [
  requestA,
]);
const own = await pg.query("select status from public.requests where id=$1", [
  requestA,
]);
assert.equal(own.rows[0].status, "Recebida");
checks++;
await denied(
  "select public.record_movement($1,null,'entrada',10000,'Recebimento','Pix',current_date)",
  [movement],
);
await denied("select public.money_summary()");
await as(admin);
await count("select * from public.requests", 2);
await pg.query(
  "insert into public.request_messages(request_id,body) values($1,'Vamos definir os acabamentos juntos.')",
  [requestA],
);
const messages = await count(
  "select * from public.request_messages where sender_role='admin'",
  1,
);
assert.equal(messages[0].sender_id, admin);
checks++;
await pg.query("update public.requests set status='Em análise' where id=$1", [
  requestA,
]);
await pg.query(
  "select public.record_movement($1,$2,'entrada',12345,'Sinal do projeto','Pix',current_date)",
  [movement, requestA],
);
await pg.query(
  "select public.record_movement($1,$2,'entrada',12345,'Sinal do projeto','Pix',current_date)",
  [movement, requestA],
);
await count("select * from public.money_movements", 1);
await denied(
  "select public.record_movement($1,$2,'entrada',99999,'Sinal do projeto','Pix',current_date)",
  [movement, requestA],
);
await denied("update public.money_movements set amount_cents=1");
await denied("delete from public.money_movements");
await denied(
  "insert into public.money_movements(direction,amount_cents,description,method,occurred_on) values('entrada',1,'Forjado','Pix',current_date)",
);
await denied(
  "select public.record_movement(gen_random_uuid(),null,'entrada',-100,'Valor inválido','Pix',current_date)",
);
await denied(
  "select public.record_movement(gen_random_uuid(),null,'entrada',100,'Data futura','Pix',current_date+1)",
);
const original = await pg.query("select public.money_summary() as summary");
assert.deepEqual(original.rows[0].summary, {
  income: 12345,
  expense: 0,
  count: 1,
});
checks++;
await pg.query("select public.reverse_movement($1,'Correção de lançamento')", [
  movement,
]);
await pg.query("select public.reverse_movement($1,'Tentativa repetida')", [
  movement,
]);
await count("select * from public.money_movements", 2);
const total = await pg.query("select public.money_summary() as summary");
assert.deepEqual(total.rows[0].summary, {
  income: 12345,
  expense: 12345,
  count: 2,
});
checks++;
const reversed = await pg.query(
  "select id from public.money_movements where reversal_of=$1",
  [movement],
);
await denied("select public.reverse_movement($1,'Estorno do estorno')", [
  reversed.rows[0].id,
]);
await as(bob);
await count("select * from public.request_messages where request_id=$1", 0, [
  requestA,
]);
await count("select * from public.money_movements", 0);
await denied("select public.reverse_movement($1,'Cliente tentando estornar')", [
  movement,
]);
await pg.exec("reset role; set role anon");
await denied("select * from public.request_messages");
await denied("select * from public.money_movements");
await denied("select public.money_summary()");
await pg.close();
console.log(
  `${checks} verificações passaram: isolamento, permissões, chat, idempotência e estornos.`,
);
