export type Tlv={tag:number;length:number;value:Uint8Array};export function decodeTlv(data:Uint8Array):Tlv{if(data.length<2)throw new Error('truncated');const tag=data[0],length=data[1];if(length&128)throw new Error('long length unsupported');if(data.length<2+length)throw new Error('truncated');return{tag,length,value:data.slice(2,2+length)}}export function decodeInteger(bytes:Uint8Array){let value=0n;for(const byte of bytes)value=(value<<8n)|BigInt(byte);return value}

// ---- UTCTime (0x17) and GeneralizedTime (0x18) ----
// Every field is checked with plain integer arithmetic. The host Date
// constructor is never used, so out-of-range fields cannot be silently
// rolled over into adjacent months/years.

export interface UtcInstant{
  year:number;      // full year (UTCTime two-digit years map into 1950..2049)
  month:number;     // 1..12
  day:number;       // 1..31
  hour:number;      // 0..23
  minute:number;    // 0..59
  second:number;    // 0..59 (DER mandates the seconds field)
  nanosecond:number;// 0..999_999_999 (GeneralizedTime fractions only)
}

export const UTC_TIME_TAG=0x17;
export const GENERALIZED_TIME_TAG=0x18;

const textEncoder=new TextEncoder();
const toBytes=(s:string):Uint8Array=>textEncoder.encode(s);
const pad2=(n:number)=>n<10?'0'+n:''+n;
const isDigit=(c:number)=>c>=48&&c<=57;

function isLeap(year:number):boolean{return year%4===0&&(year%100!==0||year%400===0)}
function daysInMonth(year:number,month:number):number{
  if(month===2)return isLeap(year)?29:28;
  return month===4||month===6||month===9||month===11?30:31;
}

function validInstant(year:number,month:number,day:number,hour:number,minute:number,second:number,nanosecond:number):UtcInstant{
  if(month<1||month>12)throw new Error('invalid month');
  if(day<1||day>daysInMonth(year,month))throw new Error('invalid day');
  if(hour<0||hour>23)throw new Error('invalid hour');
  if(minute<0||minute>59)throw new Error('invalid minute');
  if(second<0||second>59)throw new Error('invalid second');
  if(nanosecond<0||nanosecond>999999999)throw new Error('invalid fraction of a second');
  return {year,month,day,hour,minute,second,nanosecond};
}

function readFixedDigits(v:Uint8Array,pos:number,count:number):[number,number]{
  let n=0;
  for(let i=0;i<count;i++){
    const c=v[pos++];
    if(!isDigit(c))throw new Error('invalid time encoding');
    n=n*10+(c-48);
  }
  return [n,pos];
}

// DER UTCTime is fixed-width YYMMDDHHMMSSZ: Zulu only, seconds mandatory,
// no fractions and no offsets. Two-digit years: 00..49 -> 2000..2049,
// 50..99 -> 1950..1999.
export function decodeUtcTime(value:Uint8Array):UtcInstant{
  if(value.length!==13)throw new Error('invalid UTCTime');
  let p=0,yy:number,month:number,day:number,hour:number,minute:number,second:number;
  [yy,p]=readFixedDigits(value,p,2);
  [month,p]=readFixedDigits(value,p,2);
  [day,p]=readFixedDigits(value,p,2);
  [hour,p]=readFixedDigits(value,p,2);
  [minute,p]=readFixedDigits(value,p,2);
  [second,p]=readFixedDigits(value,p,2);
  if(value[p]!==90)throw new Error('UTCTime must be Zulu');
  return validInstant(yy<50?2000+yy:1900+yy,month,day,hour,minute,second,0);
}

// DER GeneralizedTime is YYYYMMDDHHMMSS[.fff...]Z: Zulu only, seconds
// mandatory, and the fraction (if present) applies to seconds, the smallest
// unit. Comma is tolerated on input; period is the canonical DER separator.
export function decodeGeneralizedTime(value:Uint8Array):UtcInstant{
  if(value.length<15)throw new Error('invalid GeneralizedTime');
  let p=0,year:number,month:number,day:number,hour:number,minute:number,second:number;
  [year,p]=readFixedDigits(value,p,4);
  [month,p]=readFixedDigits(value,p,2);
  [day,p]=readFixedDigits(value,p,2);
  [hour,p]=readFixedDigits(value,p,2);
  [minute,p]=readFixedDigits(value,p,2);
  [second,p]=readFixedDigits(value,p,2);
  let nanosecond=0;
  if(value[p]===46||value[p]===44){
    p++;
    let digits=0,frac=0;
    while(isDigit(value[p])){
      if(digits===9)throw new Error('fraction exceeds nanosecond precision');
      frac=frac*10+(value[p++]-48);
      digits++;
    }
    if(digits===0)throw new Error('empty fraction');
    for(let i=digits;i<9;i++)frac*=10;
    nanosecond=frac;
  }
  if(value[p++]!==90)throw new Error('GeneralizedTime must be Zulu');
  if(p!==value.length)throw new Error('invalid GeneralizedTime');
  return validInstant(year,month,day,hour,minute,second,nanosecond);
}

function fractionString(nanosecond:number):string{
  let f=String(nanosecond);
  while(f.length<9)f='0'+f;
  let end=f.length;
  while(end>0&&f[end-1]==='0')end--; // DER: strip trailing zeros
  return end===0?'':'.'+f.slice(0,end);
}

// Canonical UTCTime body: YYMMDDHHMMSSZ, usable only for years 1950..2049;
// fractional seconds cannot be expressed in UTCTime.
export function encodeUtcTime(instant:UtcInstant):Uint8Array{
  validInstant(instant.year,instant.month,instant.day,instant.hour,instant.minute,instant.second,instant.nanosecond);
  if(instant.year<1950||instant.year>2049)throw new Error('UTCTime year must be within 1950..2049');
  if(instant.nanosecond!==0)throw new Error('UTCTime cannot encode fractions of a second');
  const yy=instant.year-(instant.year>=2000?2000:1900);
  return toBytes(pad2(yy)+pad2(instant.month)+pad2(instant.day)+pad2(instant.hour)+pad2(instant.minute)+pad2(instant.second)+'Z');
}

// Canonical GeneralizedTime body: YYYYMMDDHHMMSS[.f]Z, trailing fraction
// zeros stripped (an all-zero fraction is omitted), period separator.
export function encodeGeneralizedTime(instant:UtcInstant):Uint8Array{
  validInstant(instant.year,instant.month,instant.day,instant.hour,instant.minute,instant.second,instant.nanosecond);
  if(instant.year<0||instant.year>9999)throw new Error('GeneralizedTime year must be within 0..9999');
  const y=String(instant.year).padStart(4,'0');
  const core=y+pad2(instant.month)+pad2(instant.day)+pad2(instant.hour)+pad2(instant.minute)+pad2(instant.second);
  return toBytes(core+fractionString(instant.nanosecond)+'Z');
}

// Canonical tag selection: UTCTime for whole-second instants in 1950..2049,
// GeneralizedTime for out-of-window years or any sub-second precision.
export function encodeTime(instant:UtcInstant):Tlv{
  if(instant.year>=1950&&instant.year<=2049&&instant.nanosecond===0){
    const value=encodeUtcTime(instant);
    return {tag:UTC_TIME_TAG,length:value.length,value};
  }
  const value=encodeGeneralizedTime(instant);
  return {tag:GENERALIZED_TIME_TAG,length:value.length,value};
}

export function decodeTime(tlv:Tlv):UtcInstant{
  if(tlv.tag===UTC_TIME_TAG)return decodeUtcTime(tlv.value);
  if(tlv.tag===GENERALIZED_TIME_TAG)return decodeGeneralizedTime(tlv.value);
  throw new Error('not a time TLV');
}
