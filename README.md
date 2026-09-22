# ASN.1 DER core

TypeScript library for DER encoding and decoding.

Run `npm install`, then `npm test` and `npm run build`.

## Time types

`decodeUtcTime` (tag 0x17) and `decodeGeneralizedTime` (tag 0x18) parse DER
time values into a precision-preserving `UtcInstant` (`year`, `month`, `day`,
`hour`, `minute`, `second`, `nanosecond`). Rules enforced:

- Zulu (`Z`) only; offset timezones are rejected.
- Seconds are mandatory; UTCTime is fixed `YYMMDDHHMMSSZ`.
- UTCTime two-digit years map to `1950..2049` (`00..49` → 2000s, `50..99` → 1900s).
- GeneralizedTime fractions apply only to seconds, retain nanosecond precision,
  accept comma or period on input, and have trailing zeros stripped on encode.
- Fields are calendar-checked directly (including leap years) — the host `Date`
  is never used, so out-of-range values raise instead of rolling over.

Use `encodeUtcTime` / `encodeGeneralizedTime` for explicit tags, or
`encodeTime` / `decodeTime` for canonical tag selection (UTCTime for
whole-second instants in 1950..2049, GeneralizedTime otherwise).
