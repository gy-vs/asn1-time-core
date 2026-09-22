import{expect,it}from'vitest';
import{decodeTlv,decodeUtcTime,decodeGeneralizedTime,encodeUtcTime,encodeGeneralizedTime,encodeTime,decodeTime,type UtcInstant}from'../src/index.js';

const enc=new TextEncoder();
const b=(s:string)=>enc.encode(s);
const inst=(year:number,month=1,day=1,hour=0,minute=0,second=0,nanosecond=0):UtcInstant=>({year,month,day,hour,minute,second,nanosecond});
const str=(v:Uint8Array)=>new TextDecoder().decode(v);
const throws=(f:()=>unknown)=>expect(f).toThrow();

it('decodes',()=>expect(decodeTlv(Uint8Array.from([2,1,5])).value[0]).toBe(5));

it('UTCTime 1950/2049 window boundaries',()=>{
  expect(decodeUtcTime(b('491231235959Z')).year).toBe(2049);
  expect(decodeUtcTime(b('500101000000Z')).year).toBe(1950);
  expect(decodeUtcTime(b('000101000000Z')).year).toBe(2000);
  expect(decodeUtcTime(b('991231235959Z')).year).toBe(1999);
});

it('encodes years at the window edges',()=>{
  expect(str(encodeUtcTime(inst(1950)))).toBe('500101000000Z');
  expect(str(encodeUtcTime(inst(2049)))).toBe('490101000000Z');
  throws(()=>encodeUtcTime(inst(1949)));
  throws(()=>encodeUtcTime(inst(2050)));
});

it('leap days are calendar validated, not host-Date rolled over',()=>{
  expect(decodeUtcTime(b('000229120000Z')).day).toBe(29);          // 2000 is a leap year
  expect(decodeGeneralizedTime(b('20040229000000Z')).day).toBe(29); // 2004 leap
  throws(()=>decodeUtcTime(b('990229120000Z')));                    // 1999 not leap
  throws(()=>decodeGeneralizedTime(b('21000229000000Z')));          // 2100 not leap (div 100)
  expect(decodeGeneralizedTime(b('20000229000000Z')).year).toBe(2000); // div 400
  throws(()=>decodeGeneralizedTime(b('20000300000000Z')));
  throws(()=>decodeUtcTime(b('010431120000Z')));                    // April has 30 days
});

it('DER requires explicit seconds',()=>{
  throws(()=>decodeUtcTime(b('4912312359Z')));
  throws(()=>decodeUtcTime(b('49123123Z')));
  throws(()=>decodeGeneralizedTime(b('205001011200Z')));
  throws(()=>decodeGeneralizedTime(b('2050010112Z')));
});

it('Zulu only: offset timezones are rejected',()=>{
  throws(()=>decodeUtcTime(b('491231235959+0000')));
  throws(()=>decodeUtcTime(b('491231235959-0500')));
  throws(()=>decodeGeneralizedTime(b('20500101120000+0100')));
  throws(()=>decodeGeneralizedTime(b('20500101120000Z ')));
});

it('out-of-range fields are rejected without Date normalization',()=>{
  throws(()=>decodeUtcTime(b('001301120000Z'))); // month 13
  throws(()=>decodeUtcTime(b('000001120000Z'))); // month 0
  throws(()=>decodeUtcTime(b('000100120000Z'))); // day 0
  throws(()=>decodeUtcTime(b('000132120000Z'))); // day 32
  throws(()=>decodeUtcTime(b('000101240000Z'))); // hour 24
  throws(()=>decodeUtcTime(b('000101236000Z'))); // minute 60
  throws(()=>decodeUtcTime(b('000101235960Z'))); // second 60
  throws(()=>decodeGeneralizedTime(b('20000001000000Z')));
  throws(()=>decodeGeneralizedTime(b('20001301000000Z')));
});

it('non-digit and truncated input is rejected',()=>{
  throws(()=>decodeUtcTime(b('49123123595Z')));
  throws(()=>decodeUtcTime(b('491231235959')));
  throws(()=>decodeGeneralizedTime(b('20500101120000')));
  throws(()=>decodeGeneralizedTime(b('20500101120000X')));
  throws(()=>decodeGeneralizedTime(b('20500101120000.Z'))); // empty fraction
});

it('GeneralizedTime fractions keep nanosecond precision',()=>{
  expect(decodeGeneralizedTime(b('20500101120000.123456789Z')).nanosecond).toBe(123456789);
  expect(decodeGeneralizedTime(b('20500101120000.000000001Z')).nanosecond).toBe(1);
  expect(decodeGeneralizedTime(b('20500101120000.5Z')).nanosecond).toBe(500000000);
  expect(decodeGeneralizedTime(b('20500101120000Z')).nanosecond).toBe(0);
  throws(()=>decodeGeneralizedTime(b('20500101120000.1234567890Z'))); // beyond nanoseconds
});

it('comma fraction separator is accepted on input',()=>{
  const i=decodeGeneralizedTime(b('20500101120000,123456789Z'));
  expect(i.nanosecond).toBe(123456789);
  expect(str(encodeGeneralizedTime(i))).toBe('20500101120000.123456789Z');
});

it('fractions may only apply to seconds (the smallest unit)',()=>{
  throws(()=>decodeGeneralizedTime(b('205001011200.5Z'))); // fraction on minutes
  throws(()=>decodeGeneralizedTime(b('2050010112.5Z')));   // fraction on hours
});

it('trailing fraction zeros are normalized on re-encoding',()=>{
  expect(str(encodeGeneralizedTime(decodeGeneralizedTime(b('20500101120000.123000Z')))))
    .toBe('20500101120000.123Z');
  expect(str(encodeGeneralizedTime(decodeGeneralizedTime(b('20500101120000.000Z')))))
    .toBe('20500101120000Z');
  expect(str(encodeGeneralizedTime(inst(2050,1,1,12,0,0,100000000)))).toBe('20500101120000.1Z');
  expect(str(encodeGeneralizedTime(inst(2050,1,1,12,0,0,123400000)))).toBe('20500101120000.1234Z');
});

it('canonical encodings survive decode -> encode byte for byte',()=>{
  for(const s of ['491231235959Z','500101000000Z','000229120000Z','990615083015Z']){
    const v=b(s);
    expect(encodeUtcTime(decodeUtcTime(v))).toEqual(v);
  }
  for(const s of ['20500101120000Z','19491231235959Z','20000229000000.123456789Z','20000101000000.000000001Z']){
    const v=b(s);
    expect(encodeGeneralizedTime(decodeGeneralizedTime(v))).toEqual(v);
  }
});

it('encodeTime picks UTCTime in-window and GeneralizedTime otherwise',()=>{
  let t=encodeTime(inst(2049,12,31,23,59,59));
  expect(t.tag).toBe(0x17);
  expect(str(t.value)).toBe('491231235959Z');
  t=encodeTime(inst(1950));
  expect(t.tag).toBe(0x17);
  t=encodeTime(inst(1949,12,31,23,59,59));
  expect(t.tag).toBe(0x18);
  expect(str(t.value)).toBe('19491231235959Z');
  t=encodeTime(inst(2050));
  expect(t.tag).toBe(0x18);
  t=encodeTime(inst(2000,1,1,0,0,0,1));
  expect(t.tag).toBe(0x18);
  expect(str(t.value)).toBe('20000101000000.000000001Z');
});

it('decodes time TLVs and round-trips through bytes',()=>{
  const tlv=decodeTlv(Uint8Array.from([0x17,13,...b('490720123456Z')]));
  const i=decodeTime(tlv);
  expect(i).toEqual(inst(2049,7,20,12,34,56));
  const out=encodeTime(i);
  expect(out.tag).toBe(0x17);
  expect([out.tag,out.length,...out.value]).toEqual([0x17,13,...b('490720123456Z')]);
});

it('rejects years GeneralizedTime cannot render',()=>{
  throws(()=>encodeGeneralizedTime(inst(10000)));
  throws(()=>encodeGeneralizedTime(inst(-1)));
});
