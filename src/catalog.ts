// Public metadata only. Credentials and transport live in client.ts/config.ts.
export type Field = {
  name: string;
  type: "text" | "integer" | "amount" | "boolean" | "records" | "strings" | "password" | "url" | "email" | "ip";
  required?: boolean;
  min?: number;
  max?: number;
  choices?: readonly string[];
};
export type Operation = { id: string; group: string; title: string; method: "GET" | "POST" | "PUT" | "DELETE"; path: string; write: boolean; fields: Field[] };
const text = (name: string, required = true): Field => ({ name, required, type: "text" });
const fields = (names: string, required = true) => names.split(" ").filter(Boolean).map(name => text(name, required));
const integer = (name: string, min = 1, required = true, max = Number.MAX_SAFE_INTEGER): Field => ({ name, type: "integer", min, max, required });
const choice = (name: string, choices: string, required = true): Field => ({ name, type: "text", choices: choices.split(" "), required });
const bool = (name: string): Field => ({ name, type: "boolean" });
const typed = (name: string, type: Field["type"], required = true): Field => ({ name, type, required });
const op = (id: string, group: string, title: string, method: Operation["method"], path: string, fields: Field[] = [], write = method !== "GET"): Operation => ({ id, group, title, method, path, fields, write });
const domain = fields("sld tld");
const registration = [...domain, ...fields("owner admin tech zone ns_1 ns_2"), ...fields("ns_3 ns_4 ns_5", false)];
const customerFilter = fields("filter_username", false);
const contactAddress = [...fields("street number postcode city region country phone"), typed("email", "email"), ...fields("organisation fax countryofbirth idcard idcardauthority idcardissuedate taxnr vatnr dateofbirth placeofbirth regionofbirth registrationnumber", false)];
const zone = [integer("zone_id")];
const capacity = [integer("cores"), integer("memory"), integer("disk"), integer("addresses_v4", 0), integer("backups", 0)];
const certificate = [text("product_key"), integer("runtime"), typed("approval_email", "email"), ...["admin", "tech"].flatMap(prefix => [...fields(`firstname lastname organization region country phone`).map(f => ({ ...f, name: `${prefix}_${f.name}` })), typed(`${prefix}_email`, "email"), text(`${prefix}_fax`, false)])];
const period = [...fields("start end", false), choice("interval", "daily monthly yearly", false)];
const server = (id: string, title: string, method: Operation["method"], suffix = "", extra: Field[] = [], write = method !== "GET") => op(`servers.${id}`, "KVM-Server", title, method, `servers/virtual/{server_id}${suffix}`, [integer("server_id"), ...extra], write);

export const operations: readonly Operation[] = [
  op("domains.list", "Domains", "Domains auflisten / suchen", "GET", "domains", [...fields("filter_domain", false), ...customerFilter]),
  op("domains.register", "Domains", "Domain registrieren", "POST", "domains/create", [...registration, integer("years", 1, false)]),
  op("domains.transfer", "Domains", "Domain transferieren", "POST", "domains/create", [...registration, typed("authcode", "password")]),
  op("domains.check", "Domains", "Domainverfügbarkeit prüfen", "GET", "domains/check", domain),
  op("domains.update", "Domains", "Domaindaten bearbeiten", "PUT", "domains/update", [...registration, ...zone]),
  op("domains.delete", "Domains", "Domainlöschung eintragen", "DELETE", "domains/delete", [...domain, text("delete_time")]),
  op("domains.undelete", "Domains", "Domainlöschung aufheben", "DELETE", "domains/undelete", domain),
  op("domains.prices", "Domains", "Domainpreise abrufen", "GET", "domains/prices", [bool("ust_inkl")]),
  op("contacts.list", "Kunden & Domainkontakte", "Domainkontakte auflisten / suchen", "GET", "domains/handles", [...fields("filter_handle filter_firstname filter_lastname filter_organisation", false), ...customerFilter]),
  op("contacts.create", "Kunden & Domainkontakte", "Domainkontakt erstellen", "POST", "domains/handles/create", [choice("type", "PERS ORG ROLE"), choice("sex", "MALE FEMALE"), ...fields("firstname lastname"), ...contactAddress]),
  op("contacts.update", "Kunden & Domainkontakte", "Domainkontakt bearbeiten", "PUT", "domains/handles/update", [text("handle"), ...contactAddress]),
  op("nameservers.list", "Nameserver & DNS", "Nameserver auflisten / suchen", "GET", "domains/nameservers", [...fields("filter_servername filter_ip", false), ...customerFilter]),
  op("nameservers.create", "Nameserver & DNS", "Nameserver erstellen", "POST", "domains/nameservers/create", fields("servername")),
  op("nameservers.refresh", "Nameserver & DNS", "Nameserver aktualisieren", "GET", "domains/nameservers/refresh", fields("servername"), true),
  op("zones.list", "Nameserver & DNS", "Zonen auflisten / suchen", "GET", "domains/zones", [...fields("filter_title filter_ttl filter_first_ns filter_second_ns", false), ...customerFilter]),
  op("zones.create", "Nameserver & DNS", "Zone erstellen", "POST", "domains/zones/create", [text("title"), integer("ttl", 300, true, 604800), ...fields("ns_1 ns_2"), typed("records", "records")]),
  op("zones.get", "Nameserver & DNS", "Zonendetails abfragen", "GET", "domains/zones/{zone_id}", zone),
  op("dns.add", "Nameserver & DNS", "DNS-Einträge hinzufügen", "PUT", "domains/zones/{zone_id}/entries", [...zone, typed("records", "records")]),
  // Exact filters + limit=1 prevent the provider's optional filters from deleting a whole zone.
  op("dns.delete", "Nameserver & DNS", "DNS-Eintrag löschen", "DELETE", "domains/zones/{zone_id}/entries", [...zone, text("sld"), text("type"), text("data"), integer("ttl", 0, false, 2147483647)]),
  op("certificates.list", "SSL-Zertifikate", "Zertifikate auflisten / suchen", "GET", "ssl_certificates", [...fields("filter_domain", false), ...customerFilter]),
  op("certificates.create-csr", "SSL-Zertifikate", "Zertifikat mit CSR bestellen", "POST", "ssl_certificates/create", [text("csr"), ...certificate]),
  op("certificates.create", "SSL-Zertifikate", "Zertifikat ohne CSR bestellen", "POST", "ssl_certificates/create", [text("name"), ...certificate]),
  op("certificates.refund", "SSL-Zertifikate", "Zertifikat stornieren", "POST", "ssl_certificates/{order_id}/requestRefund", [integer("order_id")]),
  op("certificates.approvers", "SSL-Zertifikate", "Approver-Mails abrufen", "GET", "ssl_certificates/approverList", fields("product_key name")),
  op("servers.list", "KVM-Server", "Server auflisten", "GET", "servers/virtual"),
  op("servers.order", "KVM-Server", "Server bestellen", "POST", "servers/virtual/order", [...capacity, typed("password", "password", false), ...fields("template hostname", false)]),
  server("get", "Serverdetails abfragen", "GET"),
  server("tasks", "Tasks eines Servers abfragen", "GET", "/tasks"),
  server("backups", "Backups auflisten", "GET", "/backups"),
  server("addresses", "IP-Adressen auflisten", "GET", "/addresses"),
  server("networks", "Netzwerke auflisten", "GET", "/networks"),
  server("start", "Server starten", "POST", "/start"),
  server("shutdown", "Server herunterfahren", "POST", "/shutdown"),
  server("stop", "Server stoppen", "POST", "/stop"),
  server("restart", "Server neustarten", "POST", "/restart"),
  server("backup.create", "Backup erstellen", "POST", "/createBackup", fields("title mode", false)),
  server("reinstall", "Server neuinstallieren", "POST", "/reinstall", [typed("password", "password"), text("template"), bool("support_ssh_key")]),
  server("schedules", "Geplante Tasks auflisten", "GET", "/scheduledTasks"),
  server("vnc", "NoVNC-Console abrufen", "GET", "/vnc"),
  server("backup.restore", "Backup wiederherstellen", "POST", "/backups/restore", [integer("backup_id")]),
  server("backup.delete", "Backup löschen", "POST", "/backups/delete", [integer("backup_id")]),
  server("graphs", "RRD-Informationen abrufen", "GET", "/graphs", [choice("timeframe", "hour day week month year"), choice("cf", "AVERAGE MAX", false)]),
  server("schedule.create", "Geplanten Task erstellen", "POST", "/scheduledTask/create", [choice("action", "start restart shutdown createBackup"), choice("interval", "hourly daily weekly monthly yearly"), text("first_execution", false)]),
  server("schedule.delete", "Geplanten Task löschen", "POST", "/scheduledTask/{task_id}/delete", [integer("task_id")]),
  server("reconfigure", "Serverkonfiguration ändern", "POST", "/reconfigure", capacity),
  server("delete", "Server löschen", "POST", "/delete"),
  op("addresses.rdns", "IP-Adressen & Traffic", "rDNS-Eintrag setzen / entfernen", "POST", "addresses/single/rdns", [typed("address", "ip"), text("rdns", false)]),
  op("traffic.list", "IP-Adressen & Traffic", "Traffic abrufen", "GET", "traffic", period),
  op("traffic.addresses", "IP-Adressen & Traffic", "Traffic nach IP-Adresse", "GET", "traffic/addresses", [typed("addresses", "strings", false), ...period]),
  op("ddos.list", "IP-Adressen & Traffic", "DDoS-Alerts auflisten / filtern", "GET", "ddos-alerts", [typed("addresses", "strings", false), ...fields("start end", false)]),
  op("accounting.balance", "Buchhaltung & Zahlungen", "Kontoinformationen abrufen", "GET", "accounting/balance"),
  op("pxe.create", "PXE-Installationen", "PXE-Installation anlegen", "POST", "datacenter/pxe_installations/create", [typed("address", "ip"), ...fields("mac_address hostname template"), typed("password", "password"), bool("support_ssh_key"), choice("raid_level", "RAID_0 RAID_1 RAID_5", false), integer("raid_disk_count", 1, false), text("network_name", false), typed("commands", "strings", false)]),
  op("pxe.get", "PXE-Installationen", "Installationsdetails abfragen", "GET", "datacenter/pxe_installations/{installation_id}", [integer("installation_id")]),
  op("payments.create", "Buchhaltung & Zahlungen", "Zahlungslink erstellen", "POST", "payment", [choice("payment_method", "PAYPAL SOFORT_TRANSFER PAYSAFECARD"), typed("amount", "amount"), text("mtid"), typed("ok_url", "url"), typed("nok_url", "url"), typed("pn_url", "url", false)]),
  op("payments.get", "Buchhaltung & Zahlungen", "Zahlungsdetails abrufen", "GET", "payment", fields("mtid")),
];

export class ControlInterfaceError extends Error {
  constructor(message: string, readonly status = 400) { super(message); this.name = "ControlInterfaceError"; }
}
export function getOperation(id: string): Operation {
  const operation = operations.find(item => item.id === id);
  if (!operation) throw new ControlInterfaceError("Unbekannte Control-Interface-Aktion.");
  return operation;
}
const isObject = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
export const dnsTypes = ["A", "AAAA", "SRV", "CNAME", "TXT", "MX", "PTR", "HTTP_FRAME", "HTTP_REDIRECT"] as const;

// Shared shape validation; IP validation is completed by the server transport.
export function validateInput(id: string, input: unknown): Record<string, unknown> {
  const operation = getOperation(id);
  if (!isObject(input)) throw new ControlInterfaceError("Parameter müssen ein Objekt sein.");
  const allowed = new Set(operation.fields.map(field => field.name));
  if (Object.keys(input).some(key => !allowed.has(key))) throw new ControlInterfaceError("Unbekannter Parameter.");
  const result: Record<string, unknown> = {};
  const invalid = (name: string): never => { throw new ControlInterfaceError(`Ungültiger oder fehlender Parameter: ${name}.`); };
  for (const field of operation.fields) {
    let value = input[field.name];
    if (value === undefined || value === null || value === "") {
      if (field.required) invalid(field.name);
      continue;
    }
    if (field.type === "integer" || field.type === "amount") {
      if (typeof value === "string" && /^\d+(?:\.\d{1,2})?$/.test(value)) value = Number(value);
      if (typeof value !== "number" || !Number.isFinite(value)) invalid(field.name);
      const number = value as number;
      if (field.type === "integer" ? !Number.isSafeInteger(number) || number < (field.min ?? 1) || number > (field.max ?? Number.MAX_SAFE_INTEGER) : number <= 0 || number > 1_000_000 || Math.abs(number * 100 - Math.round(number * 100)) > 1e-7) invalid(field.name);
    } else if (field.type === "boolean") {
      if (value === "true" || value === "false") value = value === "true";
      if (typeof value !== "boolean") invalid(field.name);
    } else if (field.type === "records" || field.type === "strings") {
      if (!Array.isArray(value) || value.length > 100 || (field.required && value.length === 0)) invalid(field.name);
      if (field.type === "records") {
        value = (value as unknown[]).map(record => {
          if (!isObject(record) || Object.keys(record).some(key => !["sld", "type", "data", "ttl"].includes(key))) invalid(field.name);
          const r = record as Record<string, unknown>;
          for (const key of ["sld", "type", "data"]) if (typeof r[key] !== "string" || !(r[key] as string).length || (r[key] as string).length > 4096 || /[\x00-\x1f\x7f]/.test(r[key] as string)) invalid(field.name);
          if (!dnsTypes.includes(r.type as typeof dnsTypes[number])) invalid(field.name);
          if (r.ttl != null && (!Number.isSafeInteger(r.ttl) || Number(r.ttl) < 0 || Number(r.ttl) > 2147483647)) invalid(field.name);
          return { sld: r.sld, type: r.type, data: r.data, ...(r.ttl == null ? {} : { ttl: r.ttl }) };
        });
      } else if ((value as unknown[]).some(item => typeof item !== "string" || !item.length || item.length > 4096 || /[\x00-\x1f\x7f]/.test(item))) invalid(field.name);
    } else {
      if (typeof value !== "string" || value.length > 16384 || !value.trim() || /[\x00\x7f]/.test(value)) invalid(field.name);
      if (field.choices && !field.choices.includes(value as string)) invalid(field.name);
      if (field.type === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value as string)) invalid(field.name);
      if (field.type === "url") {
        try { const url = new URL(value as string); if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) invalid(field.name); }
        catch { invalid(field.name); }
      }
    }
    result[field.name] = value;
  }
  if (id === "domains.delete" && !/^(now|expire|[0-9]+)$/.test(String(result.delete_time))) invalid("delete_time");
  if (id === "dns.delete" && !dnsTypes.includes(result.type as typeof dnsTypes[number])) invalid("type");
  if (id === "pxe.create" && result.raid_level && !result.raid_disk_count) invalid("raid_disk_count");
  return result;
}
