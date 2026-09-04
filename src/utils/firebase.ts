import { initializeApp } from 'firebase/app';
import { getDatabase, ref, set, get } from 'firebase/database';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged, signInAnonymously } from 'firebase/auth';
import type { User } from 'firebase/auth';
import { getAnalytics, logEvent } from 'firebase/analytics';
import { firebaseConfig } from './firebaseConfig';

const app = initializeApp(firebaseConfig);
const database = getDatabase(app);
export const analytics = getAnalytics(app);

export const trackPageView = (path: string, title?: string) => {
  logEvent(analytics, 'page_view', {
    page_path: path,
    page_title: title ?? document.title,
  });
};
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

export const signInWithGoogle = async () => {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    return result.user;
  } catch (error) {
    console.error('Google sign-in error:', error);
    throw error;
  }
};

export const logOut = async () => {
  try {
    await signOut(auth);
  } catch (error) {
    console.error('Sign-out error:', error);
    throw error;
  }
};

export const signInAnonymous = async () => {
  try {
    const result = await signInAnonymously(auth);
    return result.user;
  } catch (error) {
    console.error('Anonymous sign-in error:', error);
    throw error;
  }
};

export const onAuthChange = (callback: (user: User | null) => void) => {
  return onAuthStateChanged(auth, callback);
};

export { auth };
export type { User };


export const DATA_URL = 'https://bhavpc-default-rtdb.asia-southeast1.firebasedatabase.app/pnlsudokutrader.json';
export const LINKS_URL = 'https://bhavpc-default-rtdb.asia-southeast1.firebasedatabase.app/links_data.json';

// Visitor tracking lives in the *shared* kline-data DB, not this project's own
// bhavpc DB — every site logs hits to the one /ip_details node so any /ip dashboard
// shows all of them. Plain REST because the SDK `database` above is bound to
// bhavpc via firebaseConfig.databaseURL and carries the wrong project's auth.
export const IP_DETAILS_URL = 'https://kline-data-default-rtdb.asia-southeast1.firebasedatabase.app/ip_details.json';

const IP_API = 'https://pro.ip-api.com/json?key=yjfBZPLkt6Kkl3h&fields=58335';

// Visiting any page with ?admin=676510 marks this browser as an admin device for
// good — the flag rides along on every later /ip_details hit so the kline-data /ip
// dashboard can filter our own visits out. ?admin=0 clears it again.
// Kept byte-identical to kline-data's copy: both write the same node.
const ADMIN_CODE = '676510';
const ADMIN_KEY = 'admindevice';

// Reads the ?admin= param, updates the stored flag, and returns the current value.
// Safe to call on every page load; a missing param leaves the flag untouched.
export const syncAdminDevice = (): boolean => {
  try {
    const param = new URLSearchParams(window.location.search).get('admin');
    if (param === ADMIN_CODE) localStorage.setItem(ADMIN_KEY, 'true');
    else if (param !== null) localStorage.removeItem(ADMIN_KEY);
    return localStorage.getItem(ADMIN_KEY) === 'true';
  } catch {
    return false;   // storage disabled (private mode / blocked cookies)
  }
};

// Geo lookup is best-effort: ip-api.com sits on most ad/tracker blocklists, so a
// blocked or slow request must not cost us the hit. Returns {geoError} when unavailable.
const lookupGeo = async (): Promise<Record<string, unknown>> => {
  try {
    const r = await fetch(IP_API, { signal: AbortSignal.timeout(5000) });
    if (!r.ok) return { geoError: 'http ' + r.status };
    return await r.json();
  } catch (e) {
    // Blocked by an extension (TypeError), timed out (TimeoutError), or offline.
    return { geoError: e instanceof Error ? e.name : 'blocked' };
  }
};

export const trackIPData = async (action: string): Promise<void> => {
  try {
    // Do this first: a visit that *carries* ?admin=<code> must already be logged
    // as an admin hit, not just the visits after it.
    const admindevice = syncAdminDevice();
    const ipData = await lookupGeo();

    const pageID = 'page_' + Date.now() + '_' + Math.random().toString(36).slice(2, 11);

    const trackingData = {
      ...ipData,
      pageID,
      timestamp: Date.now(),
      userAgent: navigator.userAgent,
      action,
      referrer: document.referrer || 'direct',
      currentURL: window.location.href,
      currentPath: window.location.pathname,
      urlParams: Object.fromEntries(new URLSearchParams(window.location.search)),
      source: new URLSearchParams(window.location.search).get('ref') ||
        new URLSearchParams(window.location.search).get('utm_source') || null,
      campaign: new URLSearchParams(window.location.search).get('utm_campaign') || null,
      medium: new URLSearchParams(window.location.search).get('utm_medium') || null,
      screenWidth: window.screen.width,
      screenHeight: window.screen.height,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      language: navigator.language,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      admindevice,
    };

    // keepalive: /ip redirects away to the dashboard as soon as the flag is set,
    // and the hit must survive that navigation.
    await fetch(IP_DETAILS_URL, { method: 'POST', body: JSON.stringify(trackingData), keepalive: true });
  } catch (e) {
    console.error('Error tracking IP data:', e);
  }
};

export const trackLinkClick = async (username: string, linkId: string): Promise<void> => {
  try {
    const linkRef = ref(database, `/links_data/${username}/links`);
    const snapshot = await get(linkRef);
    const links = snapshot.val() || [];

    const updatedLinks = links.map((link: any) => {
      if (link.id === linkId) {
        return { ...link, clicks: (link.clicks || 0) + 1 };
      }
      return link;
    });

    await set(linkRef, updatedLinks);

    const totalRef = ref(database, `/links_data/${username}/metadata/totalClicks`);
    const totalSnapshot = await get(totalRef);
    const currentTotal = totalSnapshot.val() || 0;
    await set(totalRef, currentTotal + 1);
  } catch (err) {
    console.error('Failed to track click:', err);
  }
};

export const trackLinkPageView = async (username: string): Promise<void> => {
  try {
    const viewRef = ref(database, `/links_data/${username}/metadata/viewCount`);
    const snapshot = await get(viewRef);
    const currentViews = snapshot.val() || 0;
    await set(viewRef, currentViews + 1);

    const timestampRef = ref(database, `/links_data/${username}/metadata/updatedAt`);
    await set(timestampRef, Date.now());
  } catch (err) {
    console.error('Failed to track view:', err);
  }
};

export { database };
