# Create link

Source PRD: Tasks/<KEY>/PRD.md
Domain: docs/domains/<domain>.md

## Ubiquitous

The system SHALL reject a target that is not http or https. The request type is CreateLinkDto.

## Event

WHEN the client creates a link with CreateLinkDto, the system SHALL store the target and return LinkResponseDto. The idempotency key is the Idempotency-Key header.

## State

WHILE the daily create quota for the account is exhausted, the system SHALL refuse CreateLinkDto with status 429.

## Unwanted

IF the target URL uses the file scheme, the system SHALL reject CreateLinkDto and store nothing.

## Optional

WHERE none, the system SHALL skip this pattern.

## Contracts

- CreateLinkDto.targetUrl: string, required, http or https.
- LinkResponseDto.code: string, required.
- LinkResponseDto.url: string, required.
- An amount field, when this product has one, uses integer minor units or a decimal string.

## Tests

- WHEN create returns LinkResponseDto and sends the idempotency key.
- IF a file URL is rejected.
- WHILE the quota is exhausted the status is 429.

## Traceability

| EARS (section / statement) | FR | UC |
|---|---|---|
| Ubiquitous / The system SHALL reject a target that is not http or https | FR-01 | UC-01 |
| Event / WHEN the client creates a link … | FR-02 | UC-01 |
| State / WHILE the daily create quota … | FR-03 | UC-01 |
| Unwanted / IF the target URL uses the file scheme … | FR-01 | UC-01 |
