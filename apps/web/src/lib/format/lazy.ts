/**
 * Creates a value on first use. For Intl formatters: building one loads locale data (tens of
 * ms on a slow phone), which must not happen while a page loads modules it may never use.
 */
export function lazy<T>(make: () => T): () => T {
  let value: T | undefined;
  return () => (value ??= make());
}
