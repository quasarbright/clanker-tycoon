// The game's modules are written for the browser. This gives Node the few globals they touch at
// import time (location, navigator, addEventListener, fetch), so unit tests can import them.
// Import it first: `import "./setup.mjs";`
globalThis.location ??= new URL("http://localhost:8473/");
if (!globalThis.navigator?.webdriver) Object.defineProperty(globalThis, "navigator", { value: { webdriver: true }, configurable: true });
globalThis.addEventListener ??= () => {};
globalThis.realFetch ??= globalThis.fetch; // tools that do need the network use this
globalThis.fetch = async () => ({ ok: true, json: async () => ({}) });
