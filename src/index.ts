export type Tlv={tag:number;length:number;value:Uint8Array};export function decodeTlv(data:Uint8Array):Tlv{if(data.length<2)throw new Error('truncated');const tag=data[0],length=data[1];if(length&128)throw new Error('long length unsupported');if(data.length<2+length)throw new Error('truncated');return{tag,length,value:data.slice(2,2+length)}}export function encodeTlv(tag:number,value:Uint8Array):Uint8Array{if(tag<0||tag>255)throw new Error('unsupported tag');if(value.length>=128)throw new Error('long length unsupported');const out=new Uint8Array(2+value.length);out[0]=tag;out[1]=value.length;out.set(value,2);return out}export function decodeInteger(bytes:Uint8Array){let value=0n;for(const byte of bytes)value=(value<<8n)|BigInt(byte);return value}

export const UTC_TIME_TAG=23;
export const GENERALIZED_TIME_TAG=24;

// Precision-preserving UTC instant: whole seconds since 1970-01-01T00:00:00Z
// plus the fractional-second digits ('' when integral, no trailing zeros).
export type UtcInstant={readonly epochSeconds:bigint;readonly fraction:string};

const SECONDS_PER_DAY=86400n;

function isLeapYear(y:number):boolean{return y%4===0&&(y%100!==0||y%400===0)}
function daysInMonth(y:number,m:number):number{return[31,isLeapYear(y)?29:28,31,30,31,30,31,31,30,31,30,31][m-1]}

// Howard Hinnant's civil<->days algorithms; no host Date, so years 0000-9999
// are exact and never silently remapped.
function daysFromCivil(y:number,m:number,d:number):number{
  const yy=m<=2?y-1:y;
  const era=Math.floor(yy/400);
  const yoe=yy-era*400;
  const mp=m>2?m-3:m+9;
  const doy=Math.floor((153*mp+2)/5)+d-1;
  const doe=yoe*365+Math.floor(yoe/4)-Math.floor(yoe/100)+doy;
  return era*146097+doe-719468;
}
function civilFromDays(z:number):[number,number,number]{
  const zz=z+719468;
  const era=Math.floor(zz/146097);
  const doe=zz-era*146097;
  const yoe=Math.floor((doe-Math.floor(doe/1460)+Math.floor(doe/36524)-Math.floor(doe/146096))/365);
  const y=yoe+era*400;
  const doy=doe-(365*yoe+Math.floor(yoe/4)-Math.floor(yoe/100));
  const mp=Math.floor((5*doy+2)/153);
  const d=doy-Math.floor((153*mp+2)/5)+1;
  const m=mp<10?mp+3:mp-9;
  return[m<=2?y+1:y,m,d];
}

function normalizeFraction(f:string):string{
  if(!/^\d*$/.test(f))throw new Error('invalid fraction');
  return f.replace(/0+$/,'');
}

function toInstant(y:number,mo:number,d:number,h:number,mi:number,s:number,fraction:string):UtcInstant{
  if(mo<1||mo>12)throw new Error('month out of range');
  if(d<1||d>daysInMonth(y,mo))throw new Error('day out of range');
  if(h>23)throw new Error('hour out of range');
  if(mi>59)throw new Error('minute out of range');
  if(s>59)throw new Error('second out of range');
  const epochSeconds=BigInt(daysFromCivil(y,mo,d))*SECONDS_PER_DAY+BigInt(h*3600+mi*60+s);
  return{epochSeconds,fraction:normalizeFraction(fraction)};
}

function splitInstant(t:UtcInstant):{y:number;mo:number;d:number;h:number;mi:number;s:number}{
  let days=t.epochSeconds/SECONDS_PER_DAY;
  let rem=t.epochSeconds%SECONDS_PER_DAY;
  if(rem<0n){rem+=SECONDS_PER_DAY;days-=1n}
  const[y,mo,d]=civilFromDays(Number(days));
  const r=Number(rem);
  return{y,mo,d,h:Math.floor(r/3600),mi:Math.floor((r%3600)/60),s:r%60};
}

const pad=(n:number,w:number)=>String(n).padStart(w,'0');

// DER: Z only, seconds mandatory, fraction (if any) on the seconds only.
const UTC_TIME_RE=/^(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})Z$/;
const GENERALIZED_TIME_RE=/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(?:[.,](\d+))?Z$/;

export function parseUtcTime(text:string):UtcInstant{
  const m=UTC_TIME_RE.exec(text);
  if(!m)throw new Error('invalid DER UTCTime');
  const yy=Number(m[1]);
  return toInstant(yy<50?2000+yy:1900+yy,Number(m[2]),Number(m[3]),Number(m[4]),Number(m[5]),Number(m[6]),'');
}

export function parseGeneralizedTime(text:string):UtcInstant{
  const m=GENERALIZED_TIME_RE.exec(text);
  if(!m)throw new Error('invalid DER GeneralizedTime');
  return toInstant(Number(m[1]),Number(m[2]),Number(m[3]),Number(m[4]),Number(m[5]),Number(m[6]),m[7]??'');
}

export function formatUtcTime(t:UtcInstant):string{
  if(normalizeFraction(t.fraction)!=='')throw new Error('UTCTime cannot carry fractional seconds');
  const{y,mo,d,h,mi,s}=splitInstant(t);
  if(y<1950||y>2049)throw new Error('year outside UTCTime window');
  return`${pad(y%100,2)}${pad(mo,2)}${pad(d,2)}${pad(h,2)}${pad(mi,2)}${pad(s,2)}Z`;
}

export function formatGeneralizedTime(t:UtcInstant):string{
  const fraction=normalizeFraction(t.fraction);
  const{y,mo,d,h,mi,s}=splitInstant(t);
  if(y<0||y>9999)throw new Error('year outside GeneralizedTime range');
  return`${pad(y,4)}${pad(mo,2)}${pad(d,2)}${pad(h,2)}${pad(mi,2)}${pad(s,2)}${fraction?'.'+fraction:''}Z`;
}

export function instantNanos(t:UtcInstant):number{
  return t.fraction===''?0:Number((t.fraction+'000000000').slice(0,9));
}

function ascii(bytes:Uint8Array):string{let s='';for(const b of bytes)s+=String.fromCharCode(b);return s}
function asciiBytes(text:string):Uint8Array{const out=new Uint8Array(text.length);for(let i=0;i<text.length;i++)out[i]=text.charCodeAt(i);return out}

export function decodeUtcTime(value:Uint8Array):UtcInstant{return parseUtcTime(ascii(value))}
export function decodeGeneralizedTime(value:Uint8Array):UtcInstant{return parseGeneralizedTime(ascii(value))}
export function encodeUtcTime(t:UtcInstant):Uint8Array{return asciiBytes(formatUtcTime(t))}
export function encodeGeneralizedTime(t:UtcInstant):Uint8Array{return asciiBytes(formatGeneralizedTime(t))}
