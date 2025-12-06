const WEEKDAY_SESSIONS = [
  { id: "1", name: "Sesi 1", startTime: "10:00", endTime: "11:00" },
  { id: "2", name: "Sesi 2", startTime: "13:00", endTime: "14:30" },
  { id: "3", name: "Sesi 3", startTime: "14:45", endTime: "16:15" },
  { id: "4", name: "Sesi 4", startTime: "16:30", endTime: "18:00" },
  { id: "5", name: "Sesi 5", startTime: "18:30", endTime: "20:00" },
];

const SATURDAY_SESSIONS = [
  { id: "6", name: "Sesi 1", startTime: "09:00", endTime: "10:30" },
  { id: "7", name: "Sesi 2", startTime: "10:30", endTime: "12:00" },
];

function parseDateToUTCStart(dateStr: string): Date {
  // dateStr expected "YYYY-MM-DD"
  const [y, m, d] = dateStr.split("-").map(Number);

  return new Date(Date.UTC(y!, m! - 1, d)); // UTC 00:00
}

export { WEEKDAY_SESSIONS, SATURDAY_SESSIONS, parseDateToUTCStart };
