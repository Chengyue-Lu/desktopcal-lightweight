export function getTodayIsoDate() {
  return toIsoDate(new Date());
}

export function toIsoDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function shiftDayIsoDate(isoDate: string, offset: number) {
  const [yearText, monthText, dayText] = isoDate.split("-");
  const target = new Date(Number(yearText), Number(monthText) - 1, Number(dayText));
  target.setDate(target.getDate() + offset);
  return toIsoDate(target);
}

export function toReadableWindow(weeks: { days: { isoDate: string }[] }[]) {
  const startIsoDate = weeks[0]?.days[0]?.isoDate;
  const lastWeek = weeks[weeks.length - 1];
  const endIsoDate = lastWeek?.days[lastWeek.days.length - 1]?.isoDate;

  if (!startIsoDate || !endIsoDate) {
    return "";
  }

  const [startYear, startMonth, startDay] = startIsoDate.split("-").map(Number);
  const [endYear, endMonth, endDay] = endIsoDate.split("-").map(Number);

  if (startYear === endYear) {
    if (startMonth === endMonth) {
      return `${startYear}年${startMonth}月${startDay}日 - ${endDay}日`;
    }

    return `${startYear}年${startMonth}月${startDay}日 - ${endMonth}月${endDay}日`;
  }

  return `${startYear}年${startMonth}月${startDay}日 - ${endYear}年${endMonth}月${endDay}日`;
}
