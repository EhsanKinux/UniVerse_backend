/**
 * Bytes → a Persian-digit size label, e.g. «۸۱۲ کیلوبایت» or «۴٫۲ مگابایت».
 * Shared so the documents and news features format file sizes identically.
 */
export function formatFileSize(bytes: number): string {
  const kb = bytes / 1024;
  if (kb < 1024) {
    return `${toPersianNumber(Math.max(1, Math.round(kb)))} کیلوبایت`;
  }
  const mb = kb / 1024;
  return `${toPersianNumber(Number(mb.toFixed(1)))} مگابایت`;
}

function toPersianNumber(value: number): string {
  return new Intl.NumberFormat('fa-IR', { useGrouping: false }).format(value);
}
