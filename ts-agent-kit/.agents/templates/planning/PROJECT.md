# Project

## Goal

Allow a signed-in user to create one short link from an http or https URL.

## Out of scope

Editing an existing link, billing, and the public redirect page.

## Invariants

Controllers do not call Prisma. Services do not throw HttpException. New response fields stay optional. An applied Prisma migration.sql is not edited.
