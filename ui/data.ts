export type Row = Record<string, unknown>;
export type DnsRecord = { sld: string; type: string; data: string; ttl?: number };
export function isObject(value: unknown): value is Row { return !!value && typeof value === 'object' && !Array.isArray(value); }
export function rowsFrom(value: unknown): Row[] {
  if (Array.isArray(value)) return value.filter(isObject);
  if (!isObject(value)) return [];
  for (const key of ['zones','domains','servers','contacts','handles','domain_handles','certificates','ssl_certificates','records','entries','items','results','addresses','tasks','backups','networks','data']) {
    const found = value[key];
    if (Array.isArray(found)) return found.filter(isObject);
    if (isObject(found)) { const nested = rowsFrom(found); if (nested.length) return nested; }
  }
  return [];
}
export function redact(value: unknown, reveal = false, key = ''): unknown {
  const always = /(?:api.?key|token|authorization)/i.test(key);
  const sensitive = /(?:^key$|password|passwd|secret|token|authcode|private.?key|vnc|console.?url)/i.test(key);
  if (always || (!reveal && sensitive)) return value == null ? value : '••••••••';
  if (Array.isArray(value)) return value.map(item => redact(item, reveal, key));
  if (isObject(value)) return Object.fromEntries(Object.entries(value).map(([name,item]) => [name,redact(item,reveal,name)]));
  if (typeof value === 'string' && /(?:https?:\/\/)[^\s]*(?:[?&](?:token|key|password|secret|auth)=|:[^/@]+@)/i.test(value)) return '••••••••';
  return value;
}
export function recordsFrom(value: unknown): DnsRecord[] {
  const source = isObject(value) ? value.records ?? value.entries ?? (isObject(value.zone) ? value.zone.records ?? value.zone.entries : undefined) ?? value : value;
  return rowsFrom(source).filter(row => typeof row.sld === 'string' && typeof row.type === 'string' && typeof row.data === 'string').map(row => ({sld: row.sld as string,type:row.type as string,data:row.data as string,...(row.ttl == null ? {} : {ttl:Number(row.ttl)})}));
}
export function display(value: unknown): string { return value == null ? '—' : typeof value === 'object' ? JSON.stringify(value) : String(value); }

export type ZoneSnapshot = { zoneId: number; data: unknown };
export function loadedZoneData(snapshot: ZoneSnapshot | undefined, selectedZoneId: number): unknown {
  return snapshot?.zoneId === selectedZoneId ? snapshot.data : undefined;
}
export function isCurrentZoneResult(requestedZoneId: number, selectedZoneId: number, requestedGeneration: number, currentGeneration: number): boolean {
  return requestedGeneration === currentGeneration && requestedZoneId === selectedZoneId;
}
