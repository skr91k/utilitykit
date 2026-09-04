import { useEffect } from 'react';
import { syncAdminDevice } from '../utils/firebase';

// The listing itself lives on kline-data (the site that owns the /ip_details node);
// this project only needs the ?admin= entry point, so /ip stores the flag and hands
// the visitor over to that dashboard.
const DASHBOARD = 'https://kline-data.web.app/ip';

export function IPRedirect() {
  useEffect(() => {
    // Runs before the redirect so ?admin=<code> sticks even though we leave at once.
    // RouteTracker logs this visit in parallel; its POST is keepalive, so navigating
    // away does not cancel it. The delay just gives that request time to be issued.
    syncAdminDevice();
    const t = setTimeout(() => window.location.replace(DASHBOARD), 1200);
    return () => clearTimeout(t);
  }, []);

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: '-apple-system, Segoe UI, Roboto, Arial, sans-serif', color: '#667eea',
    }}>
      <p>
        Redirecting to <a href={DASHBOARD}>the IP dashboard</a>…
      </p>
    </div>
  );
}
