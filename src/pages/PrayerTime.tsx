import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  calculatePrayerTimes,
  getTimezoneInfo,
  formatTime,
  getNextPrayer,
  getCurrentPrayer,
  getTimeDifference,
  PRAYER_NAMES,
  PRAYER_NAMES_ARABIC,
  CALCULATION_METHODS,
  type PrayerTimes,
  type Location,
  type CalculationMethod,
} from '../utils/prayerTime';
import { CITIES, searchCities, formatCityDisplay, type City } from '../data/cities';

type ViewMode = 'home' | 'location' | 'month';

// Storage keys
const STORAGE_KEY_LOCATION = 'prayertime_location';
const STORAGE_KEY_METHOD = 'prayertime_method';

// Default location (Makkah)
const DEFAULT_LOCATION: Location = {
  latitude: 21.4225,
  longitude: 39.8262,
  gmtOffset: 3,
  dst: 0,
};

const DEFAULT_CITY: City = {
  name: 'Makkah',
  country: 'Saudi Arabia',
  latitude: 21.4225,
  longitude: 39.8262,
};

export const PrayerTime = () => {
  const [viewMode, setViewMode] = useState<ViewMode>('home');
  const [location, setLocation] = useState<Location>(DEFAULT_LOCATION);
  const [selectedCity, setSelectedCity] = useState<City>(DEFAULT_CITY);
  const [prayerTimes, setPrayerTimes] = useState<PrayerTimes | null>(null);
  const [method, setMethod] = useState<CalculationMethod>(CALCULATION_METHODS.KARACHI_SHAFI);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [countdown, setCountdown] = useState({ hours: 0, minutes: 0, seconds: 0 });
  const [use24Hour, setUse24Hour] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<City[]>([]);
  const [monthDate, setMonthDate] = useState(new Date());
  const [monthPrayerTimes, setMonthPrayerTimes] = useState<{ date: Date; times: PrayerTimes }[]>([]);

  // Sort cities by distance from current location
  const nearbyCities = useMemo(() => {
    return [...CITIES]
      .map(city => {
        const dLat = city.latitude - location.latitude;
        const dLon = city.longitude - location.longitude;
        const distance = Math.sqrt(dLat * dLat + dLon * dLon);
        return { ...city, distance };
      })
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 100); // Show top 100 nearest cities
  }, [location.latitude, location.longitude]);

  // Find nearest city from coordinates
  const findNearestCity = useCallback((lat: number, lon: number): City | null => {
    let nearestCity: City | null = null;
    let minDistance = Infinity;

    for (const city of CITIES) {
      const dLat = city.latitude - lat;
      const dLon = city.longitude - lon;
      const distance = Math.sqrt(dLat * dLat + dLon * dLon);
      if (distance < minDistance) {
        minDistance = distance;
        nearestCity = city;
      }
    }

    return nearestCity;
  }, []);

  // Fetch location from IP
  const fetchIPLocation = useCallback(async () => {
    try {
      const response = await fetch('https://pro.ip-api.com/json?key=yjfBZPLkt6Kkl3h&fields=58335');
      const data = await response.json();

      if (data.lat && data.lon) {
        const nearestCity = findNearestCity(data.lat, data.lon);

        if (nearestCity) {
          const { gmtOffset, dst } = getTimezoneInfo();
          const newLocation: Location = {
            latitude: nearestCity.latitude,
            longitude: nearestCity.longitude,
            gmtOffset,
            dst,
          };

          // Use IP city name if available, otherwise use nearest city
          const cityToUse: City = {
            name: data.city || nearestCity.name,
            country: data.country || nearestCity.country || '',
            latitude: nearestCity.latitude,
            longitude: nearestCity.longitude,
          };

          setLocation(newLocation);
          setSelectedCity(cityToUse);
          localStorage.setItem(STORAGE_KEY_LOCATION, JSON.stringify({ location: newLocation, city: cityToUse }));
        }
      }
    } catch (error) {
      console.error('Failed to fetch IP location:', error);
    }
  }, [findNearestCity]);

  // Load saved settings or fetch IP location
  useEffect(() => {
    const savedLocation = localStorage.getItem(STORAGE_KEY_LOCATION);
    const savedMethod = localStorage.getItem(STORAGE_KEY_METHOD);

    if (savedLocation) {
      try {
        const parsed = JSON.parse(savedLocation);
        setLocation(parsed.location);
        setSelectedCity(parsed.city);
      } catch {
        // Fetch from IP if parse fails
        fetchIPLocation();
      }
    } else {
      // No saved location, fetch from IP
      fetchIPLocation();
    }

    if (savedMethod) {
      const methodKey = savedMethod as keyof typeof CALCULATION_METHODS;
      if (CALCULATION_METHODS[methodKey]) {
        setMethod(CALCULATION_METHODS[methodKey]);
      }
    }
  }, [fetchIPLocation]);

  // Calculate prayer times when location or method changes
  useEffect(() => {
    const times = calculatePrayerTimes(currentDate, location, method);
    setPrayerTimes(times);
  }, [location, method, currentDate]);

  // Update countdown every second
  useEffect(() => {
    if (!prayerTimes) return;

    const updateCountdown = () => {
      const nextPrayer = getNextPrayer(prayerTimes);
      if (nextPrayer) {
        setCountdown(getTimeDifference(nextPrayer.time));
      } else {
        // Next prayer is tomorrow's Fajr
        const tomorrow = new Date(currentDate);
        tomorrow.setDate(tomorrow.getDate() + 1);
        const tomorrowTimes = calculatePrayerTimes(tomorrow, location, method);
        setCountdown(getTimeDifference(tomorrowTimes.fajr));
      }
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);

    return () => clearInterval(interval);
  }, [prayerTimes, currentDate, location, method]);

  // Update current date at midnight
  useEffect(() => {
    const checkDateChange = () => {
      const now = new Date();
      if (now.getDate() !== currentDate.getDate()) {
        setCurrentDate(now);
      }
    };

    const interval = setInterval(checkDateChange, 60000);
    return () => clearInterval(interval);
  }, [currentDate]);

  // Handle search
  useEffect(() => {
    if (searchQuery.length >= 2) {
      setSearchResults(searchCities(searchQuery));
    } else {
      setSearchResults([]);
    }
  }, [searchQuery]);

  // Calculate month prayer times
  useEffect(() => {
    if (viewMode !== 'month') return;

    const year = monthDate.getFullYear();
    const month = monthDate.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const times: { date: Date; times: PrayerTimes }[] = [];
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month, day);
      times.push({
        date,
        times: calculatePrayerTimes(date, location, method),
      });
    }
    setMonthPrayerTimes(times);
  }, [monthDate, location, method, viewMode]);

  const handleCitySelect = useCallback((city: City) => {
    const { gmtOffset, dst } = getTimezoneInfo();
    const newLocation: Location = {
      latitude: city.latitude,
      longitude: city.longitude,
      gmtOffset,
      dst,
    };

    setLocation(newLocation);
    setSelectedCity(city);
    localStorage.setItem(STORAGE_KEY_LOCATION, JSON.stringify({ location: newLocation, city }));
    setSearchQuery('');
    setViewMode('home');
  }, []);

  const handleMethodChange = useCallback((methodKey: string) => {
    const newMethod = CALCULATION_METHODS[methodKey as keyof typeof CALCULATION_METHODS];
    if (newMethod) {
      setMethod(newMethod);
      localStorage.setItem(STORAGE_KEY_METHOD, methodKey);
    }
  }, []);

  // Get device/browser location
  const getDeviceLocation = useCallback(() => {
    if (!navigator.geolocation) {
      alert('Geolocation is not supported by your browser');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        const { gmtOffset, dst } = getTimezoneInfo();

        const newLocation: Location = {
          latitude,
          longitude,
          gmtOffset,
          dst,
        };

        const cityToUse: City = {
          name: 'Device Location',
          country: `${latitude.toFixed(4)}°, ${longitude.toFixed(4)}°`,
          latitude,
          longitude,
        };

        setLocation(newLocation);
        setSelectedCity(cityToUse);
        localStorage.setItem(STORAGE_KEY_LOCATION, JSON.stringify({ location: newLocation, city: cityToUse }));
        setViewMode('home');
      },
      (error) => {
        let message = 'Failed to get location';
        if (error.code === error.PERMISSION_DENIED) {
          message = 'Location permission denied. Please allow location access.';
        } else if (error.code === error.POSITION_UNAVAILABLE) {
          message = 'Location information unavailable.';
        } else if (error.code === error.TIMEOUT) {
          message = 'Location request timed out.';
        }
        alert(message);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  }, []);

  const formatCountdown = () => {
    const { hours, minutes, seconds } = countdown;
    const h = String(hours).padStart(2, '0');
    const m = String(minutes).padStart(2, '0');
    const s = String(seconds).padStart(2, '0');
    return `${h}:${m}:${s}`;
  };

  const getHijriDate = () => {
    const gregorian = new Date();
    const options: Intl.DateTimeFormatOptions = {
      calendar: 'islamic-umalqura',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    };
    try {
      return new Intl.DateTimeFormat('en-US-u-ca-islamic-umalqura', options).format(gregorian);
    } catch {
      return '';
    }
  };

  const changeMonth = (delta: number) => {
    const newDate = new Date(monthDate);
    newDate.setMonth(newDate.getMonth() + delta);
    setMonthDate(newDate);
  };

  const nextPrayer = prayerTimes ? getNextPrayer(prayerTimes) : null;
  const currentPrayer = prayerTimes ? getCurrentPrayer(prayerTimes) : null;
  const times = prayerTimes ? [prayerTimes.fajr, prayerTimes.sunrise, prayerTimes.zuhr, prayerTimes.asr, prayerTimes.maghrib, prayerTimes.isha] : [];

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#667eea] to-[#764ba2] dark:from-gray-900 dark:to-gray-800 py-8 px-4">
      <div className="max-w-lg mx-auto">
        {/* Header */}
        <div className="text-center mb-6">
          <h1 className="text-3xl font-bold text-white mb-2">Prayer Times</h1>
          <p className="text-white/80">
            {viewMode === 'home' && 'Daily Prayer Schedule'}
            {viewMode === 'location' && 'Select Location'}
            {viewMode === 'month' && 'Monthly Calendar'}
          </p>
        </div>

        {/* Home View */}
        {viewMode === 'home' && prayerTimes && (
          <div className="space-y-6">
            {/* Location Header */}
            <div
              className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-4 cursor-pointer hover:shadow-xl transition-shadow"
              onClick={() => setViewMode('location')}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Location</p>
                  <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                    {selectedCity.name}, {selectedCity.country}
                  </h2>
                </div>
                <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
            </div>

            {/* Date Display */}
            <div className="text-center">
              <p className="text-gray-600 dark:text-gray-300">
                {currentDate.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{getHijriDate()}</p>
            </div>

            {/* Next Prayer Countdown */}
            <div className="bg-gradient-to-br from-[#667eea] to-[#764ba2] rounded-2xl shadow-lg p-6 text-white text-center">
              <p className="text-sm opacity-80 mb-1">
                {nextPrayer ? `Next: ${nextPrayer.name}` : "Tomorrow's Fajr"}
              </p>
              <p className="text-5xl font-bold font-mono tracking-wider">{formatCountdown()}</p>
              {nextPrayer && (
                <p className="text-lg mt-2 opacity-90">
                  {formatTime(nextPrayer.time, use24Hour)}
                </p>
              )}
            </div>

            {/* Prayer Times List */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg overflow-hidden">
              {PRAYER_NAMES.map((name, index) => {
                const isNext = nextPrayer?.index === index;
                const isCurrent = currentPrayer?.index === index && !isNext;

                return (
                  <div
                    key={name}
                    className={`flex items-center justify-between p-4 border-b border-gray-100 dark:border-gray-700 last:border-b-0 ${
                      isNext ? 'bg-gradient-to-r from-[#667eea]/10 to-[#764ba2]/10' : ''
                    } ${isCurrent ? 'bg-green-50 dark:bg-green-900/20' : ''}`}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-2 h-2 rounded-full ${
                          isNext ? 'bg-[#667eea] animate-pulse' : isCurrent ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'
                        }`}
                      />
                      <div>
                        <p className="font-semibold text-gray-900 dark:text-white">{name}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">{PRAYER_NAMES_ARABIC[index]}</p>
                      </div>
                    </div>
                    <p className={`font-mono text-lg ${isNext ? 'text-[#667eea] font-bold' : 'text-gray-700 dark:text-gray-300'}`}>
                      {formatTime(times[index], use24Hour)}
                    </p>
                  </div>
                );
              })}
            </div>

            {/* Settings Row */}
            <div className="flex gap-3">
              <button
                onClick={() => setViewMode('month')}
                className="flex-1 bg-white dark:bg-gray-800 rounded-xl shadow-lg p-4 hover:shadow-xl transition-shadow text-center"
              >
                <svg className="w-6 h-6 mx-auto mb-2 text-[#667eea]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Month View</p>
              </button>

              <button
                onClick={() => setUse24Hour(!use24Hour)}
                className="flex-1 bg-white dark:bg-gray-800 rounded-xl shadow-lg p-4 hover:shadow-xl transition-shadow text-center"
              >
                <svg className="w-6 h-6 mx-auto mb-2 text-[#667eea]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  {use24Hour ? '12 Hour' : '24 Hour'}
                </p>
              </button>
            </div>

            {/* Method Selector */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-4">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                Calculation Method
              </label>
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {Object.entries(CALCULATION_METHODS).map(([key, m]) => {
                  const isSelected = method.name === m.name;
                  const ishaText = m.ishaInterval ? `${m.ishaInterval} min` : `${m.ishaAngle}°`;
                  const madhabText = m.madhhab === 1 ? 'Shafi' : 'Hanafi';

                  return (
                    <button
                      key={key}
                      onClick={() => handleMethodChange(key)}
                      className={`w-full text-left p-3 rounded-lg border transition-all ${
                        isSelected
                          ? 'border-[#667eea] bg-[#667eea]/10'
                          : 'border-gray-200 dark:border-gray-600 hover:border-[#667eea]/50'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className={`font-medium ${isSelected ? 'text-[#667eea]' : 'text-gray-900 dark:text-white'}`}>
                          {m.name}
                        </span>
                        {isSelected && (
                          <svg className="w-5 h-5 text-[#667eea]" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        )}
                      </div>
                      <div className="flex gap-4 mt-1 text-xs text-gray-500 dark:text-gray-400">
                        <span>Fajr: {m.fajrAngle}°</span>
                        <span>Isha: {ishaText}</span>
                        <span>Asr: {madhabText}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Location View */}
        {viewMode === 'location' && (
          <div className="space-y-4">
            {/* Header with Back and Location buttons */}
            <div className="flex items-center justify-between">
              <button
                onClick={() => setViewMode('home')}
                className="flex items-center gap-2 text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                Back
              </button>
              <button
                onClick={getDeviceLocation}
                className="flex items-center gap-2 bg-gradient-to-r from-[#667eea] to-[#764ba2] text-white px-4 py-2 rounded-lg hover:opacity-90 transition-opacity"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                Use My Location
              </button>
            </div>

            {/* Search Input */}
            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search for a city..."
                className="w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-xl px-4 py-3 pl-10 text-gray-900 dark:text-white focus:ring-2 focus:ring-[#667eea] focus:border-transparent"
              />
              <svg className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>

            {/* Search Results */}
            {searchResults.length > 0 && (
              <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg overflow-hidden">
                <p className="px-4 py-2 text-sm text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-700">
                  Search Results
                </p>
                {searchResults.map((city, index) => (
                  <button
                    key={`${city.name}-${city.country}-${index}`}
                    onClick={() => handleCitySelect(city)}
                    className="w-full text-left px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700 border-b border-gray-100 dark:border-gray-700 last:border-b-0 transition-colors"
                  >
                    <p className="font-medium text-gray-900 dark:text-white">{city.name}</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{city.country}</p>
                  </button>
                ))}
              </div>
            )}

            {/* Nearby Cities */}
            {searchQuery.length < 2 && (
              <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg overflow-hidden max-h-96 overflow-y-auto">
                <p className="px-4 py-2 text-sm text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-700 sticky top-0">
                  Nearby Cities
                </p>
                {nearbyCities.map((city, index) => (
                  <button
                    key={`nearby-${city.name}-${city.country}-${index}`}
                    onClick={() => handleCitySelect(city)}
                    className={`w-full text-left px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700 border-b border-gray-100 dark:border-gray-700 last:border-b-0 transition-colors ${
                      selectedCity.name === city.name && selectedCity.country === city.country ? 'bg-[#667eea]/10' : ''
                    }`}
                  >
                    <p className="font-medium text-gray-900 dark:text-white">{city.name}</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{city.country}</p>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Month View */}
        {viewMode === 'month' && (
          <div className="space-y-4">
            {/* Back Button */}
            <button
              onClick={() => setViewMode('home')}
              className="flex items-center gap-2 text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Back
            </button>

            {/* Month Navigation */}
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-4 flex items-center justify-between">
              <button
                onClick={() => changeMonth(-1)}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              >
                <svg className="w-5 h-5 text-gray-600 dark:text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">
                {monthDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
              </h2>
              <button
                onClick={() => changeMonth(1)}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              >
                <svg className="w-5 h-5 text-gray-600 dark:text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>

            {/* Prayer Times Table */}
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gradient-to-r from-[#667eea] to-[#764ba2] text-white">
                    <tr>
                      <th className="px-2 py-3 text-left font-medium">Date</th>
                      <th className="px-2 py-3 text-center font-medium">Fajr</th>
                      <th className="px-2 py-3 text-center font-medium">Sunrise</th>
                      <th className="px-2 py-3 text-center font-medium">Zuhr</th>
                      <th className="px-2 py-3 text-center font-medium">Asr</th>
                      <th className="px-2 py-3 text-center font-medium">Maghrib</th>
                      <th className="px-2 py-3 text-center font-medium">Isha</th>
                    </tr>
                  </thead>
                  <tbody>
                    {monthPrayerTimes.map(({ date, times: t }, index) => {
                      const isToday = date.toDateString() === new Date().toDateString();
                      return (
                        <tr
                          key={index}
                          className={`border-b border-gray-100 dark:border-gray-700 ${
                            isToday ? 'bg-[#667eea]/10 font-bold' : index % 2 === 0 ? 'bg-gray-50 dark:bg-gray-700/50' : ''
                          }`}
                        >
                          <td className="px-2 py-2 text-gray-900 dark:text-white whitespace-nowrap">
                            {date.getDate()} {date.toLocaleDateString('en-US', { weekday: 'short' })}
                          </td>
                          <td className="px-2 py-2 text-center text-gray-700 dark:text-gray-300 font-mono">
                            {formatTime(t.fajr, use24Hour)}
                          </td>
                          <td className="px-2 py-2 text-center text-gray-700 dark:text-gray-300 font-mono">
                            {formatTime(t.sunrise, use24Hour)}
                          </td>
                          <td className="px-2 py-2 text-center text-gray-700 dark:text-gray-300 font-mono">
                            {formatTime(t.zuhr, use24Hour)}
                          </td>
                          <td className="px-2 py-2 text-center text-gray-700 dark:text-gray-300 font-mono">
                            {formatTime(t.asr, use24Hour)}
                          </td>
                          <td className="px-2 py-2 text-center text-gray-700 dark:text-gray-300 font-mono">
                            {formatTime(t.maghrib, use24Hour)}
                          </td>
                          <td className="px-2 py-2 text-center text-gray-700 dark:text-gray-300 font-mono">
                            {formatTime(t.isha, use24Hour)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Location Info */}
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-4 text-center">
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Prayer times for <span className="font-medium text-gray-900 dark:text-white">{formatCityDisplay(selectedCity)}</span>
              </p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                Method: {method.name}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
