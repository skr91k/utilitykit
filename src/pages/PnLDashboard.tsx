import { useState, useEffect } from 'react';
import type { PnLData } from '../types';
import { DATA_URL, trackIPData } from '../utils/firebase';
import { FiscalYear } from '../components/FiscalYear';

// Helper to check if title is a valid Calendar Year (e.g., "2024", "2025")
const isCalendarYear = (title: string): boolean => {
  const year = parseInt(title, 10);
  return !isNaN(year) && year > 2000 && year <= 2100 && title === String(year);
};

// Helper to check if title is a Fiscal Year (e.g., "FY 2024-2025")
const isFiscalYear = (title: string): boolean => {
  return /^FY\s+\d{4}-\d{4}$/.test(title);
};

// Load year mode from localStorage (false = CY, true = FY)
const loadYearMode = (): boolean => {
  try {
    const stored = localStorage.getItem('pnl-year-mode');
    if (stored !== null) {
      return JSON.parse(stored);
    }
  } catch {
    // Ignore parse errors
  }
  return false; // Default: CY
};

export const PnLDashboard = () => {
  const [pnlData, setPnlData] = useState<PnLData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [useFullFormat, setUseFullFormat] = useState(false);
  const [mobileDesktopView, setMobileDesktopView] = useState(false);
  const [showFY, setShowFY] = useState(loadYearMode); // false = CY, true = FY

  // Save year mode to localStorage when it changes
  useEffect(() => {
    localStorage.setItem('pnl-year-mode', JSON.stringify(showFY));
  }, [showFY]);

  // Filter fiscal years based on selection
  const filterFiscalYears = (data: PnLData): PnLData => {
    return data.filter(fy => {
      const title = fy.title;
      // Always show non-CY/non-FY items (like "All time summary", "Swing Trade")
      if (!isCalendarYear(title) && !isFiscalYear(title)) {
        return true;
      }
      // Show CY or FY based on toggle
      if (showFY) {
        return isFiscalYear(title);
      } else {
        return isCalendarYear(title);
      }
    });
  };

  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await fetch(DATA_URL);
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        setPnlData(data);
        setLoading(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load data');
        setLoading(false);
      }
    };

    fetchData();
    trackIPData('page_load');
  }, []);

  // Update viewport meta tag when desktop view is toggled on mobile
  useEffect(() => {
    const viewport = document.querySelector('meta[name="viewport"]');
    if (viewport) {
      if (mobileDesktopView) {
        // Enable desktop site mode: allow zooming and set wider viewport
        viewport.setAttribute('content', 'width=1200, initial-scale=0.4, maximum-scale=5.0, user-scalable=yes');
      } else {
        // Restore mobile viewport
        viewport.setAttribute('content', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no');
      }
    }
  }, [mobileDesktopView]);



  return (
    <div className="min-h-screen bg-gradient-to-br from-[#667eea] to-[#764ba2] dark:from-gray-900 dark:to-gray-800 p-0 md:p-5 transition-colors duration-300">
      <div className={`${mobileDesktopView ? 'min-w-[1200px]' : 'max-w-7xl'} mx-auto bg-white dark:bg-gray-800 md:rounded-2xl shadow-2xl overflow-hidden transition-colors duration-300`}>
        {/* Header */}
        <div className="bg-gradient-to-r from-[#667eea] to-[#764ba2] dark:from-gray-800 dark:to-gray-700 text-white p-6 md:p-8 text-center relative transition-colors duration-300">
          <div className={`absolute top-4 right-4 md:top-8 md:right-8 ${mobileDesktopView ? 'flex' : 'hidden md:flex'} flex-col items-end gap-2`}>
            {/* Currency Toggle */}
            <div className="flex items-center gap-3 text-sm">
              <label htmlFor="currencyFormat" className="cursor-pointer select-none hidden md:block">
                Short Format
              </label>
              <label htmlFor="currencyFormat" className="relative inline-block w-[50px] h-6 cursor-pointer">
                <input
                  type="checkbox"
                  id="currencyFormat"
                  checked={useFullFormat}
                  onChange={(e) => setUseFullFormat(e.target.checked)}
                  className="opacity-0 w-0 h-0"
                />
                <span className="toggle-slider" />
              </label>
              <label htmlFor="currencyFormat" className="cursor-pointer select-none hidden md:block">
                Full Amount
              </label>
            </div>
            {/* CY/FY Toggle */}
            <div className="flex items-center gap-3 text-sm">
              <label htmlFor="yearMode" className="cursor-pointer select-none">
                CY
              </label>
              <label htmlFor="yearMode" className="relative inline-block w-[50px] h-6 cursor-pointer">
                <input
                  type="checkbox"
                  id="yearMode"
                  checked={showFY}
                  onChange={(e) => setShowFY(e.target.checked)}
                  className="opacity-0 w-0 h-0"
                />
                <span className="toggle-slider" />
              </label>
              <label htmlFor="yearMode" className="cursor-pointer select-none">
                FY
              </label>
            </div>
          </div>

          <h1 className="text-2xl md:text-4xl font-bold mb-2">Profit & Loss Statement</h1>

          {/* Chart Icon */}
          <a
            href="/plgraph"
            className="inline-flex items-center gap-2 text-white hover:text-gray-200 transition-colors bg-white/10 hover:bg-white/20 px-4 py-2 rounded-lg"
            aria-label="View P&L Growth Chart"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-5 w-5 md:h-6 md:w-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z"
              />
            </svg>
            <span className="text-sm md:text-base font-medium">P&L Growth Chart</span>
          </a>
        </div>

        {/* Content */}
        <div className="p-0 md:p-5 bg-gray-50 dark:bg-gray-900 transition-colors duration-300">
          {loading && (
            <div className="text-center py-12 text-lg text-[#667eea] dark:text-blue-400">
              Loading P&L data...
            </div>
          )}

          {error && (
            <div className="text-center py-12 text-lg text-red-500 dark:text-red-400">
              Error loading data: {error}
            </div>
          )}

          {pnlData && (
            <>
              {filterFiscalYears(pnlData).map((fy, index) => (
                <FiscalYear key={index} fiscalYear={fy} useFullFormat={useFullFormat} mobileDesktopView={mobileDesktopView} />
              ))}
            </>
          )}
        </div>
      </div>

      {/* Mobile Desktop View Toggle Button */}
      <button
        onClick={() => setMobileDesktopView(!mobileDesktopView)}
        className="md:hidden fixed bottom-6 right-6 bg-[#667eea] hover:bg-[#5568d3] text-white p-3 rounded-full shadow-2xl transition-all hover:scale-110 z-50"
        aria-label="Toggle Desktop View"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-5 w-5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          {mobileDesktopView ? (
            // Mobile icon - shows when in desktop view, click to return to mobile
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
          ) : (
            // Desktop icon - shows when in mobile view, click to switch to desktop
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          )}
        </svg>
      </button>
    </div>
  );
};
