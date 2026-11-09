# Contributing to note-scion

Thanks for taking the time to help. Bug reports, fixes and small improvements are all
welcome.

## Before you start

- **Bugs**: open an [issue](https://github.com/pradprat/note-scion/issues/new/choose) with
  steps to reproduce it.
- **Features**: open an issue first to talk it through. note-scion aims to stay small and
  focused on one person's notes, so not every good idea fits. A quick conversation saves you
  building something that can't be merged.
- **Security problems**: please don't open a public issue. See [SECURITY.md](SECURITY.md).

## Setting up

You need [Bun](https://bun.sh) and a [Neon](https://neon.tech) database. A free Neon
branch makes a good throwaway development database.

```sh
bun install
cp .env.example .env.local   # fill in the values
bun run db:migrate
bun dev
```

## Making a change

1. Fork the repo and create a branch from `main`.
2. Keep the change focused. One fix or feature per pull request is easiest to review.
3. Match the style around you. The code favours small components, plain names, and
   comments that say *why*, not *what*.
4. Check it before you push:

   ```sh
   bun run typecheck
   bun run lint
   bun run test
   bun run build
   ```

   `bun run test` needs no database: the MCP endpoint and the save logic run against an
   in-memory fake (`tests/support/fake-db.mts`). If you change a query in `src/lib/db.ts`
   or `src/lib/oauth.ts`, update the fake to match, or the tests will say they don't know it.

5. Open a pull request that says what changed and how you tested it. Screenshots help for
   anything visible.

CI runs the same four checks on every pull request.

## Things to keep in mind

- **Data safety comes first.** Saving uses optimistic versioning so that edits from the app
  and from MCP never silently overwrite each other. Changes near saving, the cache in
  `src/lib/db.ts`, or the MCP tools need extra care.
- **Schema changes** go in `scripts/schema.sql` and must be safe to run again
  (`create ... if not exists`, `add column if not exists`). The build runs this file
  against every deployment's database.
- **MCP tool descriptions** are read by Claude, so write them as plain, precise
  instructions.

By contributing, you agree that your contributions are licensed under the
[MIT License](LICENSE), and to follow the [Code of Conduct](CODE_OF_CONDUCT.md).
