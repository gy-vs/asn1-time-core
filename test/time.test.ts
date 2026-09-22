import{describe,expect,it}from'vitest';
import{decodeGeneralizedTime,decodeTlv,decodeUtcTime,encodeGeneralizedTime,encodeTlv,encodeUtcTime,formatGeneralizedTime,formatUtcTime,GENERALIZED_TIME_TAG,instantNanos,parseGeneralizedTime,parseUtcTime,UTC_TIME_TAG}from'../src/index.js';

const bytes=(s:string)=>Uint8Array.from([...s].map(c=>c.charCodeAt(0)));

describe('UTCTime year window',()=>{
  it.each([
    ['500101000000Z',-631152000n],   // 1950-01-01, lower window bound
    ['491231235959Z',2524607999n],   // 2049-12-31T23:59:59, upper window bound
    ['000101000000Z',946684800n],    // 00 -> 2000
    ['991231235959Z',946684799n],    // 99 -> 1999
    ['700101000000Z',0n],            // 70 -> 1970 epoch
    ['650101000000Z',-157766400n],   // pre-epoch, negative instant
    ['850701120000Z',489067200n],
  ])('parses %s',(text,epochSeconds)=>{
    const t=parseUtcTime(text);
    expect(t.epochSeconds).toBe(epochSeconds);
    expect(t.fraction).toBe('');
    expect(formatUtcTime(t)).toBe(text);
  });
});

describe('leap days',()=>{
  it.each(['20000229120000Z','240229000000Z','00000229000000Z','20240229120000Z'])('accepts %s',text=>{
    const t=text.length===13?parseUtcTime(text):parseGeneralizedTime(text);
    expect((text.length===13?formatUtcTime:formatGeneralizedTime)(t)).toBe(text);
  });
  it('2000-02-29T12:00:00Z has the right instant',()=>{
    expect(parseGeneralizedTime('20000229120000Z').epochSeconds).toBe(951825600n);
  });
  it.each(['19000229120000Z','21000229000000Z','20230229000000Z','01000229000000Z','010229000000Z','20230230000000Z','20230431000000Z'])('rejects %s',text=>{
    expect(()=>text.length===13?parseUtcTime(text):parseGeneralizedTime(text)).toThrow(/day out of range/);
  });
});

describe('DER rejects non-canonical forms',()=>{
  it.each(['2301010000Z','202301010000Z','2023010100Z'])('rejects missing seconds %s',text=>{
    expect(()=>parseUtcTime(text)).toThrow();
    expect(()=>parseGeneralizedTime(text)).toThrow();
  });
  it.each(['230101000000+0500','230101000000-0500','20230101000000+0800','20230101000000-0100','20230101000000'])('rejects offset/no-Z %s',text=>{
    expect(()=>parseUtcTime(text)).toThrow();
    expect(()=>parseGeneralizedTime(text)).toThrow();
  });
  it('rejects fractions in UTCTime',()=>expect(()=>parseUtcTime('230101000000.5Z')).toThrow());
  it('rejects fraction on non-seconds units',()=>{
    expect(()=>parseGeneralizedTime('2023010100,5Z')).toThrow();
    expect(()=>parseGeneralizedTime('202301010000.5Z')).toThrow();
  });
  it('rejects lowercase z and junk',()=>{
    for(const bad of['','Z','20230101000000z','23010100000z','2023010100000Z','2023010100000XZ','abcdefghijklm'])
      expect(()=>parseGeneralizedTime(bad)).toThrow();
  });
  it('UTCTime and GeneralizedTime shapes are not interchangeable',()=>{
    expect(()=>parseUtcTime('20230101000000Z')).toThrow();
    expect(()=>parseGeneralizedTime('230101000000Z')).toThrow();
  });
});

describe('fractions',()=>{
  it('accepts comma decimal mark and canonicalizes to dot',()=>{
    const t=parseGeneralizedTime('20230101120000,5Z');
    expect(t.fraction).toBe('5');
    expect(instantNanos(t)).toBe(500000000);
    expect(formatGeneralizedTime(t)).toBe('20230101120000.5Z');
  });
  it.each([
    ['20230101120000.500Z','5','20230101120000.5Z'],
    ['20230101120000.000Z','','20230101120000Z'],
    ['20230101120000.1203000Z','1203','20230101120000.1203Z'],
  ])('normalizes trailing zeros %s',(text,fraction,canonical)=>{
    const t=parseGeneralizedTime(text);
    expect(t.fraction).toBe(fraction);
    expect(formatGeneralizedTime(t)).toBe(canonical);
  });
  it('keeps nanosecond precision',()=>{
    const t=parseGeneralizedTime('20230922123045.123456789Z');
    expect(t.epochSeconds).toBe(1695385845n);
    expect(instantNanos(t)).toBe(123456789);
    expect(formatGeneralizedTime(t)).toBe('20230922123045.123456789Z');
  });
  it('preserves sub-nanosecond digits losslessly',()=>{
    const t=parseGeneralizedTime('20230101000000.1234567891234Z');
    expect(instantNanos(t)).toBe(123456789);
    expect(formatGeneralizedTime(t)).toBe('20230101000000.1234567891234Z');
  });
  it('keeps leading zeros of the fraction',()=>{
    const t=parseGeneralizedTime('20230101000000.000000001Z');
    expect(instantNanos(t)).toBe(1);
    expect(formatGeneralizedTime(t)).toBe('20230101000000.000000001Z');
  });
  it('handles negative instants with fractions',()=>{
    const t=parseGeneralizedTime('19691231235959.5Z');
    expect(t.epochSeconds).toBe(-1n);
    expect(instantNanos(t)).toBe(500000000);
    expect(formatGeneralizedTime(t)).toBe('19691231235959.5Z');
  });
});

describe('out-of-range fields',()=>{
  it.each([
    '20230001000000Z','20231301000000Z', // month
    '20230100000000Z','20230132000000Z', // day
    '20230101240000Z',                   // hour
    '20230101006000Z',                   // minute
    '20230101000060Z','20230101000099Z', // second (60 = leap second, not DER)
  ])('rejects %s',text=>expect(()=>parseGeneralizedTime(text)).toThrow(/out of range/));
  it.each(['231301000000Z','230101240000Z','230101000060Z','230132000000Z'])('rejects %s',text=>expect(()=>parseUtcTime(text)).toThrow(/out of range/));
});

describe('encoding range checks',()=>{
  it('UTCTime rejects years outside 1950-2049',()=>{
    expect(()=>formatUtcTime({epochSeconds:2524608000n,fraction:''})).toThrow(/window/);   // 2050-01-01
    expect(()=>formatUtcTime({epochSeconds:-631152001n,fraction:''})).toThrow(/window/);   // 1949-12-31T23:59:59
  });
  it('UTCTime rejects fractional seconds',()=>{
    expect(()=>formatUtcTime({epochSeconds:0n,fraction:'5'})).toThrow(/fraction/);
  });
  it('GeneralizedTime rejects years outside 0000-9999',()=>{
    expect(()=>formatGeneralizedTime({epochSeconds:253402300800n,fraction:''})).toThrow(/range/);  // 10000-01-01
    expect(()=>formatGeneralizedTime({epochSeconds:-62198841600n,fraction:''})).toThrow(/range/);  // year -1
    expect(formatGeneralizedTime({epochSeconds:-62167219200n,fraction:''})).toBe('00000101000000Z');
    expect(formatGeneralizedTime({epochSeconds:253402300799n,fraction:''})).toBe('99991231235959Z');
  });
  it('rejects non-digit fractions',()=>{
    expect(()=>formatGeneralizedTime({epochSeconds:0n,fraction:'1a'})).toThrow(/fraction/);
  });
});

describe('no host-Date year remapping',()=>{
  it.each(['00000101000000Z','00990615000000Z','00000229000000Z','09991231235959Z'])('round-trips %s exactly',text=>{
    expect(formatGeneralizedTime(parseGeneralizedTime(text))).toBe(text);
  });
});

describe('canonical re-encoding is byte-identical',()=>{
  const utc=['500101000000Z','491231235959Z','700101000000Z','000229123456Z','240229235959Z'];
  const gen=['00000101000000Z','99991231235959Z','20000229235959Z','20230101120000Z','20230101120000.5Z','20230101120000.123456789Z','19691231235959.5Z'];
  it.each(utc)('UTCTime %s',text=>{
    expect(encodeUtcTime(parseUtcTime(text))).toEqual(bytes(text));
    const tlv=encodeTlv(UTC_TIME_TAG,bytes(text));
    expect(encodeTlv(UTC_TIME_TAG,encodeUtcTime(decodeUtcTime(decodeTlv(tlv).value)))).toEqual(tlv);
  });
  it.each(gen)('GeneralizedTime %s',text=>{
    expect(encodeGeneralizedTime(parseGeneralizedTime(text))).toEqual(bytes(text));
    const tlv=encodeTlv(GENERALIZED_TIME_TAG,bytes(text));
    expect(encodeTlv(GENERALIZED_TIME_TAG,encodeGeneralizedTime(decodeGeneralizedTime(decodeTlv(tlv).value)))).toEqual(tlv);
  });
});
