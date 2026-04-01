import { initializeApp } from 'firebase/app';
import { getDatabase, ref, push, set, get } from 'firebase/database';

const firebaseConfig = {
  databaseURL: "https://bhavpc-default-rtdb.asia-southeast1.firebasedatabase.app"
};

const app = initializeApp(firebaseConfig);
const database = getDatabase(app);


export const DATA_URL = 'https://bhavpc-default-rtdb.asia-southeast1.firebasedatabase.app/pnlsudokutrader.json';
export const LINKS_URL = 'https://bhavpc-default-rtdb.asia-southeast1.firebasedatabase.app/links_data.json';

export const trackIPData = async (action: string): Promise<void> => {
  try {
    const response = await fetch('https://pro.ip-api.com/json?key=yjfBZPLkt6Kkl3h&fields=58335');
    const ipData = await response.json();

    const pageID = 'page_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);

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
      admindevice: localStorage.getItem('admindevice') === 'true',
    };

    const ipRef = ref(database, '/ip_details');
    const newRef = push(ipRef);
    await set(newRef, trackingData);
    console.log('IP tracking saved:', action);
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
