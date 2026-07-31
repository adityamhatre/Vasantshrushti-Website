import { type BookingDetails, Accommodation, ACCOMMODATION_NAMES } from "../types";
import { authService } from "./authService";

const RENDER_BASE_URL = typeof window !== "undefined"
  ? (window.location.hostname === "localhost" || window.location.hostname.endsWith(".lhr.life") || window.location.hostname.endsWith(".ngrok-free.app") || window.location.hostname.endsWith(".localtunnel.me"))
    ? "/api"
    : "https://vs-booking-scheduler-push-notify-server.onrender.com"
  : "/api";

export interface BookingSummary {
  [key: string]: number; // format "MMYYYY": count
}

// Convert Accommodation enum list to comma separated readable names
export function getAccommodationsReadableString(accommodations: string[] | Accommodation[]): string {
  let list = [...accommodations] as Accommodation[];
  
  const hasBungalow31 = list.includes(Accommodation.BUNGALOW_3_1);
  const hasSpecialRoom1 = list.includes(Accommodation.SPECIAL_ROOM_1);
  const hasSpecialRoom2 = list.includes(Accommodation.SPECIAL_ROOM_2);

  if (hasBungalow31 && hasSpecialRoom1 && hasSpecialRoom2) {
    list = list.filter(item => 
      item !== Accommodation.BUNGALOW_3_1 && 
      item !== Accommodation.SPECIAL_ROOM_1 && 
      item !== Accommodation.SPECIAL_ROOM_2
    );
    list.push(Accommodation.BUNGALOW_5_1);
  }

  return list.map(item => ACCOMMODATION_NAMES[item] || item).join(", ");
}

function toTitleCase(str: string): string {
  if (!str) return "";
  const converted = str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
  return converted.split("_")
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

export function toNotificationPayload(booking: BookingDetails) {
  return {
    bookingIdOnGoogle: booking.bookingIdOnGoogle,
    accommodations: getAccommodationsReadableString(booking.accommodations),
    checkIn: booking.checkIn,
    checkOut: booking.checkOut,
    bookingMainPerson: booking.bookingMainPerson,
    totalNumberOfPeople: booking.totalNumberOfPeople.toString(),
    bookedBy: booking.bookedBy,
    advancedPaymentReceived: booking.advancePaymentInfo.advanceReceived.toString(),
    advancedPaymentType: toTitleCase(booking.advancePaymentInfo.paymentType),
    advancedPaymentAmount: booking.advancePaymentInfo.amount.toString(),
    phoneNumber: booking.phoneNumber,
    notes: booking.notes
  };
}

export const renderService = {
  async getBookingSummary(): Promise<BookingSummary> {
    const response = await fetch(`${RENDER_BASE_URL}/bookingsSummary`);
    if (!response.ok) {
      throw new Error("Failed to fetch booking summary");
    }
    return response.json();
  },

  async triggerNewBookingNotification(booking: BookingDetails): Promise<void> {
    const payload = toNotificationPayload(booking);
    const accessToken = authService.getAccessToken() || "";
    const response = await fetch(`${RENDER_BASE_URL}/notifications/newBookingCreated`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${accessToken}`
      },
      body: JSON.stringify(payload)
    });
    if (!response.ok) {
      throw new Error("Failed to send new booking notification");
    }
  },

  async triggerUpdatedBookingNotification(booking: BookingDetails): Promise<void> {
    const payload = toNotificationPayload(booking);
    const accessToken = authService.getAccessToken() || "";
    const response = await fetch(`${RENDER_BASE_URL}/notifications/updatedBooking`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${accessToken}`
      },
      body: JSON.stringify(payload)
    });
    if (!response.ok) {
      throw new Error("Failed to send updated booking notification");
    }
  },

  async triggerDeletedBookingNotification(booking: BookingDetails): Promise<void> {
    const payload = toNotificationPayload(booking);
    const accessToken = authService.getAccessToken() || "";
    const response = await fetch(`${RENDER_BASE_URL}/deleteBooking`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${accessToken}`
      },
      body: JSON.stringify(payload)
    });
    if (!response.ok) {
      throw new Error("Failed to send deleted booking notification");
    }
  }
};
