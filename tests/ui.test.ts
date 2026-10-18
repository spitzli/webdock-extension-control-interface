import { describe, expect, test } from 'bun:test';
import { redact, recordsFrom, rowsFrom, loadedZoneData, isCurrentZoneResult } from '../ui/data';
describe('UI data safety',()=>{
  test('keeps all tokens masked after explicit secret reveal',()=>{
    const data={token:'private',api_key:'private',nested:{access_token:'private',password:'revealable'},public:'visible'};
    expect(redact(data,true)).toEqual({token:'••••••••',api_key:'••••••••',nested:{access_token:'••••••••',password:'revealable'},public:'visible'});
    expect((redact(data) as any).nested.password).toBe('••••••••');
    expect(data.token).toBe('private');
    expect(redact({key:'certificate-private-key'})).toEqual({key:'••••••••'});
  });
  test('hides credential URLs even when secrets are revealed',()=>{
    expect(redact({url:'https://example.test/console?token=private'},true)).toEqual({url:'••••••••'});
  });
  test('reads provider zone lists and preserves exact DNS deletion fields',()=>{
    expect(rowsFrom({zones:[{id:123,title:'example.test'}]})).toEqual([{id:123,title:'example.test'}]);
    expect(recordsFrom({title:'example.test',domains:[{id:10,sld:'example',tld:'test'}],records:[{id:9,sld:'@',type:'TXT',data:'hello | world',ttl:0}]})).toEqual([{sld:'@',type:'TXT',data:'hello | world',ttl:0}]);
  });
  test('does not invent TTL or accept malformed DNS rows',()=>{
    expect(recordsFrom({records:[{sld:'www',type:'A',data:'192.0.2.1'},{sld:'bad',type:'A'}]})).toEqual([{sld:'www',type:'A',data:'192.0.2.1'}]);
  });
});

describe('DNS zone selection safety',()=>{
  const zoneA={zoneId:101,data:{records:[{sld:'@',type:'A',data:'192.0.2.1'}]}};
  test('never exposes previous zone records under a newly selected zone',()=>{
    expect(loadedZoneData(zoneA,101)).toEqual(zoneA.data);
    expect(loadedZoneData(zoneA,202)).toBeUndefined();
    expect(loadedZoneData(undefined,202)).toBeUndefined();
  });
  test('rejects responses from an earlier selection or navigation generation',()=>{
    expect(isCurrentZoneResult(101,202,1,2)).toBe(false);
    expect(isCurrentZoneResult(101,101,1,3)).toBe(false);
    expect(isCurrentZoneResult(101,202,2,2)).toBe(false);
    expect(isCurrentZoneResult(202,202,2,2)).toBe(true);
  });
});
