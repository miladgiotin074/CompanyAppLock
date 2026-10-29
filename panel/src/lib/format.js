const FA = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];

export function faDigits(input) {
  return String(input).replace(/\d/g, (d) => FA[+d]);
}

/** Relative time in Persian, e.g. «۳ دقیقه پیش». */
export function timeAgo(date) {
  if (!date) return 'هرگز';
  const diff = Date.now() - new Date(date).getTime();
  const sec = Math.round(diff / 1000);
  if (sec < 10) return 'همین حالا';
  if (sec < 60) return `${faDigits(sec)} ثانیه پیش`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${faDigits(min)} دقیقه پیش`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${faDigits(hr)} ساعت پیش`;
  const day = Math.round(hr / 24);
  return `${faDigits(day)} روز پیش`;
}

export function shortId(id) {
  if (!id) return '';
  return id.length > 12 ? `${id.slice(0, 8)}…${id.slice(-4)}` : id;
}
