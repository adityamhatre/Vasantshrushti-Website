import { useState, useEffect } from "react";
import { type BookingDetails, Accommodation, PaymentType, ApprovedPerson, ACCOMMODATION_NAMES } from "../types";
import { calendarService, parseHumanDateToISO, toHumanDate } from "../services/calendarService";
import { authService } from "../services/authService";
import { X, Shield } from "lucide-react";

interface BookingFormProps {
  bookingToEdit: BookingDetails | null;
  initialDate?: { date: number; month: number; year: number } | null;
  onClose: () => void;
  onSuccess: () => void;
  isMobileFullScreen?: boolean;
}

export function BookingForm({
  bookingToEdit,
  initialDate,
  onClose,
  onSuccess,
  isMobileFullScreen = false
}: BookingFormProps) {
  const isEditMode = !!bookingToEdit;

  // Form Fields State
  const [guestName, setGuestName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [headcount, setHeadcount] = useState<number | string>(1);
  const [notes, setNotes] = useState("");
  const [bookedBy, setBookedBy] = useState<ApprovedPerson>(ApprovedPerson.ADITYA_MHATRE);
  
  // Advance Payment State
  const [advanceReceived, setAdvanceReceived] = useState(false);
  const [advanceAmount, setAdvanceAmount] = useState<number | string>(0);
  const [paymentType, setPaymentType] = useState<PaymentType>(PaymentType.NONE);

  // Timeframe and Presets State
  const [isOneDayBooking, setIsOneDayBooking] = useState(false);
  const [checkInDate, setCheckInDate] = useState("");
  const [checkInTime, setCheckInTime] = useState("12:00 PM"); // "12:00 PM" or "5:30 PM"
  const [checkOutDate, setCheckOutDate] = useState("");
  const [checkOutTime, setCheckOutTime] = useState("4:00 PM"); // "11:00 AM" or "4:00 PM"
  const [oneDayPreset, setOneDayPreset] = useState("9:30 AM to 5:00 PM"); // or "4:00 PM to 11:55 PM"

  // Availability / Accommodations State
  const [checkingAvailability, setCheckingAvailability] = useState(false);
  const [availabilityChecked, setAvailabilityChecked] = useState(false);
  const [availableRooms, setAvailableRooms] = useState<Accommodation[]>([]);
  const [selectedRooms, setSelectedRooms] = useState<Accommodation[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  // Set logged in user as default bookedBy
  useEffect(() => {
    const user = authService.getLoggedInUser();
    if (user) {
      setBookedBy(user.role);
    }
  }, []);

  // Pre-fill fields if editing
  useEffect(() => {
    if (isEditMode && bookingToEdit) {
      setGuestName(bookingToEdit.bookingMainPerson);
      setPhoneNumber(bookingToEdit.phoneNumber);
      setHeadcount(bookingToEdit.totalNumberOfPeople);
      setNotes(bookingToEdit.notes);
      setBookedBy(bookingToEdit.bookedBy);
      
      setAdvanceReceived(bookingToEdit.advancePaymentInfo.advanceReceived);
      setAdvanceAmount(bookingToEdit.advancePaymentInfo.amount);
      setPaymentType(bookingToEdit.advancePaymentInfo.paymentType);
      
      // Parse Check-in
      // e.g. "09 January 2021, 09:30 AM" -> checkInDate = "2021-01-09", checkInTime = "09:30 AM"
      try {
        const checkInIso = parseHumanDateToISO(bookingToEdit.checkIn);
        const inDate = new Date(checkInIso);
        const yyyy = inDate.getFullYear();
        const mm = String(inDate.getMonth() + 1).padStart(2, "0");
        const dd = String(inDate.getDate()).padStart(2, "0");
        setCheckInDate(`${yyyy}-${mm}-${dd}`);

        const checkOutIso = parseHumanDateToISO(bookingToEdit.checkOut);
        const outDate = new Date(checkOutIso);
        const oy = outDate.getFullYear();
        const om = String(outDate.getMonth() + 1).padStart(2, "0");
        const od = String(outDate.getDate()).padStart(2, "0");
        setCheckOutDate(`${oy}-${om}-${od}`);

        // Detect if it was one day booking
        const isOneDay = bookingToEdit.accommodations.includes(Accommodation.ONE_DAY);
        setIsOneDayBooking(isOneDay);

        if (isOneDay) {
          // Extract time from checkIn
          const checkInTimeStr = bookingToEdit.checkIn.split(",")[1]?.trim() || "";
          if (checkInTimeStr.startsWith("09:30")) {
            setOneDayPreset("9:30 AM to 5:00 PM");
          } else {
            setOneDayPreset("4:00 PM to 11:55 PM");
          }
          setSelectedRooms([Accommodation.ONE_DAY]);
        } else {
          const inTimeStr = bookingToEdit.checkIn.split(",")[1]?.trim() || "12:00 PM";
          setCheckInTime(inTimeStr);
          const outTimeStr = bookingToEdit.checkOut.split(",")[1]?.trim() || "4:00 PM";
          setCheckOutTime(outTimeStr);
          
          setSelectedRooms(bookingToEdit.accommodations);
        }
        
        // Immediately fetch availability (so the checkboxes can be loaded)
        checkAvailability(checkInIso, checkOutIso, bookingToEdit.accommodations);
      } catch (e) {
        console.error("Failed to parse edit dates", e);
      }
    } else if (initialDate) {
      const { year, month, date } = initialDate;
      const formatted = `${year}-${String(month).padStart(2, "0")}-${String(date).padStart(2, "0")}`;
      setCheckInDate(formatted);
      setCheckOutDate(formatted);
    }
  }, [bookingToEdit, initialDate]);

  // Construct checkIn and checkOut human readable dates
  const getHumanDateStrings = () => {
    if (isOneDayBooking) {
      // One day checks in and out on the same day
      const dateParts = checkInDate.split("-");
      if (dateParts.length < 3) return { checkIn: "", checkOut: "" };
      
      const year = parseInt(dateParts[0], 10);
      const month = parseInt(dateParts[1], 10);
      const day = parseInt(dateParts[2], 10);
      
      const checkInObj = new Date(year, month - 1, day, oneDayPreset.startsWith("9:30") ? 9 : 16, oneDayPreset.startsWith("9:30") ? 30 : 0);
      const checkOutObj = new Date(year, month - 1, day, oneDayPreset.startsWith("9:30") ? 17 : 23, oneDayPreset.startsWith("9:30") ? 0 : 55);
      
      return {
        checkIn: toHumanDate(checkInObj),
        checkOut: toHumanDate(checkOutObj)
      };
    } else {
      const inParts = checkInDate.split("-");
      const outParts = checkOutDate.split("-");
      if (inParts.length < 3 || outParts.length < 3) return { checkIn: "", checkOut: "" };
      
      const inHour = checkInTime.startsWith("12:00") ? 12 : 17;
      const inMin = checkInTime.startsWith("12:00") ? 0 : 30;
      
      const outHour = checkOutTime.startsWith("11:00") ? 11 : 16;
      const outMin = 0;
      
      const checkInObj = new Date(parseInt(inParts[0], 10), parseInt(inParts[1], 10) - 1, parseInt(inParts[2], 10), inHour, inMin);
      const checkOutObj = new Date(parseInt(outParts[0], 10), parseInt(outParts[1], 10) - 1, parseInt(outParts[2], 10), outHour, outMin);
      
      return {
        checkIn: toHumanDate(checkInObj),
        checkOut: toHumanDate(checkOutObj)
      };
    }
  };

  const checkAvailability = async (overrideIn?: string, overrideOut?: string, preselected: Accommodation[] = []) => {
    setCheckingAvailability(true);
    try {
      let inIso = "";
      let outIso = "";
      
      if (overrideIn && overrideOut) {
        inIso = overrideIn;
        outIso = overrideOut;
      } else {
        const dates = getHumanDateStrings();
        if (!dates.checkIn || !dates.checkOut) {
          alert("Please fill in valid check-in and check-out dates");
          return;
        }
        inIso = parseHumanDateToISO(dates.checkIn);
        outIso = parseHumanDateToISO(dates.checkOut);
      }
      
      // Perform API call
      const available = await calendarService.checkAvailability(toHumanDate(inIso), toHumanDate(outIso));
      
      // Merge with preselected rooms (important when editing!)
      const merged = Array.from(new Set([...available, ...preselected]));
      setAvailableRooms(merged);
      setAvailabilityChecked(true);
    } catch (e) {
      alert("Failed to check availability: " + (e as Error).message);
    } finally {
      setCheckingAvailability(false);
    }
  };

  const handleRoomToggle = (room: Accommodation) => {
    if (selectedRooms.includes(room)) {
      setSelectedRooms(selectedRooms.filter(r => r !== room));
    } else {
      setSelectedRooms([...selectedRooms, room]);
    }
  };

  // Shortcut Selectors
  const selectWholeResort = () => {
    // Select all available rooms
    const allEligible = Object.values(Accommodation).filter(
      r => r !== Accommodation.ONE_DAY && r !== Accommodation.BUNGALOW_5_1
    );
    setSelectedRooms(allEligible.filter(r => availableRooms.includes(r)));
  };

  const selectBungalowAndRooms = () => {
    // First 10 items
    const roomsList = [
      Accommodation.BUNGALOW_3_1,
      Accommodation.SPECIAL_ROOM_1,
      Accommodation.SPECIAL_ROOM_2,
      Accommodation.ROOM_1_VIHAR,
      Accommodation.ROOM_2_VISHAVA,
      Accommodation.ROOM_3_VISHRAM,
      Accommodation.ROOM_4_VISHRANT,
      Accommodation.NIVANT,
      Accommodation.DORMITORY_SOBAT,
      Accommodation.DORMITORY_SANGAT
    ];
    setSelectedRooms(roomsList.filter(r => availableRooms.includes(r)));
  };

  const selectBungalow51 = () => {
    const list = [
      Accommodation.BUNGALOW_3_1,
      Accommodation.SPECIAL_ROOM_1,
      Accommodation.SPECIAL_ROOM_2
    ];
    setSelectedRooms(list.filter(r => availableRooms.includes(r)));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!guestName) {
      alert("Guest name is required");
      return;
    }
    if (selectedRooms.length === 0) {
      alert("Please select at least one accommodation room");
      return;
    }

    const { checkIn, checkOut } = getHumanDateStrings();
    
    // Check validation of checkIn / checkOut times
    const checkInTimeMs = new Date(parseHumanDateToISO(checkIn)).getTime();
    const checkOutTimeMs = new Date(parseHumanDateToISO(checkOut)).getTime();
    
    if (checkOutTimeMs <= checkInTimeMs) {
      alert("Check-out time cannot be before or equal to check-in time");
      return;
    }

    // Verify booking duration limit (15 days)
    const durationDays = (checkOutTimeMs - checkInTimeMs) / (1000 * 60 * 60 * 24);
    if (durationDays > 15) {
      alert("Booking duration cannot exceed 15 days");
      return;
    }

    setIsSaving(true);
    try {
      const finalBooking: BookingDetails = {
        bookingIdOnGoogle: isEditMode && bookingToEdit ? bookingToEdit.bookingIdOnGoogle : crypto.randomUUID(),
        accommodations: selectedRooms,
        checkIn,
        checkOut,
        bookingMainPerson: guestName,
        totalNumberOfPeople: typeof headcount === "number" ? headcount : (parseInt(headcount, 10) || 1),
        bookedBy,
        advancePaymentInfo: {
          advanceReceived,
          amount: advanceReceived ? (typeof advanceAmount === "number" ? advanceAmount : (parseInt(advanceAmount as string, 10) || 0)) : -1,
          paymentType: advanceReceived ? paymentType : PaymentType.NONE
        },
        phoneNumber,
        notes,
        eventIds: isEditMode && bookingToEdit ? bookingToEdit.eventIds : []
      };

      if (isEditMode) {
        await calendarService.updateBooking(finalBooking);
      } else {
        await calendarService.createBooking(finalBooking);
      }
      onSuccess();
    } catch (err) {
      alert("Error saving booking: " + (err as Error).message);
    } finally {
      setIsSaving(false);
    }
  };

  // -- Shared form fields (rendered inside both mobile and desktop wrappers) --
  const renderFormFields = () => (
    <>
      {/* Guest Information */}
      <div className="space-y-4">
        <h3 className="text-xs font-semibold text-purple-400 uppercase tracking-wider m-0">Guest Details</h3>
        
        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col space-y-1.5 col-span-2 sm:col-span-1">
            <label className="text-2xs text-[#9ca3af] font-medium">Guest Name (Primary)</label>
            <input 
              type="text"
              required
              value={guestName}
              onChange={e => setGuestName(e.target.value)}
              className="bg-[#0f1014] border border-[#1f2028] rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500 transition"
              placeholder="e.g. Rajesh Patil"
            />
          </div>

          <div className="flex flex-col space-y-1.5 col-span-2 sm:col-span-1">
            <label className="text-2xs text-[#9ca3af] font-medium">Phone Number</label>
            <input 
              type="tel"
              value={phoneNumber}
              onChange={e => setPhoneNumber(e.target.value)}
              className="bg-[#0f1014] border border-[#1f2028] rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500 transition"
              placeholder="e.g. 9892125375"
            />
          </div>

          <div className="flex flex-col space-y-1.5">
            <label className="text-2xs text-[#9ca3af] font-medium">Total People (Headcount)</label>
            <input 
              type="number"
              min="1"
              value={headcount}
              onChange={e => {
                const val = e.target.value;
                setHeadcount(val === "" ? "" : (parseInt(val, 10) || 0));
              }}
              className="bg-[#0f1014] border border-[#1f2028] rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500 transition"
            />
          </div>

          <div className="flex flex-col space-y-1.5">
            <label className="text-2xs text-[#9ca3af] font-medium">Booked By Agent</label>
            <select
              value={bookedBy}
              onChange={e => setBookedBy(e.target.value as ApprovedPerson)}
              className="bg-[#0f1014] border border-[#1f2028] rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500 transition"
            >
              {Object.values(ApprovedPerson).map(p => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

          {/* Timeframe Presets */}
          <div className="space-y-4 pt-2">
            <div className="flex justify-between items-center">
              <h3 className="text-xs font-semibold text-purple-400 uppercase tracking-wider m-0">Booking Schedule</h3>
              <label className="flex items-center space-x-2 text-xs cursor-pointer">
                <input 
                  type="checkbox"
                  checked={isOneDayBooking}
                  onChange={e => {
                    setIsOneDayBooking(e.target.checked);
                    if (e.target.checked) {
                      setSelectedRooms([Accommodation.ONE_DAY]);
                    } else {
                      setSelectedRooms([]);
                    }
                    setAvailabilityChecked(false);
                  }}
                  className="rounded border-[#1f2028] text-purple-600 focus:ring-purple-500 bg-[#0f1014]"
                />
                <span>One Day Booking Preset</span>
              </label>
            </div>

            {isOneDayBooking ? (
              <div className="bg-[#0f1014] border border-[#1f2028] rounded-2xl p-4 space-y-4">
                <div className="flex flex-col space-y-1.5">
                  <label className="text-2xs text-[#9ca3af] font-medium">Date</label>
                  <input 
                    type="date"
                    required
                    value={checkInDate}
                    onChange={e => {
                      setCheckInDate(e.target.value);
                      setCheckOutDate(e.target.value);
                      setAvailabilityChecked(false);
                    }}
                    className="bg-[#12131a] border border-[#1f2028] rounded-xl px-3 py-2 text-sm text-white focus:outline-none"
                  />
                </div>
                
                <div className="flex flex-col space-y-1.5">
                  <label className="text-2xs text-[#9ca3af] font-medium">Select Timings</label>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      "9:30 AM to 5:00 PM",
                      "4:00 PM to 11:55 PM"
                    ].map(timing => (
                      <button
                        key={timing}
                        type="button"
                        onClick={() => {
                          setOneDayPreset(timing);
                          setAvailabilityChecked(false);
                        }}
                        className={`py-2 rounded-xl text-xs font-semibold border transition ${
                          oneDayPreset === timing 
                            ? "bg-purple-950/40 border-purple-500/50 text-purple-300"
                            : "bg-[#12131a] border-[#1f2028] text-[#9ca3af] hover:text-white"
                        }`}
                      >
                        {timing}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-[#0f1014] border border-[#1f2028] rounded-2xl p-4 space-y-4">
                {/* Check In */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex flex-col space-y-1.5">
                    <label className="text-2xs text-[#9ca3af] font-medium">Check-In Date</label>
                    <input 
                      type="date"
                      required
                      value={checkInDate}
                      onChange={e => {
                        setCheckInDate(e.target.value);
                        setAvailabilityChecked(false);
                      }}
                      className="bg-[#12131a] border border-[#1f2028] rounded-xl px-3 py-2 text-sm text-white focus:outline-none"
                    />
                  </div>
                  <div className="flex flex-col space-y-1.5">
                    <label className="text-2xs text-[#9ca3af] font-medium">Check-In Time</label>
                    <div className="grid grid-cols-2 gap-2">
                      {["12:00 PM", "5:30 PM"].map(time => (
                        <button
                          key={time}
                          type="button"
                          onClick={() => {
                            setCheckInTime(time);
                            setAvailabilityChecked(false);
                          }}
                          className={`py-1.5 rounded-xl text-xs font-medium border transition ${
                            checkInTime === time
                              ? "bg-purple-950/40 border-purple-500/50 text-purple-300"
                              : "bg-[#12131a] border-[#1f2028] text-[#9ca3af] hover:text-white"
                          }`}
                        >
                          {time}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Check Out */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex flex-col space-y-1.5">
                    <label className="text-2xs text-[#9ca3af] font-medium">Check-Out Date</label>
                    <input 
                      type="date"
                      required
                      value={checkOutDate}
                      onChange={e => {
                        setCheckOutDate(e.target.value);
                        setAvailabilityChecked(false);
                      }}
                      className="bg-[#12131a] border border-[#1f2028] rounded-xl px-3 py-2 text-sm text-white focus:outline-none"
                    />
                  </div>
                  <div className="flex flex-col space-y-1.5">
                    <label className="text-2xs text-[#9ca3af] font-medium">Check-Out Time</label>
                    <div className="grid grid-cols-2 gap-2">
                      {["11:00 AM", "4:00 PM"].map(time => (
                        <button
                          key={time}
                          type="button"
                          onClick={() => {
                            setCheckOutTime(time);
                            setAvailabilityChecked(false);
                          }}
                          className={`py-1.5 rounded-xl text-xs font-medium border transition ${
                            checkOutTime === time
                              ? "bg-purple-950/40 border-purple-500/50 text-purple-300"
                              : "bg-[#12131a] border-[#1f2028] text-[#9ca3af] hover:text-white"
                          }`}
                        >
                          {time}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Check Availability Trigger */}
            {!isOneDayBooking && (
              <button
                type="button"
                onClick={() => checkAvailability()}
                disabled={checkingAvailability}
                className="w-full flex items-center justify-center space-x-2 py-2.5 rounded-xl font-semibold text-xs border border-purple-500/30 bg-purple-950/20 hover:bg-purple-950/40 text-purple-300 transition"
              >
                {checkingAvailability ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-purple-300 border-t-transparent rounded-full animate-spin"></div>
                    <span>Checking availability...</span>
                  </>
                ) : (
                  <>
                    <Shield className="w-4 h-4" />
                    <span>Check Room Availability</span>
                  </>
                )}
              </button>
            )}
          </div>

          {/* Accommodations Room Selection */}
          {(isOneDayBooking || availabilityChecked) && (
            <div className="space-y-4 pt-2">
              <div className="flex justify-between items-center">
                <h3 className="text-xs font-semibold text-purple-400 uppercase tracking-wider m-0">Accommodations</h3>
                
                {/* Shortcuts (only if not one day booking) */}
                {!isOneDayBooking && (
                  <div className="flex items-center space-x-2 text-[10px]">
                    <button
                      type="button"
                      onClick={selectWholeResort}
                      className="px-2 py-1 rounded bg-[#1f2028] hover:bg-[#2e303a] text-purple-300 font-semibold"
                    >
                      Whole Resort
                    </button>
                    <button
                      type="button"
                      onClick={selectBungalowAndRooms}
                      className="px-2 py-1 rounded bg-[#1f2028] hover:bg-[#2e303a] text-purple-300 font-semibold"
                    >
                      Bungalow & Rooms
                    </button>
                    <button
                      type="button"
                      onClick={selectBungalow51}
                      className="px-2 py-1 rounded bg-[#1f2028] hover:bg-[#2e303a] text-purple-300 font-semibold"
                    >
                      Bungalow (5+1)
                    </button>
                  </div>
                )}
              </div>

              {isOneDayBooking ? (
                <div className="bg-[#0f1014] border border-purple-500/20 rounded-2xl p-4 flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <input 
                      type="checkbox"
                      checked={selectedRooms.includes(Accommodation.ONE_DAY)}
                      disabled
                      className="rounded border-[#1f2028] text-purple-600 bg-[#0f1014]"
                    />
                    <div>
                      <span className="text-sm font-semibold text-white">One Day Preset Calendar</span>
                      <p className="text-2xs text-[#9ca3af] m-0">Blocks day bookings calendar</p>
                    </div>
                  </div>
                  <span className="text-2xs px-2 py-0.5 rounded bg-purple-950/40 text-purple-300 border border-purple-500/20 font-medium">
                    Auto-selected
                  </span>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  {Object.values(Accommodation)
                    .filter(room => room !== Accommodation.ONE_DAY && room !== Accommodation.BUNGALOW_5_1)
                    .map(room => {
                      const isAvailable = availableRooms.includes(room);
                      const isChecked = selectedRooms.includes(room);
                      
                      return (
                        <label 
                          key={room} 
                          className={`flex items-start space-x-3 p-3 rounded-xl border transition cursor-pointer select-none ${
                            isChecked 
                              ? "bg-purple-950/20 border-purple-500/40 text-white" 
                              : isAvailable
                                ? "bg-[#0f1014] border-[#1f2028] text-[#d1d5db] hover:border-[#2e303a]"
                                : "bg-[#16171d]/30 border-[#1f2028]/40 text-[#4b5563] cursor-not-allowed opacity-55"
                          }`}
                        >
                          <input 
                            type="checkbox"
                            checked={isChecked}
                            disabled={!isAvailable}
                            onChange={() => handleRoomToggle(room)}
                            className="rounded border-[#1f2028] text-purple-600 focus:ring-purple-500 bg-[#0f1014] mt-0.5 disabled:opacity-30"
                          />
                          <div>
                            <span className="text-xs font-semibold leading-tight block">{ACCOMMODATION_NAMES[room]}</span>
                          </div>
                        </label>
                      );
                    })
                  }
                </div>
              )}
            </div>
          )}

          {/* Advance Payment Details */}
          <div className="space-y-4 pt-2">
            <h3 className="text-xs font-semibold text-purple-400 uppercase tracking-wider m-0">Payment Details</h3>
            
            <div className="bg-[#0f1014] border border-[#1f2028] rounded-2xl p-4 space-y-4">
              <label className="flex items-center space-x-3 cursor-pointer">
                <input 
                  type="checkbox"
                  checked={advanceReceived}
                  onChange={e => {
                    setAdvanceReceived(e.target.checked);
                    if (e.target.checked && paymentType === PaymentType.NONE) {
                      setPaymentType(PaymentType.CASH);
                    }
                  }}
                  className="rounded border-[#1f2028] text-purple-600 focus:ring-purple-500 bg-[#0f1014]"
                />
                <span className="text-xs font-semibold text-white">Advance Payment Received</span>
              </label>

              {advanceReceived && (
                <div className="grid grid-cols-2 gap-4 pt-2 border-t border-[#1f2028]/60">
                  <div className="flex flex-col space-y-1.5">
                    <label className="text-2xs text-[#9ca3af] font-medium">Advance Amount (₹)</label>
                    <input 
                      type="number"
                      min="0"
                      value={advanceAmount}
                      onChange={e => {
                        const val = e.target.value;
                        setAdvanceAmount(val === "" ? "" : (parseInt(val, 10) || 0));
                      }}
                      className="bg-[#12131a] border border-[#1f2028] rounded-xl px-3 py-2 text-sm text-white focus:outline-none"
                    />
                  </div>

                  <div className="flex flex-col space-y-1.5">
                    <label className="text-2xs text-[#9ca3af] font-medium">Payment Mode</label>
                    <select
                      value={paymentType}
                      onChange={e => setPaymentType(e.target.value as PaymentType)}
                      className="bg-[#12131a] border border-[#1f2028] rounded-xl px-3 py-2 text-sm text-white focus:outline-none"
                    >
                      <option value={PaymentType.CASH}>Cash</option>
                      <option value={PaymentType.CHEQUE}>Cheque</option>
                      <option value={PaymentType.BANK_DEPOSIT}>Bank Deposit</option>
                      <option value={PaymentType.NONE}>None</option>
                    </select>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Special Notes */}
          <div className="space-y-4 pt-2">
            <h3 className="text-xs font-semibold text-purple-400 uppercase tracking-wider m-0">Special Notes</h3>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={3}
              className="w-full bg-[#0f1014] border border-[#1f2028] rounded-xl p-3 text-xs text-white focus:outline-none focus:border-purple-500 transition resize-none"
              placeholder="Enter optional comments, discount codes, or custom accommodation specs..."
            />
          </div>
    </>
  );

  // Action buttons footer (shared)
  const actionButtons = (
    <div className="p-4 border-t border-[#1f2028] flex space-x-3 bg-[#181922] shrink-0">
      <button
        type="button"
        onClick={onClose}
        disabled={isSaving}
        className="flex-1 py-3 rounded-xl font-semibold text-xs bg-[#1f2028] hover:bg-[#2e303a] text-white transition disabled:opacity-50"
      >
        Cancel
      </button>
      <button
        type="button"
        onClick={handleSubmit}
        disabled={isSaving || (!isOneDayBooking && !availabilityChecked)}
        className="flex-1 py-3 rounded-xl font-semibold text-xs bg-purple-600 hover:bg-purple-500 text-white transition shadow-purple-500/35 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isSaving ? "Saving..." : isEditMode ? "Save Changes" : "Create Booking"}
      </button>
    </div>
  );

  // MOBILE: Full-screen inline form (no overlay, header managed by parent App.tsx)
  if (isMobileFullScreen) {
    return (
      <div className="h-full flex flex-col bg-[#12131a] overflow-hidden">
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 space-y-6">
          {renderFormFields()}
        </form>
        {actionButtons}
      </div>
    );
  }

  // DESKTOP: Slide-over modal panel
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-end bg-black/60 backdrop-blur-xs">
      <div className="w-full max-w-lg h-full bg-[#12131a] border-l border-[#1f2028] flex flex-col safe-padding-top safe-padding-bottom shadow-2xl overflow-hidden">
        {/* Form Header */}
        <div className="p-4 border-b border-[#1f2028] flex justify-between items-center bg-[#181922]">
          <div>
            <h2 className="text-base font-semibold text-white m-0">
              {isEditMode ? "Edit Booking" : "Create New Booking"}
            </h2>
            <p className="text-2xs text-[#9ca3af] m-0">
              {isEditMode ? `ID: ${bookingToEdit?.bookingIdOnGoogle}` : "Enter details for the new farm booking"}
            </p>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 rounded-lg bg-[#1f2028] hover:bg-[#2e303a] text-[#9ca3af] transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Form Content */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 space-y-6">
          {renderFormFields()}
        </form>

        {/* Action Buttons Footer */}
        {actionButtons}
      </div>
    </div>
  );
}

