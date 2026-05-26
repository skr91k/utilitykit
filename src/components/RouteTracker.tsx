import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { trackPageView } from '../utils/firebase';

const PAGE_NAMES: Record<string, string> = {
  '/': 'Home',
  '/counter': 'Counter',
  '/pl': 'P&L Dashboard',
  '/plgraph': 'P&L Graph',
  '/qr': 'QR Code Generator',
  '/encrypt': 'Encryption',
  '/epoch': 'Epoch Converter',
  '/sqlite': 'SQLite Viewer',
  '/string': 'String Converter',
  '/prayer': 'Prayer Time',
  '/workout': 'Workout Manager',
  '/contactus': 'Contact Us',
  '/support': 'Support Chat',
  '/split': 'Split Expense',
  '/cricket': 'Cricket Tracker',
};

function getPageName(pathname: string): string {
  if (PAGE_NAMES[pathname]) return PAGE_NAMES[pathname];
  // handle dynamic routes like /split/:bookId or /cricket/:token
  const base = '/' + pathname.split('/')[1];
  return PAGE_NAMES[base] ?? pathname;
}

export function RouteTracker() {
  const location = useLocation();

  useEffect(() => {
    const name = getPageName(location.pathname);
    trackPageView(location.pathname + location.search, name);
  }, [location]);

  return null;
}
