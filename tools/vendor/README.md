Local stand-ins for the page's outside files, used only by automated browsers
(`tools/playtest-browser.mjs`, the e2e suite) when the real ones can't be fetched, as in a cloud
Claude session. The live page always loads the real ones.

- `cohesion.js`, `cohesion.css`: copies of `shared/` in the quasarbright/sketches repo, taken at
  commit ca43805 (2026-11-19). If the shared files change in a way the tests depend on, copy them
  again.
