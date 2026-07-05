/**
 * Build a Content-Disposition header that survives non-ASCII (Persian) filenames:
 * a plain `filename=` ASCII fallback for old clients, plus an RFC 5987
 * `filename*=UTF-8''…` with the real, percent-encoded name for modern browsers.
 * Shared by the documents and news file-streaming endpoints.
 */
export function contentDisposition(
  type: 'inline' | 'attachment',
  filename: string,
): string {
  const asciiFallback = filename
    .replace(/[^\x20-\x7e]/g, '_')
    .replace(/["\\]/g, '_');
  const encoded = encodeURIComponent(filename);
  return `${type}; filename="${asciiFallback}"; filename*=UTF-8''${encoded}`;
}
