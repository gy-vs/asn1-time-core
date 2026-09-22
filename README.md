# ASN.1 DER core

TypeScript library for DER encoding and decoding.

Run `npm install`, then `npm test` and `npm run build`.

## Times

`parseUtcTime` / `parseGeneralizedTime` decode DER `UTCTime` / `GeneralizedTime`
strings to a `UtcInstant` (`{epochSeconds: bigint, fraction: string}` — whole
seconds since the Unix epoch plus normalized fractional-second digits, so
precision beyond nanoseconds survives a round trip; `instantNanos` reads the
sub-second part as nanoseconds). `formatUtcTime` / `formatGeneralizedTime`
encode back to canonical DER, and `decode*` / `encode*` work on TLV value
octets.

DER rules are enforced: `Z` only (no offsets), seconds mandatory, fractions
only on the seconds of a `GeneralizedTime`, trailing fraction zeros
normalized, comma decimal mark accepted and re-encoded as `.`, and UTCTime
`YY` resolved as 1950–2049. Conversion uses civil-calendar arithmetic, never
the host `Date`, so years 0000–9999 are exact.
