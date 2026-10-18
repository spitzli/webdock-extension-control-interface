import assert from "node:assert/strict";
import { test } from "node:test";
import { createControlInterface, ControlInterfaceError } from "../src/client.ts";
import { operations, validateInput } from "../src/catalog.ts";

const token = "secret-test-api-token";
const origin = "https://console.example.test";
const response = (data: unknown = {}) => Response.json({ success: true, errors: [], data });
const capture = () => {
  const requests: Request[] = [];
  const client = createControlInterface(token, async (input, init) => {
    requests.push(new Request(input, init));
    return response({ domains: [] });
  });
  return { client, requests };
};

test("uses the official client authentication and never follows redirects or caches", async () => {
  const { client, requests } = capture();
  await client.execute("domains.list", { filter_username: "customer-1" });
  const req = requests[0];
  const url = new URL(req.url);
  assert.equal(url.origin, "https://partner.lumaserv.com");
  assert.equal(url.pathname, "/api/v1/json/domains");
  assert.equal(url.searchParams.get("api_token"), token);
  assert.equal(url.searchParams.get("filter_username"), "customer-1");
  assert.equal(req.cache, "no-store");
  assert.equal(req.redirect, "error");
});

test("encodes nested DNS records as PHP form parameters", async () => {
  const { client, requests } = capture();
  await client.execute("dns.add", { zone_id: "20333", records: [{ sld: "@", type: "TXT", data: "a+b & c", ttl: 300 }] });
  assert.equal(requests[0].method, "PUT");
  const body = new URLSearchParams(await requests[0].text());
  assert.equal(body.get("records[0][data]"), "a+b & c");
  assert.equal(body.get("records[0][ttl]"), "300");
  assert.equal(body.get("api_token"), token);
  assert.equal(body.has("zone_id"), false);
});

test("fixes documented discrepancies according to the official PHP client", async () => {
  const { client, requests } = capture();
  await client.execute("servers.tasks", { server_id: "42" });
  await client.execute("addresses.rdns", { address: "192.0.2.1", rdns: "host.example.test" });
  await client.execute("servers.schedule.create", { server_id: "42", action: "restart", interval: "daily" });
  assert.equal(requests[0].method, "GET");
  assert.equal(requests[1].method, "POST");
  assert.equal(new URL(requests[2].url).pathname, "/api/v1/json/servers/virtual/42/scheduledTask/create");
  assert.equal(operations.find(op => op.id === "pxe.create")?.method, "POST");
  assert.ok(operations.find(op => op.id === "contacts.update")?.fields.some(f => f.name === "handle" && f.required));
  assert.ok(operations.find(op => op.id === "payments.create")?.fields.some(f => f.name === "ok_url"));
});

test("rejects unknown fields, path injection and malformed nested data before network access", async () => {
  const { client, requests } = capture();
  for (const [id, input] of [
    ["domains.list", { api_token: "override" }],
    ["servers.get", { server_id: "../delete" }],
    ["servers.get", { server_id: "9007199254740992" }],
    ["servers.schedule.create", { server_id: 1, action: "delete", interval: "daily" }],
    ["dns.add", { zone_id: 1, records: [{ sld: "@", type: "A", data: "invalid-ip" }] }],
    ["dns.add", { zone_id: 1, records: [{ sld: "@", type: "TXT", data: "ok", api_token: "bad" }] }],
    ["dns.delete", { zone_id: 1 }],
    ["payments.create", { payment_method: "PAYPAL", amount: -1, mtid: "1", ok_url: "https://example.test", nok_url: "https://example.test" }],
  ] as const) await assert.rejects(() => client.execute(id, input), ControlInterfaceError);
  assert.equal(requests.length, 0);
});

test("requires exact DNS deletion filters and caps deletion to one record", async () => {
  const { client, requests } = capture();
  await client.execute("dns.delete", { zone_id: 1, sld: "@", type: "A", data: "192.0.2.1", ttl: 300 });
  const body = new URLSearchParams(await requests[0].text());
  assert.equal(body.get("records[0][sld]"), "@");
  assert.equal(body.get("records[0][limit]"), "1");
  assert.equal(body.get("records[0][data]"), "192.0.2.1");
});

test("preserves explicit false and zero without accepting invalid resource sizes", () => {
  assert.deepEqual(validateInput("domains.prices", { ust_inkl: false }), { ust_inkl: false });
  assert.deepEqual(validateInput("servers.order", { cores: 1, memory: 1024, disk: 10, addresses_v4: 0, backups: 0 }), { cores: 1, memory: 1024, disk: 10, addresses_v4: 0, backups: 0 });
  assert.throws(() => validateInput("servers.order", { cores: 0, memory: 1024, disk: 10, addresses_v4: 1, backups: 0 }));
});

test("does not leak upstream errors, tokens or request URLs and never retries writes", async () => {
  for (const fetcher of [
    async () => Response.json({ success: false, errors: [token], data: {} }),
    async () => new Response(token, { status: 401 }),
    async () => new Response("not-json " + token),
    async () => { throw Error("request URL contains " + token); },
    async () => Response.json({ data: {} }),
  ]) {
    let calls = 0;
    const client = createControlInterface(token, async () => { calls++; return fetcher(); });
    await assert.rejects(() => client.execute("servers.start", { server_id: 42 }), error => {
      assert.ok(error instanceof ControlInterfaceError);
      assert.equal(String(error).includes(token), false);
      assert.equal(error.cause, undefined);
      return true;
    });
    assert.equal(calls, 1);
  }
});

test("every catalog operation has a valid executable request and fixed upstream path", async () => {
  assert.equal(new Set(operations.map(op => op.id)).size, operations.length);
  const { client, requests } = capture();
  for (const operation of operations) {
    const input: Record<string, unknown> = {};
    for (const field of operation.fields) {
      if (!field.required) continue;
      input[field.name] = field.choices?.[0] ?? ({ integer: field.min ?? 1, amount: 1.25, boolean: false, records: [{ sld: "@", type: "A", data: "192.0.2.1" }], strings: ["192.0.2.1"], email: "test@example.test", url: "https://example.test/return", ip: "192.0.2.1", text: "test", password: "example-password" })[field.type];
    }
    if (operation.id === "domains.delete") input.delete_time = "expire";
    if (operation.id === "dns.delete") Object.assign(input, { type: "TXT", data: "test", sld: "@" });
    await client.execute(operation.id, input);
    const req = requests.at(-1)!;
    assert.equal(req.method, operation.method, operation.id);
    assert.equal(new URL(req.url).pathname, "/api/v1/json/" + operation.path.replace(/\{[a-z_]+\}/g, "1"), operation.id);
    assert.equal(req.url.includes("{"), false, operation.id);
  }
});

test("rejects oversized responses and preserves success-only operation replies", async () => {
  const large = createControlInterface(token, async () => new Response("x".repeat(4 * 1024 * 1024 + 1)));
  await assert.rejects(() => large.execute("domains.list", {}), ControlInterfaceError);
  const minimal = createControlInterface(token, async () => Response.json({ success: true }));
  assert.equal(await minimal.execute("servers.reinstall", { server_id: 1, password: "example", template: "DEBIAN_9" }), null);
});

test("lists servers using the official SDK endpoint", async () => {
  const { client, requests } = capture();
  await client.execute("servers.list", {});
  assert.equal(new URL(requests[0].url).pathname, "/api/v1/json/servers/virtual");
});

test("uses SDK field names for reverse DNS and payment amounts", async () => {
  const { client, requests } = capture();
  await client.execute("addresses.rdns", { address: "192.0.2.1", rdns: "host.example.test" });
  await client.execute("payments.create", { payment_method: "PAYPAL", amount: 1.25, mtid: "invoice-1", ok_url: "https://example.test/ok", nok_url: "https://example.test/cancel" });
  const rdns = new URLSearchParams(await requests[0].text());
  assert.equal(rdns.get("ip"), "192.0.2.1");
  assert.equal(rdns.has("address"), false);
  const payment = new URLSearchParams(await requests[1].text());
  assert.equal(payment.get("transaction_amount"), "1.25");
  assert.equal(payment.has("amount"), false);
});

test("matches PHP boolean encoding for support SSH keys", async () => {
  const { client, requests } = capture();
  for (const value of [false, true]) await client.execute("servers.reinstall", { server_id: 1, template: "DEBIAN_9", password: "test", support_ssh_key: value });
  assert.equal(new URLSearchParams(await requests[0].text()).get("support_ssh_key"), "0");
  assert.equal(new URLSearchParams(await requests[1].text()).get("support_ssh_key"), "1");
});
