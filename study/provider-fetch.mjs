// Authentication and RPC keep their short timeout. A reserved raw recording
// may be up to 8 MiB; uploading it over a slow connection needs a separate budget.
export function providerRequestTimeout(url, options = {}) {
  const path = new URL(String(url)).pathname;
  return options.method?.toUpperCase() === "POST" &&
    /^\/storage\/v1\/object\/speaking-private\/[0-9a-f-]{36}\/raw$/.test(path)
    ? 120000
    : 8000;
}
export function providerFetch(url, options = {}) {
  const timeout = AbortSignal.timeout(providerRequestTimeout(url, options));
  return fetch(url, {
    ...options,
    signal: options.signal
      ? AbortSignal.any([options.signal, timeout])
      : timeout,
  });
}
