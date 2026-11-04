# The Love Channels

Live website: https://lovechannels-rebuilt.vercel.app

Member dashboard: https://lovechannels-rebuilt.vercel.app/#/member

Administrator dashboard: https://lovechannels-rebuilt.vercel.app/#/admin

Hosting: Vercel + Neon Postgres. Source: this private GitHub repository.

See [README-HOSTING.md](README-HOSTING.md) for deployment, environment configuration, tests, local preview instructions and services awaiting configuration.

For a local preview, open START-WEBSITE.cmd or run `node server/index.mjs --demo` with Node 24. The local edition uses a separate SQLite database; it does not change hosted church records.
