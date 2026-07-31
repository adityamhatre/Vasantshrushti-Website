import { type BookingDetails, Accommodation, ACCOMMODATION_CALENDARS, getApprovedPersonName, ApprovedPerson } from "../types";
import { authService } from "./authService";
import { renderService } from "./renderService";

function getAccessToken(): string {
  const token = authService.getAccessToken();
  if (!token) throw new Error("No Google Calendar access token found. Please sign in.");
  return token;
}

// Convert "DD Month YYYY, HH:MM AM/PM" or epoch milliseconds to ISO string in Asia/Kolkata timezone (+05:30)
export function parseHumanDateToISO(humanStr: string | number): string {
  if (!humanStr) return "";
  
  // Handle epoch number directly
  if (typeof humanStr === "number") {
    return new Date(humanStr).toISOString();
  }
  
  // Handle epoch string directly
  if (typeof humanStr === "string" && /^\d+$/.test(humanStr)) {
    return new Date(parseInt(humanStr, 10)).toISOString();
  }
  
  // Handle ISO string directly
  if (typeof humanStr === "string" && humanStr.includes("T")) {
    return humanStr;
  }
  
  // Example: "09 January 2021, 09:30 AM"
  const parts = humanStr.split(",");
  if (parts.length < 2) return new Date(humanStr).toISOString();
  
  const dateParts = parts[0].trim().split(" ");
  const timeParts = parts[1].trim().split(" ");
  
  if (dateParts.length < 3 || timeParts.length < 2) return new Date(humanStr).toISOString();
  
  const dateStr = dateParts[0]; // "09"
  const monthName = dateParts[1]; // "January"
  const yearStr = dateParts[2]; // "2021"
  
  const timeStr = timeParts[0]; // "09:30"
  const ampm = timeParts[1]; // "AM"
  
  const months: Record<string, string> = {
    January: "01", February: "02", March: "03", April: "04", May: "05", June: "06",
    July: "07", August: "08", September: "09", October: "10", November: "11", December: "12"
  };
  
  const monthStr = months[monthName] || "01";
  const [hourStr, minuteStr] = timeStr.split(":");
  let hour = parseInt(hourStr, 10);
  const minute = parseInt(minuteStr, 10);
  
  if (ampm === "PM" && hour < 12) hour += 12;
  if (ampm === "AM" && hour === 12) hour = 0;
  
  const paddedDay = dateStr.padStart(2, "0");
  const paddedHour = hour.toString().padStart(2, "0");
  const paddedMinute = minute.toString().padStart(2, "0");
  
  // Format: YYYY-MM-DDTHH:mm:ss+05:30
  return `${yearStr}-${monthStr}-${paddedDay}T${paddedHour}:${paddedMinute}:00+05:30`;
}

// Convert ISO Date string or Date object to human readable string "DD Month YYYY, HH:MM AM/PM"
export function toHumanDate(dateInput: Date | string): string {
  const date = typeof dateInput === "string" ? new Date(dateInput) : dateInput;
  
  // Format in Asia/Kolkata timezone
  const formatter = new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true
  });
  
  const formattedParts = formatter.formatToParts(date);
  let day = "";
  let month = "";
  let year = "";
  let hour = "";
  let minute = "";
  let dayPeriod = "";
  
  for (const part of formattedParts) {
    if (part.type === "day") day = part.value;
    else if (part.type === "month") month = part.value;
    else if (part.type === "year") year = part.value;
    else if (part.type === "hour") hour = part.value;
    else if (part.type === "minute") minute = part.value;
    else if (part.type === "dayPeriod") dayPeriod = part.value.toUpperCase();
  }
  
  // Format should match "09 January 2021, 09:30 AM"
  return `${day} ${month} ${year}, ${hour}:${minute} ${dayPeriod}`;
}

const bookingsCache = new Map<string, { data: BookingDetails[]; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes TTL

export const calendarService = {
  async checkAvailability(checkIn: string, checkOut: string): Promise<Accommodation[]> {
    const accessToken = getAccessToken();
    
    const timeMin = parseHumanDateToISO(checkIn);
    const timeMax = parseHumanDateToISO(checkOut);
    
    // Get all calendar IDs (except BUNGALOW_5_1 which is compound, and ONE_DAY which is handled separately or included)
    const calendarEntries = Object.entries(ACCOMMODATION_CALENDARS)
      .filter(([key]) => key !== Accommodation.BUNGALOW_5_1 && key !== Accommodation.ONE_DAY);
      
    const items = calendarEntries.map(([_, id]) => ({ id }));
    
    const response = await fetch("https://www.googleapis.com/calendar/v3/freeBusy", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        timeMin,
        timeMax,
        timeZone: "Asia/Kolkata",
        items
      })
    });
    
    if (!response.ok) {
      throw new Error("Failed to check availability with Google Calendar");
    }
    
    const data = await response.json();
    const availableCalendars: string[] = [];
    
    for (const [calId, val] of Object.entries(data.calendars) as [string, any][]) {
      if (val.busy && val.busy.length === 0) {
        availableCalendars.push(calId);
      }
    }
    
    // Map back calendar IDs to Accommodations
    const availableAccommodations: Accommodation[] = [];
    for (const [accommodation, id] of calendarEntries) {
      if (availableCalendars.includes(id)) {
        availableAccommodations.push(accommodation as Accommodation);
      }
    }
    
    return availableAccommodations;
  },

  async getBookingsForMonth(month: number, year: number, forceRefresh = false): Promise<BookingDetails[]> {
    const cacheKey = `${year}-${month}`;
    if (!forceRefresh) {
      const cached = bookingsCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        console.log(`[calendarService] Returning cached bookings for ${month}/${year}`);
        return cached.data;
      }
    }
    
    const accessToken = getAccessToken();
    
    // Query start: 1st of month at 00:00:00+05:30
    const monthStr = month.toString().padStart(2, "0");
    const timeMin = `${year}-${monthStr}-01T00:00:00+05:30`;
    
    // Query end: end of month at 23:59:59+05:30
    const maxDays = new Date(year, month, 0).getDate();
    const timeMax = `${year}-${monthStr}-${maxDays.toString().padStart(2, "0")}T23:59:59+05:30`;

    console.log(`[calendarService] Query range for ${month}/${year}: timeMin=${timeMin}, timeMax=${timeMax}`);
    
    // Fetch from all calendars in parallel
    const calendarEntries = Object.entries(ACCOMMODATION_CALENDARS)
      .filter(([key]) => key !== Accommodation.BUNGALOW_5_1); // exclude group enum
      
    const allBookingsMap = new Map<string, BookingDetails>();
    const bookingEventIdsMap = new Map<string, Array<[string, string]>>();
    
    const fetchPromises = calendarEntries.map(async ([accommodation, calendarId]) => {
      let pageToken: string | undefined = undefined;
      const events: any[] = [];
      
      do {
        let url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}&singleEvents=true&timeZone=Asia/Kolkata`;
        if (pageToken) {
          url += `&pageToken=${encodeURIComponent(pageToken)}`;
        }
        
        const response = await fetch(url, {
          headers: {
            Authorization: `Bearer ${accessToken}`
          }
        });
        
        if (!response.ok) {
          const errText = await response.text();
          console.error(`[calendarService] Failed to fetch events for calendar ${accommodation} (${calendarId}). Status: ${response.status}, Error: ${errText}`);
          break;
        }
        
        const data = await response.json();
        if (data.items) {
          events.push(...data.items);
        }
        pageToken = data.nextPageToken;
      } while (pageToken);

      if (events.length > 0) {
        console.log(`[calendarService] Calendar ${accommodation} returned ${events.length} events:`, events.map(ev => ev.summary));
      }
      
      // Parse events and collect details
      for (const event of events) {
        const bookingId = event.extendedProperties?.private?.id;
        if (!bookingId) continue;
        
        // Track the calendarId + eventId link
        if (!bookingEventIdsMap.has(bookingId)) {
          bookingEventIdsMap.set(bookingId, []);
        }
        bookingEventIdsMap.get(bookingId)!.push([calendarId, event.id]);
        
        // Parse booking JSON from description
        if (event.description && !allBookingsMap.has(bookingId)) {
          try {
            const parsed = JSON.parse(event.description);
            // Re-map format if older json structure
            const bookingDetails: BookingDetails = {
              bookingIdOnGoogle: bookingId,
              accommodations: Array.isArray(parsed.accommodations)
                ? parsed.accommodations
                : parsed.accommodations
                  ? parsed.accommodations.split(",").map((s: string) => s.trim())
                  : [],
              checkIn: typeof parsed.checkIn === "number" 
                ? toHumanDate(new Date(parsed.checkIn))
                : typeof parsed.checkIn === "string" && /^\d+$/.test(parsed.checkIn)
                  ? toHumanDate(new Date(parseInt(parsed.checkIn, 10)))
                  : parsed.checkIn || toHumanDate(event.start.dateTime || event.start.date),
              checkOut: typeof parsed.checkOut === "number" 
                ? toHumanDate(new Date(parsed.checkOut))
                : typeof parsed.checkOut === "string" && /^\d+$/.test(parsed.checkOut)
                  ? toHumanDate(new Date(parseInt(parsed.checkOut, 10)))
                  : parsed.checkOut || toHumanDate(event.end.dateTime || event.end.date),
              bookingMainPerson: parsed.bookingMainPerson || event.summary || "Guest",
              totalNumberOfPeople: parseInt(parsed.totalNumberOfPeople, 10) || 1,
              bookedBy: (getApprovedPersonName(parsed.bookedBy) as ApprovedPerson) || ApprovedPerson.ADITYA_MHATRE,
              advancePaymentInfo: {
                advanceReceived: parsed.advancedPaymentReceived === "true" || parsed.advancePaymentInfo?.advanceReceived === true,
                amount: parseInt(parsed.advancedPaymentAmount || parsed.advancePaymentInfo?.amount, 10) || 0,
                paymentType: parsed.advancedPaymentType || parsed.advancePaymentInfo?.paymentType || "NONE"
              },
              phoneNumber: parsed.phoneNumber || "",
              notes: parsed.notes || "",
              eventIds: []
            };
            allBookingsMap.set(bookingId, bookingDetails);
          } catch (e) {
            console.warn(`Failed to parse description JSON for event ${event.id}`, e);
          }
        }
      }
    });
    
    await Promise.all(fetchPromises);
    
    // Attach collected eventIds to each booking details
    const result: BookingDetails[] = [];
    for (const [bookingId, booking] of allBookingsMap.entries()) {
      booking.eventIds = bookingEventIdsMap.get(bookingId) || [];
      result.push(booking);
    }
    
    // Sort bookings by check-in date
    const sortedResult = result.sort((a, b) => {
      const aTime = new Date(parseHumanDateToISO(a.checkIn)).getTime();
      const bTime = new Date(parseHumanDateToISO(b.checkIn)).getTime();
      return aTime - bTime;
    });

    bookingsCache.set(cacheKey, { data: sortedResult, timestamp: Date.now() });
    return sortedResult;
  },

  async createBooking(booking: BookingDetails): Promise<Array<[string, string]>> {
    const accessToken = getAccessToken();
    const eventIds: Array<[string, string]> = [];
    
    // Filter actual calendars to insert into. If BUNGALOW_5_1 is selected, insert into BUNGALOW_3_1, SPECIAL_ROOM_1, SPECIAL_ROOM_2
    let targetAccommodations = [...booking.accommodations];
    if (targetAccommodations.includes(Accommodation.BUNGALOW_5_1)) {
      targetAccommodations = targetAccommodations.filter(item => item !== Accommodation.BUNGALOW_5_1);
      if (!targetAccommodations.includes(Accommodation.BUNGALOW_3_1)) targetAccommodations.push(Accommodation.BUNGALOW_3_1);
      if (!targetAccommodations.includes(Accommodation.SPECIAL_ROOM_1)) targetAccommodations.push(Accommodation.SPECIAL_ROOM_1);
      if (!targetAccommodations.includes(Accommodation.SPECIAL_ROOM_2)) targetAccommodations.push(Accommodation.SPECIAL_ROOM_2);
    }
    
    const startIso = parseHumanDateToISO(booking.checkIn);
    const endIso = parseHumanDateToISO(booking.checkOut);
    
    // Send event creation requests in parallel
    const insertPromises = targetAccommodations.map(async (accommodation) => {
      const calendarId = ACCOMMODATION_CALENDARS[accommodation];
      if (!calendarId) return;
      
      const eventPayload = {
        summary: booking.bookingMainPerson,
        description: JSON.stringify({
          ...booking,
          eventIds: [] // don't save cyclic eventIds in description
        }),
        start: {
          dateTime: startIso,
          timeZone: "Asia/Kolkata"
        },
        end: {
          dateTime: endIso,
          timeZone: "Asia/Kolkata"
        },
        extendedProperties: {
          private: {
            id: booking.bookingIdOnGoogle
          }
        }
      };
      
      const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(eventPayload)
      });
      
      if (!response.ok) {
        throw new Error(`Failed to create calendar event for accommodation: ${accommodation}`);
      }
      
      const createdEvent = await response.json();
      eventIds.push([calendarId, createdEvent.id]);
    });
    
    await Promise.all(insertPromises);
    
    bookingsCache.clear();
    
    // Save updated booking state with associated eventIds
    const finalBooking = { ...booking, eventIds };
    
    // Trigger push notification on Render server
    await renderService.triggerNewBookingNotification(finalBooking);
    
    return eventIds;
  },

  async updateBooking(booking: BookingDetails): Promise<void> {
    const accessToken = getAccessToken();
    
    // Update each existing event associated with this booking
    const updatePromises = booking.eventIds.map(async ([calendarId, eventId]) => {
      const eventPayload = {
        summary: booking.bookingMainPerson,
        description: JSON.stringify({
          ...booking,
          eventIds: [] // clear eventIds to avoid cyclic/stale info in description
        })
      };
      
      const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${eventId}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(eventPayload)
      });
      
      if (!response.ok) {
        console.error(`Failed to update calendar event ${eventId} in calendar ${calendarId}`);
      }
    });
    
    await Promise.all(updatePromises);
    
    bookingsCache.clear();
    
    // Trigger push notification on Render server
    await renderService.triggerUpdatedBookingNotification(booking);
  },

  async deleteBooking(booking: BookingDetails): Promise<void> {
    const accessToken = getAccessToken();
    
    // Delete each existing event associated with this booking
    const deletePromises = booking.eventIds.map(async ([calendarId, eventId]) => {
      const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${eventId}?sendUpdates=none`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      });
      
      if (!response.ok) {
        console.error(`Failed to delete calendar event ${eventId} in calendar ${calendarId}`);
      }
    });
    
    await Promise.all(deletePromises);
    
    bookingsCache.clear();
    
    // Trigger push notification on Render server
    await renderService.triggerDeletedBookingNotification(booking);
  }
};
