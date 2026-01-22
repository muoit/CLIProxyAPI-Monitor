export function formatCurrency(value: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 2
  }).format(value);
}

export function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(value);
}

// 带千位分隔的数字格式
export function formatNumberWithCommas(value: number) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
}

// 简化大数：1000 -> 1k, 1000000 -> 1M
export function formatCompactNumber(value: number) {
  if (value >= 1_000_000) {
    const scaledTimesTen = Math.floor((value * 10) / 1_000_000);
    const scaled = scaledTimesTen / 10;
    const formatted = Number.isInteger(scaled) ? scaled.toFixed(0) : scaled.toFixed(1);
    return formatted + 'M';
  }
  if (value >= 1_000) {
    const scaledTimesTen = Math.floor((value * 10) / 1_000);
    const scaled = scaledTimesTen / 10;
    const formatted = Number.isInteger(scaled) ? scaled.toFixed(0) : scaled.toFixed(1);
    return formatted + 'k';
  }
  return value.toString();
}

// Format hour label: "MM-DD HH" -> "HH:00" (hourOnly) or "MM/DD HH:00" (full)
export function formatHourLabel(label: string, hourOnly = false) {
  const parts = label.split(' ');
  if (parts.length === 2) {
    const [monthDay, hour] = parts;
    return hourOnly ? `${hour}:00` : `${monthDay.replace('-', '/')} ${hour}:00`;
  }
  return `${label}:00`;
}
