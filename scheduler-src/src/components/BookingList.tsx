import { useState } from "react";
import { type BookingDetails } from "../types";
import { calendarService, parseHumanDateToISO } from "../services/calendarService";
import { getAccommodationsReadableString } from "../services/renderService";
import { Trash2, Edit3, Share2, Phone, Users, Calendar as CalendarIcon, Info, Receipt, X, Copy, Check, RefreshCw } from "lucide-react";

interface BookingListProps {
  bookings: BookingDetails[];
  loading: boolean;
  selectedDate: { date: number; month: number; year: number } | null;
  selectedMonth: { month: number; year: number } | null;
  onEdit: (booking: BookingDetails) => void;
  onDeleteSuccess: () => void;
  onCreateNew: () => void;
  onRefresh: () => void;
}

export function BookingList({
  bookings,
  loading,
  selectedDate,
  selectedMonth,
  onEdit,
  onDeleteSuccess,
  onCreateNew,
  onRefresh
}: BookingListProps) {
  const [sharingBooking, setSharingBooking] = useState<BookingDetails | null>(null);
  const [deletingBooking, setDeletingBooking] = useState<BookingDetails | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [copied, setCopied] = useState(false);

  // Filter bookings for the selected date if specified
  const filteredBookings = bookings.filter(b => {
    if (!selectedDate) return true; // Show all if month is selected
    
    // Parse checkIn and checkOut dates
    try {
      const checkInDate = new Date(parseHumanDateToISO(b.checkIn));
      const checkOutDate = new Date(parseHumanDateToISO(b.checkOut));
      
      const targetDateStart = new Date(selectedDate.year, selectedDate.month - 1, selectedDate.date, 0, 0, 0);
      const targetDateEnd = new Date(selectedDate.year, selectedDate.month - 1, selectedDate.date, 23, 59, 59);
      
      // A booking overlaps with target date if its interval overlaps with target date's interval
      return checkInDate <= targetDateEnd && checkOutDate >= targetDateStart;
    } catch {
      return false;
    }
  });

  const handleDelete = async () => {
    if (!deletingBooking) return;
    setIsDeleting(true);
    try {
      await calendarService.deleteBooking(deletingBooking);
      setDeletingBooking(null);
      onDeleteSuccess();
    } catch (e) {
      alert("Failed to delete booking: " + (e as Error).message);
    } finally {
      setIsDeleting(false);
    }
  };

  const getReceiptText = (b: BookingDetails) => {
    const accommodationsStr = getAccommodationsReadableString(b.accommodations);
    const advanceInfo = b.advancePaymentInfo.advanceReceived
      ? `₹${b.advancePaymentInfo.amount} (${b.advancePaymentInfo.paymentType})`
      : "No advance payment";
      
    return `Vasantshrushti Farm
At Mali Stop, Tarapur Boisar Road
Boisar West - 401502
Contact: 9892125375/8169076958

BOOKING RECEIPT
----------------------------------------
Guest Name: ${b.bookingMainPerson}
Phone Number: ${b.phoneNumber || "N/A"}
No. of People: ${b.totalNumberOfPeople}
Check In: ${b.checkIn}
Check Out: ${b.checkOut}
Accommodations: ${accommodationsStr}
Advance Payment: ${advanceInfo}
Booked By: ${b.bookedBy}
${b.notes ? `Notes: ${b.notes}\n` : ""}Tracking ID: ${b.bookingIdOnGoogle}
----------------------------------------
Thanks for choosing our farm for your enjoyment.
Rajesh V. Mhatre, Vasantshrushti Farm

*Advance payment made will not be refundable if booking is cancelled by you or as per government policy.*`;
  };

  const handleShare = async (b: BookingDetails) => {
    const shareText = getReceiptText(b);
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Booking Receipt - ${b.bookingMainPerson}`,
          text: shareText
        });
      } catch (e) {
        console.warn("Share failed or cancelled", e);
        setSharingBooking(b);
      }
    } else {
      setSharingBooking(b);
    }
  };

  const handleCopyText = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getMonthName = (m: number) => {
    const names = [
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December"
    ];
    return names[m - 1];
  };

  return (
    <div className="w-full h-full flex flex-col bg-[#0f1014] text-white">
      {/* Title Bar */}
      <div className="p-4 border-b border-[#1f2028] bg-[#12131a] flex justify-between items-center shrink-0">
        <div>
          <h2 className="text-base font-semibold text-white m-0">
            {selectedDate 
              ? `Bookings on ${selectedDate.date} ${getMonthName(selectedDate.month)} ${selectedDate.year}`
              : selectedMonth
                ? `Bookings for ${getMonthName(selectedMonth.month)} ${selectedMonth.year}`
                : "Select a date/month"
            }
          </h2>
          <p className="text-xs text-[#9ca3af] m-0">
            {loading ? "Loading bookings..." : `${filteredBookings.length} booking(s) found`}
          </p>
        </div>
        {(selectedDate || selectedMonth) && (
          <div className="flex items-center space-x-2">
            <button
              onClick={onRefresh}
              disabled={loading}
              className="p-1.5 rounded-xl bg-[#1f2028] hover:bg-[#2e303a] border border-[#2e303a]/60 text-[#d1d5db] hover:text-white transition active:scale-95 flex items-center justify-center disabled:opacity-50"
              title="Refresh bookings"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            </button>
            <button 
              onClick={onCreateNew}
              className="text-xs font-semibold bg-purple-600 hover:bg-purple-500 text-white px-3 py-1.5 rounded-xl transition shadow-purple-500/30 active:scale-95"
            >
              + Create Booking
            </button>
          </div>
        )}
      </div>

      {/* Bookings List Container */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {loading ? (
          <div className="h-full flex flex-col items-center justify-center py-20 space-y-3">
            <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
            <p className="text-xs text-[#9ca3af]">Fetching bookings from Google Calendar...</p>
          </div>
        ) : filteredBookings.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center py-20 text-center px-6">
            <div className="bg-[#12131a] p-4 rounded-full border border-[#1f2028] mb-4">
              <CalendarIcon className="w-8 h-8 text-[#4b5563]" />
            </div>
            <p className="text-sm font-medium text-white mb-1">No Bookings Found</p>
            <p className="text-xs text-[#9ca3af] max-w-xs mb-6">
              There are no bookings registered on Google Calendar for this period.
            </p>
            {(selectedDate || selectedMonth) && (
              <button
                onClick={onCreateNew}
                className="text-xs font-semibold bg-purple-950/40 hover:bg-purple-950/60 text-purple-300 border border-purple-500/35 px-4 py-2 rounded-xl transition"
              >
                Create One Now
              </button>
            )}
          </div>
        ) : (
          filteredBookings.map((b) => {
            const isAdvancePaid = b.advancePaymentInfo.advanceReceived;
            const accommodationStr = getAccommodationsReadableString(b.accommodations);
            
            return (
              <div 
                key={b.bookingIdOnGoogle} 
                className="bg-[#12131a] rounded-2xl border border-[#1f2028] p-4 hover:border-[#2e303a] transition-all flex flex-col space-y-4"
              >
                {/* Header info */}
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="text-base font-semibold text-white m-0 flex items-center">
                      {b.bookingMainPerson}
                    </h3>
                    <div className="flex items-center space-x-1.5 mt-1 text-[#9ca3af] text-2xs">
                      <Users className="w-3.5 h-3.5" />
                      <span>{b.totalNumberOfPeople} Headcount</span>
                      {b.phoneNumber && (
                        <>
                          <span className="text-[#374151]">•</span>
                          <a href={`tel:${b.phoneNumber}`} className="flex items-center hover:text-white transition">
                            <Phone className="w-3.5 h-3.5 mr-1" />
                            {b.phoneNumber}
                          </a>
                        </>
                      )}
                    </div>
                  </div>
                  
                  {/* Status Badges */}
                  <div className="flex flex-col items-end space-y-1">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium border ${
                      isAdvancePaid 
                        ? "bg-purple-950/40 text-purple-300 border-purple-500/25" 
                        : "bg-rose-950/40 text-rose-300 border-rose-500/25"
                    }`}>
                      {isAdvancePaid 
                        ? `₹${b.advancePaymentInfo.amount} Advance`
                        : "Unpaid Advance"
                      }
                    </span>
                    {isAdvancePaid && (
                      <span className="text-[9px] text-[#9ca3af]">
                        via {b.advancePaymentInfo.paymentType.replace("_", " ")}
                      </span>
                    )}
                  </div>
                </div>

                {/* Date-Times & Room info */}
                <div className="bg-[#0f1014] rounded-xl p-3 border border-[#1f2028]/60 space-y-2 text-xs">
                  <div className="flex items-start">
                    <div className="w-16 font-medium text-[#6b7280]">Check-In:</div>
                    <div className="text-[#d1d5db]">{b.checkIn}</div>
                  </div>
                  <div className="flex items-start">
                    <div className="w-16 font-medium text-[#6b7280]">Check-Out:</div>
                    <div className="text-[#d1d5db]">{b.checkOut}</div>
                  </div>
                  <div className="flex items-start">
                    <div className="w-16 font-medium text-[#6b7280]">Rooms:</div>
                    <div className="text-purple-400 font-semibold">{accommodationStr}</div>
                  </div>
                </div>

                {/* Notes if any */}
                {b.notes && (
                  <div className="text-xs text-[#9ca3af] bg-purple-950/20 border border-purple-500/10 p-2.5 rounded-xl flex items-start space-x-2">
                    <Info className="w-4 h-4 text-purple-400 shrink-0 mt-0.5" />
                    <span><strong className="text-[#d1d5db]">Notes:</strong> {b.notes}</span>
                  </div>
                )}

                {/* Action Buttons */}
                <div className="flex justify-between items-center border-t border-[#1f2028] pt-3 text-xs">
                  <span className="text-[10px] text-[#4b5563]">
                    Booked by {b.bookedBy}
                  </span>
                  
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => handleShare(b)}
                      className="p-2 rounded-xl bg-[#1f2028] hover:bg-[#2e303a] text-blue-400 transition"
                      title="Share Receipt"
                    >
                      <Share2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => onEdit(b)}
                      className="p-2 rounded-xl bg-[#1f2028] hover:bg-[#2e303a] text-[#c084fc] transition"
                      title="Edit Booking"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setDeletingBooking(b)}
                      className="p-2 rounded-xl bg-[#1f2028] hover:bg-rose-950/30 text-rose-400 transition"
                      title="Delete Booking"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Share / Receipt Modal */}
      {sharingBooking && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-[#12131a] border border-[#1f2028] rounded-2xl w-full max-w-md max-h-[85vh] flex flex-col overflow-hidden shadow-2xl">
            <div className="p-4 border-b border-[#1f2028] flex justify-between items-center bg-[#181922]">
              <div className="flex items-center space-x-2 text-purple-400">
                <Receipt className="w-5 h-5" />
                <h3 className="font-semibold text-white m-0">Share Receipt</h3>
              </div>
              <button 
                onClick={() => setSharingBooking(null)}
                className="p-1.5 rounded-lg bg-[#1f2028] hover:bg-[#2e303a] text-[#9ca3af] transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4">
              <pre className="text-[11px] font-mono text-[#d1d5db] bg-[#0f1014] border border-[#1f2028] p-3 rounded-xl whitespace-pre-wrap leading-relaxed select-all">
                {getReceiptText(sharingBooking)}
              </pre>
            </div>

            <div className="p-4 border-t border-[#1f2028] flex space-x-3 bg-[#181922]">
              <button
                onClick={() => handleCopyText(getReceiptText(sharingBooking))}
                className="flex-1 flex items-center justify-center space-x-2 py-2.5 rounded-xl font-medium text-xs border border-purple-500/30 bg-purple-950/30 hover:bg-purple-950/50 text-purple-300 transition"
              >
                {copied ? (
                  <>
                    <Check className="w-4 h-4 text-purple-400" />
                    <span className="text-purple-400">Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    <span>Copy Receipt Text</span>
                  </>
                )}
              </button>
              <button
                onClick={() => setSharingBooking(null)}
                className="flex-1 py-2.5 rounded-xl font-medium text-xs bg-[#1f2028] hover:bg-[#2e303a] text-white transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deletingBooking && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-[#12131a] border border-[#1f2028] rounded-2xl w-full max-w-sm p-5 shadow-2xl flex flex-col space-y-4">
            <h3 className="text-base font-semibold text-white">Delete Booking?</h3>
            <p className="text-xs text-[#9ca3af] leading-relaxed">
              Are you sure you want to delete the booking for <strong className="text-white">{deletingBooking.bookingMainPerson}</strong>? 
              This will remove calendar events from all selected Google Calendars and trigger push notifications.
            </p>
            <div className="flex space-x-3 pt-2">
              <button
                onClick={() => setDeletingBooking(null)}
                disabled={isDeleting}
                className="flex-1 py-2.5 rounded-xl font-medium text-xs bg-[#1f2028] hover:bg-[#2e303a] text-white transition disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={isDeleting}
                className="flex-1 py-2.5 rounded-xl font-medium text-xs bg-rose-600 hover:bg-rose-500 text-white transition shadow-rose-500/30 disabled:opacity-50"
              >
                {isDeleting ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
