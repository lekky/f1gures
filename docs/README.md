# f1gures docs

Reference docs for the project. Code-level conventions live in [CLAUDE.md](../CLAUDE.md); this folder is for higher-level "what does the app do and how does data flow through it" notes.

- [features.md](features.md) — what each page renders and how the user moves between them
- [data-flow.md](data-flow.md) — boot sequence, the API/cache/static decision tree, retry behaviour, and the live driver-career fetch path

If something here goes stale, update it as part of the same PR that changes the behaviour. These docs are short on purpose so that's cheap.
