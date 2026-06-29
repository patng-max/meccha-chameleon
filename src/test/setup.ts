/// <reference types="vitest" />

// Minimal test setup — extend as needed
// Keep this file lightweight. Individual test files import what they need.

// Silence noisy console errors during tests
const originalError = console.error;
beforeAll(() => {
  console.error = (...args: unknown[]) => {
    // Suppress known harmless warnings
    const msg = String(args[0] ?? "");
    if (
      msg.includes("ReactDOM.render") ||
      msg.includes("useLayoutEffect") ||
      msg.includes("Hydration")
    ) {
      return;
    }
    originalError.call(console, ...args);
  };
});

afterAll(() => {
  console.error = originalError;
});
