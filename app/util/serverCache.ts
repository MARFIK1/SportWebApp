import * as React from "react";

// Safe wrapper around React's `cache` (server-component only API).
// In non-server environments (jest/jsdom) React.cache is undefined, so fall
// back to a passthrough - per-request memoization is a server-side concern
// and tests don't need it.
type CacheFn = <Args extends unknown[], Return>(
    fn: (...args: Args) => Return
) => (...args: Args) => Return;

const reactCache = (React as unknown as { cache?: CacheFn }).cache;

export const cache: CacheFn = typeof reactCache === "function" ? reactCache : ((fn) => fn);
