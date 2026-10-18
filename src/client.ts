import { isIP } from "node:net";
import { ControlInterfaceError, getOperation, validateInput } from "./catalog";
export { ControlInterfaceError } from "./catalog";

const baseURL = "https://partner.lumaserv.com/api/v1/json/";
const maxResponseBytes = 4 * 1024 * 1024;
export type ControlInterface = ReturnType<typeof createControlInterface>;

function append(form: URLSearchParams, name: string, value: unknown): void {
  if (value == null) return;
  if (typeof value === "object") {
    for (const [key, item] of Object.entries(value)) append(form, `${name}[${key}]`, item);
  } else form.append(name, typeof value === "boolean" ? (value ? "1" : "0") : String(value));
}

async function readJSON(response: Response): Promise<unknown> {
  if (Number(response.headers.get("content-length")) > maxResponseBytes) throw Error("response-size");
  const reader = response.body?.getReader();
  if (!reader) throw Error("response-body");
  let length = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maxResponseBytes) { await reader.cancel(); throw Error("response-size"); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

export function createControlInterface(apiToken: string, fetcher: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response> = fetch) {
  if (!/^[^\s\x00-\x1f\x7f]{1,4096}$/.test(apiToken)) throw new ControlInterfaceError("Ungültige Control-Interface-Konfiguration.", 503);
  return {
    async execute(id: string, input: unknown): Promise<unknown> {
      const operation = getOperation(id);
      const params = validateInput(id, input);
      for (const field of operation.fields) {
        if (field.type === "ip" && !isIP(String(params[field.name]))) throw new ControlInterfaceError(`Ungültige IP-Adresse: ${field.name}.`);
      }
      if (Array.isArray(params.addresses) && params.addresses.some(address => typeof address !== "string" || !isIP(address))) throw new ControlInterfaceError("Ungültige IP-Adressen.");
      const records = params.records ?? (id === "dns.delete" ? [params] : []);
      if (Array.isArray(records)) for (const record of records) {
        if ((record.type === "A" && isIP(record.data) !== 4) || (record.type === "AAAA" && isIP(record.data) !== 6)) throw new ControlInterfaceError("Ungültige IP-Adresse im DNS-Eintrag.");
      }
      const path = operation.path.replace(/\{([a-z_]+)\}/g, (_, name: string) => {
        const value = params[name];
        delete params[name];
        return encodeURIComponent(String(value));
      });
      if (id === "dns.delete") {
        const record = { ...params, limit: 1 };
        for (const key of Object.keys(params)) delete params[key];
        params.records = [record];
      }
      // Parameter names differ between the prose docs and the official SDK.
      if (id === "addresses.rdns") {
        params.ip = params.address;
        params.rdns ??= "";
        delete params.address;
      }
      if (id === "payments.create") {
        params.transaction_amount = params.amount;
        delete params.amount;
      }
      // The upstream client sends authentication in the query and in write bodies.
      const url = new URL(path, baseURL);
      url.searchParams.set("api_token", apiToken);
      const form = new URLSearchParams({ api_token: apiToken });
      for (const [key, value] of Object.entries(params)) append(operation.method === "GET" ? url.searchParams : form, key, value);
      let response: Response;
      try {
        response = await fetcher(url, {
          method: operation.method,
          cache: "no-store",
          redirect: "error",
          signal: AbortSignal.timeout(30_000),
          headers: { Accept: "application/json", ...(operation.method === "GET" ? {} : { "Content-Type": "application/x-www-form-urlencoded" }) },
          ...(operation.method === "GET" ? {} : { body: form.toString() }),
        });
      } catch {
        throw new ControlInterfaceError(operation.write ? "Keine eindeutige Antwort. Zustand beim Anbieter prüfen, bevor die Aktion erneut ausgeführt wird." : "Control Interface ist nicht erreichbar.", 502);
      }
      if (!response.ok) {
        await response.body?.cancel();
        throw new ControlInterfaceError(response.status === 401 || response.status === 403 ? "Control Interface hat den Zugriff abgelehnt. API-Key und Berechtigungen prüfen." : `Control Interface meldet HTTP ${response.status}. Zustand vor erneutem Ausführen prüfen.`, 502);
      }
      let envelope: unknown;
      try { envelope = await readJSON(response); }
      catch { throw new ControlInterfaceError("Ungültige Antwort von Control Interface. Zustand vor erneutem Ausführen prüfen.", 502); }
      if (!envelope || typeof envelope !== "object" || !("success" in envelope) || envelope.success !== true || ("errors" in envelope && Array.isArray(envelope.errors) && envelope.errors.length > 0)) throw new ControlInterfaceError("Control Interface hat die Aktion nicht bestätigt. Eingaben und Zustand beim Anbieter prüfen.", 502);
      // Some operations (e.g. reinstall) only return success, without data.
      return "data" in envelope ? envelope.data : null;
    },
  };
}
