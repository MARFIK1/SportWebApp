import * as React from "react";

// Safe wrapper around React's `cache` (server-component only API).
// In non-server environments (jest/jsdom) React.cache is undefined, so fall
// back to a passthrough - per-request memoization is a server-side concern
// and tests don't need it.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CacheFn = <T extends (...args: any[]) => any>(fn: T) => T;

const reactCache = (React as unknown as { cache?: CacheFn }).cache;

export const cache: CacheFn = typeof reactCache === "function" ? reactCache : ((fn) => fn);
