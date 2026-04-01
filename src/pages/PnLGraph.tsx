import { useState, useEffect } from 'react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Brush,
  ReferenceLine,
  Cell,
} from 'recharts';
import { trackIPData } from '../utils/firebase';

interface PnLGraphData {
  dateMilli: number;
  ntpl: number;
  ntplTillDate: number;
  tpl: number;
}

const GRAPH_API_URL = 'https://bhavpc-default-rtdb.asia-southeast1.firebasedatabase.app/pnlGraph.json';

export const PnLGraph = () => {
  const [graphData, setGraphData] = useState<PnLGraphData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeframe, setTimeframe] = useState<'daily' | 'weekly' | 'monthly' | 'yearly'>('daily');
  const [currentPage, setCurrentPage] = useState(0);
  const [cumulativeTimeframe, setCumulativeTimeframe] = useState<'year' | 'month' | 'all'>('all');
  const [dailyChartTimeframe, setDailyChartTimeframe] = useState<'year' | 'month' | 'all'>('all');
  const [calendarYear, setCalendarYear] = useState<number | 'last365'>(new Date().getFullYear());
  const [hoveredDay, setHoveredDay] = useState<{ date: Date; value: number | null; x: number; y: number } | null>(null);

  // Set to last page when timeframe changes or data loads
  useEffect(() => {
    if (graphData.length > 0) {
      const aggregated = aggregateDataByTimeframe(graphData, timeframe);
      const maxBars = 100;
      const totalPages = Math.ceil(aggregated.length / maxBars);
      if (totalPages > 0) {
        setCurrentPage(totalPages - 1);
      }
    }
  }, [timeframe, graphData]);

  // Set calendar year to last 365 days by default
  useEffect(() => {
    if (graphData.length > 0) {
      setCalendarYear('last365');
    }
  }, [graphData]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await fetch(GRAPH_API_URL);
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data: PnLGraphData[] = await response.json();
        setGraphData(data);
        setLoading(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load data');
        setLoading(false);
      }
    };

    fetchData();
    trackIPData('pnl_graph_page_load');
  }, []);

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString('en-IN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 2,
    }).format(value);
  };

  const formatIndianNumber = (value: number) => {
    const absValue = Math.abs(value);
    const sign = value < 0 ? '-' : '';

    if (absValue === 0) {
      return '0';
    } else if (absValue >= 10000000) {
      // Crores
      const crores = absValue / 10000000;
      return crores % 1 === 0 ? `${sign}${crores}Cr` : `${sign}${crores.toFixed(1)}Cr`;
    } else if (absValue >= 100000) {
      // Lakhs
      const lakhs = absValue / 100000;
      return lakhs % 1 === 0 ? `${sign}${lakhs}L` : `${sign}${lakhs.toFixed(1)}L`;
    } else if (absValue >= 1000) {
      // Thousands
      const thousands = absValue / 1000;
      return thousands % 1 === 0 ? `${sign}${thousands}K` : `${sign}${thousands.toFixed(1)}K`;
    } else {
      return `${sign}${Math.round(absValue)}`;
    }
  };

  const filterDataByTimeframe = (data: PnLGraphData[], timeframeFilter: 'year' | 'month' | 'all') => {
    if (timeframeFilter === 'all') {
      return data;
    }

    const now = new Date();
    const cutoffDate = new Date();

    if (timeframeFilter === 'year') {
      cutoffDate.setFullYear(now.getFullYear() - 1);
    } else if (timeframeFilter === 'month') {
      cutoffDate.setMonth(now.getMonth() - 1);
    }

    return data.filter(item => item.dateMilli >= cutoffDate.getTime());
  };

  const generateRoundTicks = (min: number, max: number): number[] => {
    const range = max - min;
    let stepSize: number;

    // Determine appropriate step size based on range
    // Align step sizes with display format to avoid duplicate labels
    if (range >= 10000000) {
      // Use 1 Crore steps
      stepSize = 10000000;
    } else if (range >= 5000000) {
      // Use 1 Lakh steps for large ranges
      stepSize = 1000000;
    } else if (range >= 1000000) {
      // Use 1 Lakh steps
      stepSize = 100000;
    } else if (range >= 100000) {
      // Use 50K steps
      stepSize = 50000;
    } else if (range >= 50000) {
      // Use 10K steps
      stepSize = 10000;
    } else {
      stepSize = 5000;
    }

    const minTick = Math.floor(min / stepSize) * stepSize;
    const maxTick = Math.ceil(max / stepSize) * stepSize;

    const ticks: number[] = [];
    for (let i = minTick; i <= maxTick; i += stepSize) {
      ticks.push(i);
    }

    // Ensure we include 0 if it's within range
    if (min < 0 && max > 0 && !ticks.includes(0)) {
      ticks.push(0);
      ticks.sort((a, b) => a - b);
    }

    return ticks;
  };

  const aggregateDataByTimeframe = (data: PnLGraphData[], timeframe: string) => {
    if (timeframe === 'daily') {
      return data;
    }

    const aggregated: { [key: string]: { dateMilli: number; ntpl: number; count: number } } = {};

    data.forEach((item) => {
      const date = new Date(item.dateMilli);
      let key: string;

      if (timeframe === 'weekly') {
        // Get week number
        const weekStart = new Date(date);
        weekStart.setDate(date.getDate() - date.getDay());
        key = weekStart.toISOString().split('T')[0];
      } else if (timeframe === 'monthly') {
        key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      } else {
        // yearly
        key = `${date.getFullYear()}`;
      }

      if (!aggregated[key]) {
        aggregated[key] = {
          dateMilli: timeframe === 'weekly' ? new Date(key).getTime() : item.dateMilli,
          ntpl: 0,
          count: 0,
        };
      }

      aggregated[key].ntpl += item.ntpl;
      aggregated[key].count += 1;
    });

    return Object.values(aggregated).map((item) => ({
      dateMilli: item.dateMilli,
      ntpl: item.ntpl,
      ntplTillDate: 0,
      tpl: 0,
    }));
  };

  const getPaginatedData = (data: PnLGraphData[]) => {
    const aggregated = aggregateDataByTimeframe(data, timeframe);
    const maxBars = 100;
    const totalPages = Math.ceil(aggregated.length / maxBars);

    // Ensure currentPage is within bounds, default to last page
    const safePage = Math.min(Math.max(0, currentPage), totalPages - 1);
    const start = safePage * maxBars;
    const end = start + maxBars;

    return {
      data: aggregated.slice(start, end),
      totalPages,
      currentPage: safePage,
    };
  };

  // Helper function to get date string in local timezone
  const getLocalDateString = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // Calendar heatmap helper functions
  const getCalendarData = (data: PnLGraphData[], yearOrMode: number | 'last365') => {
    // Create a map of dates to P&L values
    const dataMap = new Map<string, number>();
    data.forEach((item) => {
      const dateStr = getLocalDateString(new Date(item.dateMilli));
      dataMap.set(dateStr, item.ntpl);
    });

    let startDate: Date;
    let endDate: Date;

    if (yearOrMode === 'last365') {
      // Last 365 days ending today
      endDate = new Date();
      endDate.setHours(0, 0, 0, 0);
      startDate = new Date(endDate);
      startDate.setDate(endDate.getDate() - 364); // 365 days total including today
    } else {
      // Specific year
      startDate = new Date(yearOrMode, 0, 1);
      endDate = new Date(yearOrMode, 11, 31);
    }

    // Adjust start to the previous Sunday to align the calendar
    const startDay = startDate.getDay();
    const adjustedStart = new Date(startDate);
    adjustedStart.setDate(startDate.getDate() - startDay);

    // Adjust end to the next Saturday to complete the week
    const endDay = endDate.getDay();
    const adjustedEnd = new Date(endDate);
    if (endDay !== 6) {
      adjustedEnd.setDate(endDate.getDate() + (6 - endDay));
    }

    // Generate calendar grid
    const weeks: Array<Array<{ date: Date; value: number | null; dateStr: string }>> = [];
    let currentWeek: Array<{ date: Date; value: number | null; dateStr: string }> = [];
    const current = new Date(adjustedStart);

    while (current <= adjustedEnd) {
      if (currentWeek.length === 7) {
        weeks.push(currentWeek);
        currentWeek = [];
      }

      const dateStr = getLocalDateString(current);
      const value = dataMap.get(dateStr) ?? null;

      currentWeek.push({
        date: new Date(current),
        value: value,
        dateStr,
      });

      current.setDate(current.getDate() + 1);
    }

    // Push the last week if it exists
    if (currentWeek.length > 0) {
      weeks.push(currentWeek);
    }

    return weeks;
  };

  const getColorForValue = (value: number | null) => {
    if (value === null) {
      return 'bg-gray-100 dark:bg-gray-700';
    }

    const absValue = Math.abs(value);
    const isProfit = value >= 0;

    // Determine opacity based on value (you can adjust these thresholds)
    let opacity = 20;
    if (absValue > 100000) opacity = 90;
    else if (absValue > 50000) opacity = 70;
    else if (absValue > 25000) opacity = 50;
    else if (absValue > 10000) opacity = 30;
    else if (absValue > 0) opacity = 20;

    if (isProfit) {
      return `bg-green-500/${opacity}`;
    } else {
      return `bg-red-500/${opacity}`;
    }
  };

  const getAvailableYears = (data: PnLGraphData[]) => {
    const years = new Set<number>();
    data.forEach((item) => {
      years.add(new Date(item.dateMilli).getFullYear());
    });
    return Array.from(years).sort((a, b) => b - a); // Most recent first
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#667eea] to-[#764ba2] dark:from-gray-900 dark:to-gray-800 p-0 md:p-5 transition-colors duration-300">
      <div className="max-w-7xl mx-auto bg-white dark:bg-gray-800 md:rounded-2xl shadow-2xl overflow-hidden transition-colors duration-300">
        {/* Header */}
        <div className="bg-gradient-to-r from-[#667eea] to-[#764ba2] dark:from-gray-800 dark:to-gray-700 text-white p-6 md:p-8 text-center relative transition-colors duration-300">
          <a
            href="/pl"
            className="absolute top-4 left-4 md:top-8 md:left-8 text-white hover:text-gray-200 transition-colors"
            aria-label="Back to P&L Dashboard"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-8 w-8 md:h-10 md:w-10"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 19l-7-7 7-7"
              />
            </svg>
          </a>
          <h1 className="text-2xl md:text-4xl font-bold mb-2">Trading Performance Analytics</h1>
        </div>

        {/* Content */}
        <div className="p-0 md:p-8 bg-gray-50 dark:bg-gray-900 transition-colors duration-300">
          {loading && (
            <div className="text-center py-12 text-lg text-[#667eea] dark:text-blue-400">
              Loading chart data...
            </div>
          )}

          {error && (
            <div className="text-center py-12 text-lg text-red-500 dark:text-red-400">
              Error loading data: {error}
            </div>
          )}

          {!loading && !error && graphData.length > 0 && (() => {
            const filteredData = filterDataByTimeframe(graphData, cumulativeTimeframe);

            // Calculate axis domains for filtered data
            const cumulativeValues = filteredData.map((d) => d.ntplTillDate);
            const min = Math.min(...cumulativeValues);
            const max = Math.max(...cumulativeValues);
            const range = max - min;
            const offset = range * 0.1;
            const filteredYAxisDomain: [number, number] = [min - offset, max + offset];

            const dates = filteredData.map((d) => d.dateMilli);
            const minDate = Math.min(...dates);
            const maxDate = Math.max(...dates);
            const dateRange = maxDate - minDate;
            const dateOffset = dateRange * 0.05;
            const filteredXAxisDomain: [number, number] = [minDate - dateOffset, maxDate + dateOffset];

            return (
              <div className="bg-white dark:bg-gray-800 md:rounded-lg p-2 md:p-6 shadow-lg">
                <h2 className="text-xl md:text-2xl font-bold mb-4 text-gray-800 dark:text-gray-200 text-center">
                  P&L Growth Chart
                </h2>

                {/* Timeframe Selector */}
                <div className="flex flex-wrap justify-center gap-2 mb-4">
                  {(['year', 'month', 'all'] as const).map((tf) => (
                    <button
                      key={tf}
                      onClick={() => setCumulativeTimeframe(tf)}
                      className={`px-4 py-2 rounded-lg font-medium transition-colors ${cumulativeTimeframe === tf
                        ? 'bg-[#667eea] text-white'
                        : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
                        }`}
                    >
                      {tf === 'year' ? 'Last Year' : tf === 'month' ? 'Last Month' : 'All Days'}
                    </button>
                  ))}
                </div>

                <ResponsiveContainer width="100%" height={500}>
                  <LineChart
                    data={filteredData}
                    margin={{
                      top: 5,
                      right: 80,
                      left: 20,
                      bottom: 5,
                    }}
                  >
                    <CartesianGrid strokeDasharray="3 3" className="dark:opacity-30" />
                    <XAxis
                      dataKey="dateMilli"
                      domain={filteredXAxisDomain}
                      type="number"
                      scale="time"
                      tickFormatter={formatDate}
                      stroke="#888"
                      className="dark:stroke-gray-400"
                    />
                    <YAxis
                      domain={filteredYAxisDomain}
                      ticks={generateRoundTicks(filteredYAxisDomain[0], filteredYAxisDomain[1])}
                      tickFormatter={(value) => formatIndianNumber(value)}
                      stroke="#888"
                      className="dark:stroke-gray-400"
                      width={80}
                      tick={({ x, y, payload }) => {
                        const value = payload.value;
                        const color = value < 0 ? '#ef4444' : '#888';
                        return (
                          <text
                            x={x}
                            y={y}
                            dy={4}
                            textAnchor="end"
                            fill={color}
                            className="text-xs"
                          >
                            {formatIndianNumber(value)}
                          </text>
                        );
                      }}
                    />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const data = payload[0].payload as PnLGraphData;
                          return (
                            <div className="bg-white/20 dark:bg-gray-800/20 backdrop-blur-sm p-4 rounded-lg shadow-xl border border-gray-200/50 dark:border-gray-700/50">
                              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">
                                {formatDate(data.dateMilli)}
                              </p>
                              <p className="text-sm text-gray-900 dark:text-gray-100">
                                <span className="font-medium">P&L Till Date:</span>{' '}
                                <span className={data.ntplTillDate >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>
                                  {formatCurrency(data.ntplTillDate)}
                                </span>
                              </p>
                              <p className="text-sm text-gray-900 dark:text-gray-100">
                                <span className="font-medium">Daily P&L:</span>{' '}
                                <span className={data.ntpl >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>
                                  {formatCurrency(data.ntpl)}
                                </span>
                              </p>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Legend />
                    <ReferenceLine
                      y={0}
                      stroke="#ef4444"
                      strokeWidth={2}
                      strokeDasharray="5 5"
                      label={{ value: 'Break Even', position: 'right', fill: '#ef4444', fontSize: 12 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="ntplTillDate"
                      stroke="#667eea"
                      strokeWidth={2}
                      dot={{ r: 2, fill: '#667eea', strokeWidth: 0 }}
                      activeDot={{ r: 6 }}
                      name="Cumulative P&L"
                    />
                    <Brush
                      dataKey="dateMilli"
                      height={30}
                      stroke="#667eea"
                      tickFormatter={formatDate}
                    />
                  </LineChart>
                </ResponsiveContainer>

                <div className="mt-4 text-center text-sm text-gray-600 dark:text-gray-400">
                  <p>Drag the brush at the bottom to zoom into specific time periods</p>
                </div>
              </div>
            );
          })()}

          {/* GitHub-like Calendar Heatmap */}
          {!loading && !error && graphData.length > 0 && (() => {
            const availableYears = getAvailableYears(graphData);
            const calendarData = getCalendarData(graphData, calendarYear);

            // Generate month labels based on actual calendar data
            const monthLabels: Array<{ name: string; weekIndex: number }> = [];
            let lastMonth = -1;
            calendarData.forEach((week, weekIdx) => {
              const firstDay = week[0].date;
              const month = firstDay.getMonth();
              if (month !== lastMonth && weekIdx < calendarData.length - 1) {
                const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                monthLabels.push({ name: monthNames[month], weekIndex: weekIdx });
                lastMonth = month;
              }
            });

            return (
              <div className="bg-white dark:bg-gray-800 md:rounded-lg p-2 md:p-6 shadow-lg mt-6">
                <h2 className="text-xl md:text-2xl font-bold mb-4 text-gray-800 dark:text-gray-200 text-center">
                  P&L Calendar Heatmap
                </h2>

                {/* Year Selector */}
                <div className="flex flex-wrap justify-center gap-2 mb-4">
                  <button
                    onClick={() => setCalendarYear('last365')}
                    className={`px-4 py-2 rounded-lg font-medium transition-colors ${calendarYear === 'last365'
                      ? 'bg-[#667eea] text-white'
                      : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
                      }`}
                  >
                    Last Year
                  </button>
                  {availableYears.map((year) => (
                    <button
                      key={year}
                      onClick={() => setCalendarYear(year)}
                      className={`px-4 py-2 rounded-lg font-medium transition-colors ${calendarYear === year
                        ? 'bg-[#667eea] text-white'
                        : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
                        }`}
                    >
                      {year}
                    </button>
                  ))}
                </div>

                {/* Calendar Grid */}
                <div className="w-full relative">
                  <div className="w-full">
                    {/* Month Labels */}
                    <div className="mb-4 flex items-center">
                      <div style={{ width: '40px' }}></div>
                      <div className="flex-1 flex relative" style={{ height: '20px' }}>
                        {monthLabels.map((monthLabel, idx) => {
                          const totalWeeks = calendarData.length;
                          const cellWidth = `calc((100% - ${(totalWeeks - 1) * 3}px) / ${totalWeeks})`;
                          const leftPosition = `calc(${monthLabel.weekIndex} * ${cellWidth} + ${monthLabel.weekIndex * 3}px)`;

                          return (
                            <div
                              key={idx}
                              className="absolute text-xs text-gray-600 dark:text-gray-400"
                              style={{
                                left: leftPosition,
                              }}
                            >
                              {monthLabel.name}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Day Labels and Calendar */}
                    <div className="flex w-full" style={{ height: '160px' }}>
                      {/* Day of week labels */}
                      <div className="pr-2 text-xs text-gray-600 dark:text-gray-400 flex flex-col" style={{ gap: '3px' }}>
                        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, idx) => (
                          <div
                            key={idx}
                            className="flex items-center justify-center"
                            style={{
                              flex: '1 1 0',
                              minHeight: 0
                            }}
                          >
                            {day}
                          </div>
                        ))}
                      </div>

                      {/* Calendar grid */}
                      <div className="flex flex-1" style={{ gap: '3px' }}>
                        {calendarData.map((week, weekIdx) => (
                          <div key={weekIdx} className="flex flex-col flex-1" style={{ gap: '3px' }}>
                            {week.map((day, dayIdx) => {
                              const colorClass = getColorForValue(day.value);

                              return (
                                <div
                                  key={dayIdx}
                                  className={`rounded-sm ${colorClass} cursor-pointer hover:ring-2 hover:ring-gray-400 dark:hover:ring-gray-500 transition-all`}
                                  style={{
                                    aspectRatio: '1',
                                    flex: '1 1 0',
                                    minHeight: 0
                                  }}
                                  onMouseEnter={(e) => {
                                    const rect = e.currentTarget.getBoundingClientRect();
                                    setHoveredDay({
                                      date: day.date,
                                      value: day.value,
                                      x: rect.left + rect.width / 2,
                                      y: rect.top - 10,
                                    });
                                  }}
                                  onMouseLeave={() => setHoveredDay(null)}
                                  onClick={(e) => {
                                    const rect = e.currentTarget.getBoundingClientRect();
                                    setHoveredDay({
                                      date: day.date,
                                      value: day.value,
                                      x: rect.left + rect.width / 2,
                                      y: rect.top - 10,
                                    });
                                    setTimeout(() => setHoveredDay(null), 3000);
                                  }}
                                  onTouchStart={(e) => {
                                    const rect = e.currentTarget.getBoundingClientRect();
                                    setHoveredDay({
                                      date: day.date,
                                      value: day.value,
                                      x: rect.left + rect.width / 2,
                                      y: rect.top - 10,
                                    });
                                    setTimeout(() => setHoveredDay(null), 3000);
                                  }}
                                />
                              );
                            })}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Legend */}
                    <div className="flex items-center justify-center gap-6 mt-6 text-xs text-gray-600 dark:text-gray-400">
                      <div className="flex items-center gap-2">
                        <span>Loss</span>
                        <div className="flex gap-1">
                          <div className="w-3 h-3 bg-red-500/20 rounded-sm"></div>
                          <div className="w-3 h-3 bg-red-500/30 rounded-sm"></div>
                          <div className="w-3 h-3 bg-red-500/50 rounded-sm"></div>
                          <div className="w-3 h-3 bg-red-500/70 rounded-sm"></div>
                          <div className="w-3 h-3 bg-red-500/90 rounded-sm"></div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span>Profit</span>
                        <div className="flex gap-1">
                          <div className="w-3 h-3 bg-green-500/20 rounded-sm"></div>
                          <div className="w-3 h-3 bg-green-500/30 rounded-sm"></div>
                          <div className="w-3 h-3 bg-green-500/50 rounded-sm"></div>
                          <div className="w-3 h-3 bg-green-500/70 rounded-sm"></div>
                          <div className="w-3 h-3 bg-green-500/90 rounded-sm"></div>
                        </div>
                        <span>More</span>
                      </div>
                    </div>
                  </div>

                  {/* Hover Tooltip */}
                  {hoveredDay && (
                    <div
                      className="fixed z-50 pointer-events-none"
                      style={{
                        left: `${hoveredDay.x}px`,
                        top: `${hoveredDay.y}px`,
                        transform: 'translate(-50%, -100%)',
                      }}
                    >
                      <div className="bg-gray-800 dark:bg-gray-900 text-white px-4 py-3 rounded-lg shadow-2xl border border-gray-700">
                        <div className="text-sm font-semibold mb-1">
                          {hoveredDay.date.toLocaleDateString('en-IN', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric'
                          })}
                        </div>
                        <div className="text-base font-bold">
                          Daily P&L:{' '}
                          <span className={hoveredDay.value !== null && hoveredDay.value >= 0 ? 'text-green-400' : 'text-red-400'}>
                            {hoveredDay.value !== null ? formatCurrency(hoveredDay.value) : 'No data'}
                          </span>
                        </div>
                      </div>
                      <div className="absolute left-1/2 -translate-x-1/2 w-0 h-0 border-l-8 border-r-8 border-t-8 border-l-transparent border-r-transparent border-t-gray-800 dark:border-t-gray-900"></div>
                    </div>
                  )}
                </div>
              </div>
            );
          })()}

          {/* Daily P&L Chart */}
          {!loading && !error && graphData.length > 0 && (() => {
            const filteredDailyData = filterDataByTimeframe(graphData, dailyChartTimeframe);

            // Calculate axis domains for filtered data
            const dailyValues = filteredDailyData.map((d) => d.ntpl);
            const dailyMin = Math.min(...dailyValues);
            const dailyMax = Math.max(...dailyValues);
            const dailyRange = dailyMax - dailyMin;
            const dailyOffset = dailyRange * 0.1;
            const filteredDailyYAxisDomain: [number, number] = [dailyMin - dailyOffset, dailyMax + dailyOffset];

            const dates = filteredDailyData.map((d) => d.dateMilli);
            const minDate = Math.min(...dates);
            const maxDate = Math.max(...dates);
            const dateRange = maxDate - minDate;
            const dateOffset = dateRange * 0.05;
            const filteredDailyXAxisDomain: [number, number] = [minDate - dateOffset, maxDate + dateOffset];

            return (
              <div className="bg-white dark:bg-gray-800 md:rounded-lg p-2 md:p-6 shadow-lg mt-6">
                <h2 className="text-xl md:text-2xl font-bold mb-4 text-gray-800 dark:text-gray-200 text-center">
                  Daily P&L
                </h2>

                {/* Timeframe Selector */}
                <div className="flex flex-wrap justify-center gap-2 mb-4">
                  {(['year', 'month', 'all'] as const).map((tf) => (
                    <button
                      key={tf}
                      onClick={() => setDailyChartTimeframe(tf)}
                      className={`px-4 py-2 rounded-lg font-medium transition-colors ${dailyChartTimeframe === tf
                        ? 'bg-[#667eea] text-white'
                        : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
                        }`}
                    >
                      {tf === 'year' ? 'Last Year' : tf === 'month' ? 'Last Month' : 'All Days'}
                    </button>
                  ))}
                </div>

                <ResponsiveContainer width="100%" height={500}>
                  <LineChart
                    data={filteredDailyData}
                    margin={{
                      top: 5,
                      right: 80,
                      left: 20,
                      bottom: 5,
                    }}
                  >
                    <CartesianGrid strokeDasharray="3 3" className="dark:opacity-30" />
                    <XAxis
                      dataKey="dateMilli"
                      domain={filteredDailyXAxisDomain}
                      type="number"
                      scale="time"
                      tickFormatter={formatDate}
                      stroke="#888"
                      className="dark:stroke-gray-400"
                    />
                    <YAxis
                      domain={filteredDailyYAxisDomain}
                      ticks={generateRoundTicks(filteredDailyYAxisDomain[0], filteredDailyYAxisDomain[1])}
                      tickFormatter={(value) => formatIndianNumber(value)}
                      stroke="#888"
                      className="dark:stroke-gray-400"
                      width={80}
                      tick={({ x, y, payload }) => {
                        const value = payload.value;
                        const color = value < 0 ? '#ef4444' : '#888';
                        return (
                          <text
                            x={x}
                            y={y}
                            dy={4}
                            textAnchor="end"
                            fill={color}
                            className="text-xs"
                          >
                            {formatIndianNumber(value)}
                          </text>
                        );
                      }}
                    />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const data = payload[0].payload as PnLGraphData;
                          return (
                            <div className="bg-white/20 dark:bg-gray-800/20 backdrop-blur-sm p-4 rounded-lg shadow-xl border border-gray-200/50 dark:border-gray-700/50">
                              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">
                                {formatDate(data.dateMilli)}
                              </p>
                              <p className="text-sm text-gray-900 dark:text-gray-100">
                                <span className="font-medium">Daily P&L:</span>{' '}
                                <span className={data.ntpl >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>
                                  {formatCurrency(data.ntpl)}
                                </span>
                              </p>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Legend />
                    <ReferenceLine
                      y={0}
                      stroke="#ef4444"
                      strokeWidth={2}
                      strokeDasharray="5 5"
                      label={{ value: 'Break Even', position: 'right', fill: '#ef4444', fontSize: 12 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="ntpl"
                      stroke="#fbbf24"
                      strokeWidth={2}
                      dot={{ r: 2, fill: '#fbbf24', strokeWidth: 0 }}
                      activeDot={{ r: 6 }}
                      name="Daily P&L"
                    />
                    <Brush
                      dataKey="dateMilli"
                      height={30}
                      stroke="#fbbf24"
                      tickFormatter={formatDate}
                    />
                  </LineChart>
                </ResponsiveContainer>

                <div className="mt-4 text-center text-sm text-gray-600 dark:text-gray-400">
                  <p>Drag the brush at the bottom to zoom into specific time periods</p>
                </div>
              </div>
            );
          })()}

          {/* Daily P&L Bar Chart */}
          {!loading && !error && graphData.length > 0 && (() => {
            const paginatedData = getPaginatedData(graphData);
            const barData = paginatedData.data;

            // Calculate y-axis domain for paginated data
            const barValues = barData.map((d) => d.ntpl);
            const barMin = Math.min(...barValues);
            const barMax = Math.max(...barValues);
            const barRange = barMax - barMin;
            const barOffset = barRange * 0.1;
            const barYAxisDomain: [number, number] = [barMin - barOffset, barMax + barOffset];

            return (
              <div className="bg-white dark:bg-gray-800 md:rounded-lg p-2 md:p-6 shadow-lg mt-6">
                <h2 className="text-xl md:text-2xl font-bold mb-4 text-gray-800 dark:text-gray-200 text-center">
                  Daily P&L (Bar Chart)
                </h2>

                {/* Timeframe Selector */}
                <div className="flex flex-wrap justify-center gap-2 mb-4">
                  {(['daily', 'weekly', 'monthly', 'yearly'] as const).map((tf) => (
                    <button
                      key={tf}
                      onClick={() => setTimeframe(tf)}
                      className={`px-4 py-2 rounded-lg font-medium transition-colors ${timeframe === tf
                        ? 'bg-[#667eea] text-white'
                        : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
                        }`}
                    >
                      {tf.charAt(0).toUpperCase() + tf.slice(1)}
                    </button>
                  ))}
                </div>

                {/* Seek Bar */}
                {paginatedData.totalPages > 1 && (
                  <div className="mb-4 px-4">
                    <div className="flex items-center gap-4">
                      <button
                        onClick={() => setCurrentPage(Math.max(0, currentPage - 1))}
                        disabled={currentPage === 0}
                        className="px-3 py-1 rounded bg-[#667eea] text-white disabled:bg-gray-300 disabled:cursor-not-allowed"
                      >
                        ←
                      </button>
                      <div className="flex-1">
                        <input
                          type="range"
                          min="0"
                          max={paginatedData.totalPages - 1}
                          value={currentPage}
                          onChange={(e) => setCurrentPage(Number(e.target.value))}
                          className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700"
                        />
                        <div className="text-center text-sm text-gray-600 dark:text-gray-400 mt-1">
                          Page {currentPage + 1} of {paginatedData.totalPages}
                        </div>
                      </div>
                      <button
                        onClick={() => setCurrentPage(Math.min(paginatedData.totalPages - 1, currentPage + 1))}
                        disabled={currentPage === paginatedData.totalPages - 1}
                        className="px-3 py-1 rounded bg-[#667eea] text-white disabled:bg-gray-300 disabled:cursor-not-allowed"
                      >
                        →
                      </button>
                    </div>
                  </div>
                )}

                <ResponsiveContainer width="100%" height={500}>
                  <BarChart
                    data={barData}
                    margin={{
                      top: 5,
                      right: 80,
                      left: 20,
                      bottom: 5,
                    }}
                  >
                    <CartesianGrid strokeDasharray="3 3" className="dark:opacity-30" />
                    <XAxis
                      dataKey="dateMilli"
                      tickFormatter={formatDate}
                      stroke="#888"
                      className="dark:stroke-gray-400"
                      interval="preserveStartEnd"
                    />
                    <YAxis
                      domain={barYAxisDomain}
                      ticks={generateRoundTicks(barYAxisDomain[0], barYAxisDomain[1])}
                      tickFormatter={(value) => formatIndianNumber(value)}
                      stroke="#888"
                      className="dark:stroke-gray-400"
                      width={80}
                      tick={({ x, y, payload }) => {
                        const value = payload.value;
                        const color = value < 0 ? '#ef4444' : '#888';
                        return (
                          <text
                            x={x}
                            y={y}
                            dy={4}
                            textAnchor="end"
                            fill={color}
                            className="text-xs"
                          >
                            {formatIndianNumber(value)}
                          </text>
                        );
                      }}
                    />
                    <Tooltip
                      cursor={{ fill: 'rgba(255, 255, 255, 0.1)' }}
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const data = payload[0].payload as PnLGraphData;
                          return (
                            <div className="bg-white/20 dark:bg-gray-800/20 backdrop-blur-sm p-4 rounded-lg shadow-xl border border-gray-200/50 dark:border-gray-700/50">
                              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">
                                {formatDate(data.dateMilli)}
                              </p>
                              <p className="text-sm text-gray-900 dark:text-gray-100">
                                <span className="font-medium">{timeframe.charAt(0).toUpperCase() + timeframe.slice(1)} P&L:</span>{' '}
                                <span className={data.ntpl >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>
                                  {formatCurrency(data.ntpl)}
                                </span>
                              </p>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Legend />
                    <ReferenceLine
                      y={0}
                      stroke="#ef4444"
                      strokeWidth={2}
                      strokeDasharray="5 5"
                      label={{ value: 'Break Even', position: 'right', fill: '#ef4444', fontSize: 12 }}
                    />
                    <Bar
                      dataKey="ntpl"
                      name={`${timeframe.charAt(0).toUpperCase() + timeframe.slice(1)} P&L`}
                      maxBarSize={50}
                      activeBar={{ fillOpacity: 0.7, stroke: '#ffffff', strokeWidth: 2 }}
                    >
                      {barData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.ntpl >= 0 ? '#10b981' : '#ef4444'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            );
          })()}
        </div>
      </div>
    </div>
  );
};
