/** Normalize typed destinations without permitting executable URLs in Markdown. */
export function normalizeLink(value: string): string {
  const input = value.trim();
  if (!input) throw new Error('Enter a link address.');
  if (/[\u0000-\u0020\u007f]/.test(input)) throw new Error('Remove spaces from the address, or use %20.');
  if (/^(?:#|\.\.?\/|\/)/.test(input) || /^[^:?#]+\.(?:md|markdown)(?:[#?].*)?$/i.test(input)) return input;
  const href = /^[a-z][a-z\d+.-]*:/i.test(input) ? input : `https://${input}`;
  let url: URL;
  try { url = new URL(href); } catch { throw new Error('Enter a valid web address or a relative Markdown link.'); }
  if (!['https:', 'http:', 'mailto:', 'tel:'].includes(url.protocol)) throw new Error('Use a web, email, phone, or relative Markdown link.');
  return href;
}
