import { useState, useEffect, useRef } from "react";
import { renderService, type BookingSummary } from "../services/renderService";
import { calendarService } from "../services/calendarService";
import { type BookingDetails } from "../types";

interface RollingCalendarProps {
  onDateSelect: (date: number, month: number, year: number) => void;
  onMonthSelect: (month: number, year: number) => void;
  selectedDate: { date: number; month: number; year: number } | null;
  selectedMonth: { month: number; year: number } | null;
  refreshTrigger?: number;
}

// Helper to parse human check-in date string into timezone-independent parts
function getCheckInDateParts(checkInStr: string): { day: number; month: number; year: number } | null {
  try {
    if (!checkInStr) return null;
    
    // If it's an ISO string or similar date string
    if (checkInStr.includes("T") || !checkInStr.includes(",")) {
      const d = new Date(checkInStr);
      if (!isNaN(d.getTime())) {
        return {
          day: d.getDate(),
          month: d.getMonth() + 1,
          year: d.getFullYear()
        };
      }
    }

    const parts = checkInStr.split(",");
    if (parts.length < 1) return null;
    const dateParts = parts[0].trim().split(" ");
    if (dateParts.length < 3) return null;
    
    const day = parseInt(dateParts[0], 10);
    const monthName = dateParts[1];
    const year = parseInt(dateParts[2], 10);
    
    const months: Record<string, number> = {
      January: 1, February: 2, March: 3, April: 4, May: 5, June: 6,
      July: 7, August: 8, September: 9, October: 10, November: 11, December: 12
    };
    
    const month = months[monthName];
    if (!day || !month || !year) return null;
    return { day, month, year };
  } catch (e) {
    console.error("Failed to parse check-in date parts", e);
    return null;
  }
}

export function RollingCalendar({
  onDateSelect,
  onMonthSelect,
  selectedDate,
  selectedMonth,
  refreshTrigger
}: RollingCalendarProps) {
  const [summary, setSummary] = useState<BookingSummary>({});
  const [loading, setLoading] = useState(true);
  const [months, setMonths] = useState<Array<{ month: number; year: number }>>([]);
  const [bookingsByMonth, setBookingsByMonth] = useState<Record<string, BookingDetails[]>>({});
  
  const containerRef = useRef<HTMLDivElement>(null);
  const currentMonthRef = useRef<HTMLDivElement>(null);

  const today = new Date();
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth() + 1; // 1-indexed

  useEffect(() => {
    // Generate months list: from 4 months ago to 24 months in the future (matching Android)
    const generated: Array<{ month: number; year: number }> = [];
    let start = new Date(currentYear, currentMonth - 5, 1); // 4 months ago (currentMonth - 5 is 4 months ago, 0-indexed)

    for (let i = 0; i < 29; i++) {
      generated.push({
        month: start.getMonth() + 1,
        year: start.getFullYear()
      });
      start.setMonth(start.getMonth() + 1);
    }
    setMonths(generated);
  }, []);

  useEffect(() => {
    // Fetch monthly counts from Render API
    const fetchSummary = async () => {
      setLoading(true);
      try {
        const data = await renderService.getBookingSummary();
        setSummary(data);
      } catch (e) {
        console.error("Failed to load booking summary counts", e);
      } finally {
        setLoading(false);
      }
    };

    fetchSummary();
  }, [refreshTrigger]);

  // Fetch bookings for any month that has bookings counts in the summary
  useEffect(() => {
    const fetchBookingsForActiveMonths = async (force = false) => {
      const activeMonths = months.filter(({ month, year }) => getMonthCount(month, year) > 0);
      
      for (const { month, year } of activeMonths) {
        try {
          const data = await calendarService.getBookingsForMonth(month, year, force);
          const key = `${month}-${year}`;
          setBookingsByMonth(prev => ({
            ...prev,
            [key]: data
          }));
        } catch (e) {
          console.error(`Failed to load bookings for ${month}/${year} in calendar view`, e);
        }
      }
    };

    if (months.length > 0 && Object.keys(summary).length > 0) {
      const shouldForce = (refreshTrigger ?? 0) > 0;
      fetchBookingsForActiveMonths(shouldForce);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [summary, months, refreshTrigger]);

  useEffect(() => {
    if (months.length > 0) {
      // Scroll current month into view (align to top)
      currentMonthRef.current?.scrollIntoView({ behavior: "auto", block: "start" });
    }
  }, [months]);

  const getMonthName = (m: number) => {
    const names = [
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December"
    ];
    return names[m - 1];
  };

  const getMonthCount = (m: number, y: number) => {
    const key = `${m.toString().padStart(2, "0")}${y}`;
    return summary[key] ?? 0;
  };

  // Helper to calculate days grid for a month
  const getDaysInMonth = (m: number, y: number) => {
    // JS Date constructor month parameter is 0-indexed
    const firstDayIndex = new Date(y, m - 1, 1).getDay(); // 0 = Sunday, 1 = Monday, ...
    const totalDays = new Date(y, m, 0).getDate();
    
    const days: Array<number | null> = [];
    
    // Fill prefix blanks
    for (let i = 0; i < firstDayIndex; i++) {
      days.push(null);
    }
    
    // Fill days
    for (let i = 1; i <= totalDays; i++) {
      days.push(i);
    }
    
    return days;
  };

  return (
    <div className="w-full h-full flex flex-col overflow-hidden bg-[#0f1014] text-white">
      {/* Header */}
      <div className="p-4 border-b border-[#1f2028] bg-[#12131a] flex justify-between items-center shrink-0">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-white m-0">Vasantshrushti Scheduler</h1>
          <p className="text-xs text-[#9ca3af] m-0">Select a date or month to view/manage bookings</p>
        </div>
        {loading && (
          <div className="text-xs text-purple-400 animate-pulse bg-purple-950/30 px-2.5 py-1 rounded-full border border-purple-500/20">
            Syncing summary...
          </div>
        )}
      </div>

      {/* Rolling List Container */}
      <div ref={containerRef} className="flex-1 overflow-y-auto p-4 space-y-6">
        {months.map(({ month, year }) => {
          const daysGrid = getDaysInMonth(month, year);
          const count = getMonthCount(month, year);
          const isMonthSelected = selectedMonth?.month === month && selectedMonth?.year === year && !selectedDate;
          const isCurrentMonth = month === currentMonth && year === currentYear;
          
          return (
            <div 
              key={`${month}-${year}`} 
              ref={isCurrentMonth ? currentMonthRef : undefined}
              className={`rounded-2xl border transition-all duration-300 ${
                isMonthSelected 
                  ? "border-purple-500 bg-purple-950/20 shadow-purple-500/15" 
                  : "border-[#1f2028] bg-[#12131a] hover:border-[#2e303a]"
              }`}
            >
              {/* Month Header Card */}
              <div 
                onClick={() => onMonthSelect(month, year)}
                className="p-4 flex justify-between items-center cursor-pointer border-b border-[#1f2028]/60 hover:bg-[#1a1c26]/40 rounded-t-2xl"
              >
                <div>
                  <h2 className="text-base font-semibold text-[#f3f4f6] m-0">
                    {getMonthName(month)} {year}
                  </h2>
                </div>
                <div className="flex items-center space-x-2">
                  <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                    count > 0 
                      ? "bg-purple-950/40 text-purple-300 border border-purple-500/25" 
                      : "bg-[#1f2028] text-[#9ca3af] border border-[#2e303a]"
                  }`}>
                    {count > 0 ? `${count} booking${count > 1 ? "s" : ""}` : "No bookings"}
                  </span>
                </div>
              </div>

              {/* Days Grid */}
              <div className="p-4">
                {/* Weekdays Labels */}
                <div className="grid grid-cols-7 gap-1 text-center mb-2">
                  {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((day, idx) => (
                    <span key={idx} className="text-2xs font-semibold text-[#4b5563] uppercase tracking-wider">
                      {day}
                    </span>
                  ))}
                </div>

                {/* Date Grid */}
                <div className="grid grid-cols-7 gap-1">
                  {daysGrid.map((day, idx) => {
                    if (day === null) {
                      return <div key={`empty-${idx}`} className="aspect-square" />;
                    }

                    const isSelected = 
                      selectedDate?.date === day && 
                      selectedDate?.month === month && 
                      selectedDate?.year === year;

                    const monthBookings = bookingsByMonth[`${month}-${year}`] || [];
                    const hasBookingStartingThisDay = monthBookings.some(b => {
                      const dateParts = getCheckInDateParts(b.checkIn);
                      return dateParts && dateParts.day === day && dateParts.month === month && dateParts.year === year;
                    });

                    return (
                      <button
                        key={`day-${day}`}
                        onClick={() => onDateSelect(day, month, year)}
                        className={`aspect-square w-full rounded-xl flex flex-col items-center justify-center text-sm font-medium transition-all relative ${
                          isSelected
                            ? "bg-purple-600 text-white shadow-purple-500/40"
                            : "text-[#d1d5db] hover:bg-[#1f2028]"
                        }`}
                      >
                        <span>{day}</span>
                        {/* Booking start date dot indicator */}
                        {hasBookingStartingThisDay && (
                          <span className={`absolute bottom-1 w-1 h-1 rounded-full ${
                            isSelected ? "bg-white" : "bg-purple-500"
                          }`} />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
