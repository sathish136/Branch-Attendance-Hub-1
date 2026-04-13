import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatTime(timeStr?: string | null) {
  if (!timeStr) return "-";
  try {
    if (timeStr.includes("T") || timeStr.length > 8) {
      const d = new Date(timeStr);
      if (!isNaN(d.getTime())) {
        const h = d.getHours();
        const m = d.getMinutes().toString().padStart(2, "0");
        const ampm = h >= 12 ? "PM" : "AM";
        const formattedH = h % 12 || 12;
        return `${formattedH}:${m} ${ampm}`;
      }
    }
    const [hours, minutes] = timeStr.split(":");
    const h = parseInt(hours, 10);
    const ampm = h >= 12 ? "PM" : "AM";
    const formattedH = h % 12 || 12;
    return `${formattedH}:${minutes} ${ampm}`;
  } catch {
    return timeStr;
  }
}
