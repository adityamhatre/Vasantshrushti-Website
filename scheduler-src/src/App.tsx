import { useState, useEffect, useCallback, useRef } from "react";
import { authService, type LoggedInUser } from "./services/authService";
import { calendarService } from "./services/calendarService";
import { type BookingDetails } from "./types";
import { RollingCalendar } from "./components/RollingCalendar";
import { BookingList } from "./components/BookingList";
import { BookingForm } from "./components/BookingForm";
import { LogOut, Sun, Moon, ChevronLeft } from "lucide-react";

// Mobile screen stack type
type MobileScreen = "calendar" | "bookings" | "form";

export function App() {
  const [user, setUser] = useState<LoggedInUser | null>(null);
  const [isDarkMode, setIsDarkMode] = useState(() => {
    const saved = localStorage.getItem("theme_mode");
    return saved === null ? true : saved === "dark";
  });

  useEffect(() => {
    localStorage.setItem("theme_mode", isDarkMode ? "dark" : "light");
  }, [isDarkMode]);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authError, setAuthError] = useState("");
  const [loadingUser, setLoadingUser] = useState(true);

  // Calendar Selection State
  const [selectedDate, setSelectedDate] = useState<{ date: number; month: number; year: number } | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<{ month: number; year: number } | null>(null);
  
  // Bookings Database state
  const [bookings, setBookings] = useState<BookingDetails[]>([]);
  const [loadingBookings, setLoadingBookings] = useState(false);

  // Form Modals State
  const [bookingToEdit, setBookingToEdit] = useState<BookingDetails | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);

  // Trigger to signal calendar views to refresh their cache/booking dots
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const forceNextFetchRef = useRef(false);

  // Mobile navigation state
  const [mobileScreen, setMobileScreen] = useState<MobileScreen>("calendar");
  const [isMobile, setIsMobile] = useState(false);

  // Detect mobile viewport
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 1024); // lg breakpoint
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // Mobile navigation with browser history support
  const navigateTo = useCallback((screen: MobileScreen) => {
    if (isMobile) {
      window.history.pushState({ screen }, "", undefined);
    }
    setMobileScreen(screen);
  }, [isMobile]);

  const navigateBack = useCallback(() => {
    if (mobileScreen === "form") {
      setMobileScreen("bookings");
      setIsFormOpen(false);
    } else if (mobileScreen === "bookings") {
      setMobileScreen("calendar");
    }
  }, [mobileScreen]);

  // Handle browser back button on mobile
  useEffect(() => {
    const handlePopState = (_: PopStateEvent) => {
      if (!isMobile) return;
      
      if (isFormOpen) {
        setIsFormOpen(false);
        setMobileScreen("bookings");
      } else if (mobileScreen === "bookings") {
        setMobileScreen("calendar");
      }
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [isMobile, mobileScreen, isFormOpen]);

  // Initialize Auth state
  useEffect(() => {
    // Inject GIS client script dynamically if not present
    if (!document.getElementById("google-gis-script")) {
      const script = document.createElement("script");
      script.id = "google-gis-script";
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.defer = true;
      document.body.appendChild(script);
    }

    const checkAuth = () => {
      if (authService.isLoggedIn()) {
        setUser(authService.getLoggedInUser());
        setIsAuthenticated(true);
        
        // Auto select current month
        const today = new Date();
        const initialMonth = { month: today.getMonth() + 1, year: today.getFullYear() };
        setSelectedMonth(initialMonth);
        setSelectedDate(null);
      }
      setLoadingUser(false);
    };

    checkAuth();
  }, []);

  // Fetch Bookings when month/year changes or on manual refresh
  const fetchBookings = async (forceRefresh = false) => {
    if (!selectedMonth) return;
    setLoadingBookings(true);
    console.log(`[App] Fetching bookings for month: ${selectedMonth.month}, year: ${selectedMonth.year}, forceRefresh: ${forceRefresh}`);
    try {
      const data = await calendarService.getBookingsForMonth(selectedMonth.month, selectedMonth.year, forceRefresh);
      console.log(`[App] Retained bookings list size: ${data.length}`, data);
      setBookings(data);
    } catch (e) {
      console.error("[App] Failed to load calendar bookings", e);
    } finally {
      setLoadingBookings(false);
    }
  };

  useEffect(() => {
    const force = forceNextFetchRef.current;
    forceNextFetchRef.current = false;
    fetchBookings(force);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMonth]);

  const handleLogin = async () => {
    setAuthError("");
    try {
      await authService.requestToken();
      setUser(authService.getLoggedInUser());
      setIsAuthenticated(true);
      
      const today = new Date();
      setSelectedMonth({ month: today.getMonth() + 1, year: today.getFullYear() });
      setSelectedDate(null);
    } catch (err: any) {
      setAuthError(err.message || "Failed to authorize with Google");
    }
  };

  const handleLogout = () => {
    authService.logout();
    setIsAuthenticated(false);
    setUser(null);
    setBookings([]);
    setMobileScreen("calendar");
  };

  const handleDateSelect = (date: number, month: number, year: number) => {
    setSelectedDate({ date, month, year });
    // Update month if selection wraps into a different month
    if (selectedMonth?.month !== month || selectedMonth?.year !== year) {
      forceNextFetchRef.current = true;
      setSelectedMonth({ month, year });
    } else {
      fetchBookings(true);
    }
    // On mobile, navigate to bookings screen
    if (isMobile) {
      navigateTo("bookings");
    }
  };

  const handleMonthSelect = (month: number, year: number) => {
    setSelectedMonth({ month, year });
    setSelectedDate(null); // Show all bookings in month
    // On mobile, navigate to bookings screen
    if (isMobile) {
      navigateTo("bookings");
    }
  };

  const handleFormOpenForCreate = () => {
    setBookingToEdit(null);
    setIsFormOpen(true);
    if (isMobile) {
      navigateTo("form");
    }
  };

  const handleFormOpenForEdit = (booking: BookingDetails) => {
    setBookingToEdit(booking);
    setIsFormOpen(true);
    if (isMobile) {
      navigateTo("form");
    }
  };

  const handleFormClose = () => {
    setIsFormOpen(false);
    if (isMobile) {
      setMobileScreen("bookings");
    }
  };

  const handleFormSuccess = () => {
    setIsFormOpen(false);
    fetchBookings(true);
    setRefreshTrigger(prev => prev + 1);
    if (isMobile) {
      setMobileScreen("bookings");
    }
  };

  // Get active theme class
  const getThemeClass = () => {
    const modeClass = isDarkMode ? "theme-dark text-white" : "theme-light text-black";
    return `theme-ios ${isDarkMode ? "bg-[#000000]" : "bg-[#f2f2f7]"} ${modeClass}`;
  };

  // Mobile header for secondary screens (bookings, form)
  const MobileBackHeader = ({ title, rightAction }: { title: string; rightAction?: React.ReactNode }) => (
    <div className={`px-3 py-2.5 flex items-center justify-between border-b shrink-0 ${
      isDarkMode ? "border-[#1f2028] bg-[#12131a]" : "border-gray-200 bg-white/80 backdrop-blur-xl"
    }`}>
      <button
        onClick={() => {
          if (window.history.state?.screen) {
            window.history.back();
          } else {
            navigateBack();
          }
        }}
        className={`flex items-center space-x-1 text-xs font-medium transition active:opacity-60 ${
          isDarkMode ? "text-purple-400" : "text-purple-600"
        }`}
      >
        <ChevronLeft className="w-5 h-5" />
        <span>Back</span>
      </button>
      <span className={`text-xs font-semibold absolute left-1/2 -translate-x-1/2 ${
        isDarkMode ? "text-white" : "text-gray-900"
      }`}>{title}</span>
      <div className="min-w-[60px] flex justify-end">{rightAction}</div>
    </div>
  );

  if (loadingUser) {
    return (
      <div className="min-h-screen bg-[#0f1014] flex items-center justify-center text-white">
        <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  // RENDER LOGIN SCREEN IF NOT AUTHENTICATED
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-[#090a0f] flex flex-col items-center justify-center p-6 text-white font-sans">
        <div className="w-full max-w-md bg-[#12131a] rounded-3xl border border-[#1f2028] p-8 flex flex-col space-y-6 shadow-2xl relative overflow-hidden">
          {/* Subtle design element */}
          <div className="absolute -top-24 -left-24 w-48 h-48 bg-purple-600/10 rounded-full blur-3xl pointer-events-none"></div>
          
          <div className="text-center flex flex-col items-center space-y-3">
            <div className="w-16 h-16 rounded-2xl overflow-hidden flex items-center justify-center border border-purple-500/20 mb-2 bg-black">
              <img src="/scheduler/logo2024.jpg" alt="Logo" className="w-full h-full object-cover" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-white m-0">Vasantshrushti Farm</h1>
            <p className="text-xs text-[#9ca3af] leading-relaxed max-w-xs">
              Secure internal scheduling portal for booking coordinators and agents.
            </p>
          </div>

          {authError && (
            <div className="bg-rose-950/40 border border-rose-500/20 text-rose-300 text-xs p-3.5 rounded-xl leading-relaxed">
              {authError}
            </div>
          )}

          <button
            onClick={handleLogin}
            className="w-full py-3 px-4 rounded-xl bg-white hover:bg-gray-100 text-black font-semibold text-xs transition flex items-center justify-center space-x-2.5 shadow-lg"
          >
            {/* Google Logo SVG */}
            <svg className="w-4 h-4" viewBox="0 0 24 24">
              <path
                fill="#EA4335"
                d="M5.266 9.765A7.077 7.077 0 0 1 12 4.909c1.69 0 3.218.6 4.418 1.582L19.91 3C17.782 1.145 15.055 0 12 0 7.339 0 3.38 2.682 1.4 6.59l3.866 3.175z"
              />
              <path
                fill="#4285F4"
                d="M23.518 12.273c0-.818-.073-1.609-.209-2.373H12v4.5h6.464a5.53 5.53 0 0 1-2.4 3.627l3.727 2.89c2.182-2.009 3.727-4.964 3.727-8.644z"
              />
              <path
                fill="#FBBC05"
                d="M5.266 14.235A7.098 7.098 0 0 1 4.909 12c0-.79.136-1.545.357-2.235L1.4 6.59A11.909 11.909 0 0 0 0 12c0 1.927.455 3.755 1.4 5.41l3.866-3.175z"
              />
              <path
                fill="#34A853"
                d="M12 24c3.245 0 5.973-1.073 7.964-2.91l-3.727-2.89c-1.036.691-2.355 1.109-4.237 1.109-3.218 0-5.945-2.173-6.918-5.1l-3.866 3.175c2 3.918 5.964 6.616 10.782 6.616z"
              />
            </svg>
            <span>Sign In with Google</span>
          </button>

          <div className="text-center pt-2 text-3xs text-[#4b5563]">
            Version 2.0 (PWA) • Developed by Aditya Mhatre
          </div>
        </div>
      </div>
    );
  }

  // MAIN SCHEDULER VIEW (AUTHENTICATED)
  return (
    <div className={`h-screen h-svh flex flex-col font-sans overflow-hidden relative ${getThemeClass()}`}>
      {/* Decorative glassmorphic background blurs */}
      <div className="absolute top-[15%] left-[10%] w-72 h-72 bg-purple-500/10 rounded-full blur-[100px] pointer-events-none z-0"></div>
      <div className="absolute bottom-[20%] right-[10%] w-80 h-80 bg-purple-600/8 rounded-full blur-[120px] pointer-events-none z-0"></div>
      
      {/* Top Banner Navigation — visible on desktop, and on mobile only for calendar screen */}
      {(!isMobile || mobileScreen === "calendar") && (
        <header className="px-4 py-3 border-b border-[#1f2028] bg-[#12131a] flex justify-between items-center shrink-0 safe-padding-top z-10">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-lg border border-purple-500/30 overflow-hidden flex items-center justify-center bg-black">
              <img src="/scheduler/logo2024.jpg" alt="Logo" className="w-full h-full object-cover" />
            </div>
            <div>
              <span className="font-bold text-sm tracking-wide text-white block">Vasantshrushti Farm</span>
              <span className="text-[10px] text-[#9ca3af] block">Booking Coordinator Portal</span>
            </div>
          </div>

          {/* Center: Theme Preview / Switcher */}
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setIsDarkMode(prev => !prev)}
              className={`p-1.5 rounded-xl border transition flex items-center justify-center ${
                isDarkMode 
                  ? "bg-[#0f1014] border-[#1f2028] hover:border-[#2e303a] text-[#9ca3af] hover:text-white" 
                  : "bg-white border-gray-200 hover:bg-gray-50 text-gray-600 hover:text-gray-900 shadow-sm"
              }`}
              title={isDarkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
            >
              {isDarkMode ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-indigo-500" />}
            </button>
          </div>

          {/* User Card & Logout */}
          <div className="flex items-center space-x-3">
            {user?.picture && (
              <img src={user.picture} alt="Profile" className="w-7 h-7 rounded-full border border-purple-500/20" />
            )}
            <div className="hidden md:block text-right">
              <div className="text-2xs font-semibold text-white">{user?.name}</div>
              <div className="text-3xs text-[#9ca3af]">{user?.role}</div>
            </div>
            <button
              onClick={handleLogout}
              className="p-1.5 rounded-lg bg-rose-950/20 border border-rose-500/20 text-rose-400 hover:bg-rose-950/30 transition"
              title="Sign Out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </header>
      )}

      {/* ===== DESKTOP: Split View (lg+) ===== */}
      {!isMobile && (
        <main className="flex-1 flex flex-row overflow-hidden z-10">
          {/* Left Side: Calendar Component */}
          <section className="w-[420px] border-r border-[#1f2028] flex-none overflow-hidden h-full">
            <RollingCalendar
              onDateSelect={handleDateSelect}
              onMonthSelect={handleMonthSelect}
              selectedDate={selectedDate}
              selectedMonth={selectedMonth}
              refreshTrigger={refreshTrigger}
            />
          </section>

          {/* Right Side: Bookings Listing Pane */}
          <section className="flex-1 flex flex-col overflow-hidden bg-[#0a0b0f] relative">
            <BookingList
              bookings={bookings}
              loading={loadingBookings}
              selectedDate={selectedDate}
              selectedMonth={selectedMonth}
              onEdit={handleFormOpenForEdit}
              onDeleteSuccess={() => {
                fetchBookings(true);
                setRefreshTrigger(prev => prev + 1);
              }}
              onCreateNew={handleFormOpenForCreate}
              onRefresh={() => {
                fetchBookings(true);
                setRefreshTrigger(prev => prev + 1);
              }}
            />
          </section>
        </main>
      )}

      {/* ===== MOBILE: Stack Navigation (<lg) ===== */}
      {isMobile && (
        <main className="flex-1 flex flex-col overflow-hidden z-10 relative">
          {/* Screen: Calendar (base screen) */}
          <div className={`absolute inset-0 flex flex-col transition-transform duration-300 ease-in-out ${
            mobileScreen === "calendar" ? "translate-x-0" : "-translate-x-full"
          }`}>
            <section className="flex-1 overflow-hidden">
              <RollingCalendar
                onDateSelect={handleDateSelect}
                onMonthSelect={handleMonthSelect}
                selectedDate={selectedDate}
                selectedMonth={selectedMonth}
                refreshTrigger={refreshTrigger}
              />
            </section>
          </div>

          {/* Screen: Bookings List */}
          <div className={`absolute inset-0 flex flex-col transition-transform duration-300 ease-in-out ${
            mobileScreen === "bookings" ? "translate-x-0" : mobileScreen === "form" ? "-translate-x-full" : "translate-x-full"
          }`}>
            <MobileBackHeader
              title={selectedDate
                ? `${selectedDate.date} ${new Date(selectedDate.year, selectedDate.month - 1).toLocaleString("default", { month: "short" })} ${selectedDate.year}`
                : selectedMonth
                  ? `${new Date(selectedMonth.year, selectedMonth.month - 1).toLocaleString("default", { month: "long" })} ${selectedMonth.year}`
                  : "Bookings"
              }
              rightAction={
                <button
                  onClick={handleFormOpenForCreate}
                  className="text-[11px] font-semibold text-purple-400 active:opacity-60"
                >
                  + New
                </button>
              }
            />
            <section className="flex-1 flex flex-col overflow-hidden bg-[#0a0b0f] relative">
              <BookingList
                bookings={bookings}
                loading={loadingBookings}
                selectedDate={selectedDate}
                selectedMonth={selectedMonth}
                onEdit={handleFormOpenForEdit}
                onDeleteSuccess={() => {
                  fetchBookings(true);
                  setRefreshTrigger(prev => prev + 1);
                }}
                onCreateNew={handleFormOpenForCreate}
                onRefresh={() => {
                  fetchBookings(true);
                  setRefreshTrigger(prev => prev + 1);
                }}
              />
            </section>
          </div>

          {/* Screen: Booking Form */}
          <div className={`absolute inset-0 flex flex-col transition-transform duration-300 ease-in-out ${
            mobileScreen === "form" ? "translate-x-0" : "translate-x-full"
          }`}>
            <MobileBackHeader
              title={bookingToEdit ? "Edit Booking" : "New Booking"}
            />
            <section className="flex-1 overflow-hidden">
              {isFormOpen && (
                <BookingForm
                  bookingToEdit={bookingToEdit}
                  initialDate={selectedDate}
                  onClose={handleFormClose}
                  onSuccess={handleFormSuccess}
                  isMobileFullScreen={true}
                />
              )}
            </section>
          </div>
        </main>
      )}

      {/* Drawer Panel Booking form — Desktop only */}
      {!isMobile && isFormOpen && (
        <BookingForm
          bookingToEdit={bookingToEdit}
          initialDate={selectedDate}
          onClose={handleFormClose}
          onSuccess={handleFormSuccess}
        />
      )}
    </div>
  );
}
export default App;
