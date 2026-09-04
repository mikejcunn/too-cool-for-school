export function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'item'
  );
}

/** Short SKU stem from a product name, e.g. "Winthrop Spirit Tee" -> "WST". */
export function skuStem(name: string): string {
  const words = name
    .replace(/[^a-zA-Z0-9 ]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const stem = words.length >= 2 ? words.map((w) => w[0]).join('') : (words[0] ?? 'SKU').slice(0, 4);
  return stem.toUpperCase().slice(0, 6);
}
