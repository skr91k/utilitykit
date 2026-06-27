import { useState, useEffect, useRef, useCallback } from 'react';
import {
  createChart,
  CandlestickSeries,
  HistogramSeries,
  ColorType,
  CrosshairMode,
  LineStyle,
  type IChartApi,
  type UTCTimestamp,
  type ISeriesApi,
  type IPriceLine,
} from 'lightweight-charts';

interface IndexCfg { stock_code: string; exchange: string }

const INDEX_CFG: Record<string, IndexCfg> = {
  NIFTY:      { stock_code: 'NIFTY',  exchange: 'NSE' },
  BANKNIFTY:  { stock_code: 'CNXBAN', exchange: 'NSE' },
  FINNIFTY:   { stock_code: 'NIFFIN', exchange: 'NSE' },
  MIDCPNIFTY: { stock_code: 'NIFSEL', exchange: 'NSE' },
  NIFTYNXT50: { stock_code: 'NIFNEX', exchange: 'NSE' },
  SENSEX:     { stock_code: 'BSESEN', exchange: 'BSE' },
  BANKEX:     { stock_code: 'BANKEX', exchange: 'BSE' },
  FOCIT:      { stock_code: 'FOCIT',  exchange: 'NSE' },
  NIFTYIT:    { stock_code: 'NIFTYIT', exchange: 'NSE' },
  SENSEX50:   { stock_code: 'BSE50',  exchange: 'BSE' },
};

const INDEXES = Object.keys(INDEX_CFG);

const STRIKE_MAP: Record<string, number> = {
  NIFTY:      50,
  BANKNIFTY:  100,
  FINNIFTY:   50,
  MIDCPNIFTY: 25,
  NIFTYNXT50: 50,
  NIFTYIT:    100,
  SENSEX:     100,
  BANKEX:     100,
  SENSEX50:   100,
  FOCIT:      50,
};

const INTERVALS = [
  { label: '1D', value: '1day' },
  { label: '1m', value: '1minute' },
  { label: '1s', value: '1second' },
];

const PROXY_KEY = 'icici_proxy_base';
const API_PATH  = 'breezeapi.icicidirect.com/api/v2/historicalcharts';

interface CandleData {
  datetime: string;
  open: string | number;
  high: string | number;
  low: string | number;
  close: string | number;
  volume: string | number;
}

interface ApiResponse {
  Success?: CandleData[];
  Error?: string;
}

function parseDatetime(dt: string): number {
  return new Date(dt.replace(' ', 'T')).getTime() / 1000;
}

function buildUrl(proxyBase: string) {
  return `${proxyBase.replace(/\/+$/, '')}/${API_PATH}`;
}

export const TVChart = () => {
  const [proxyBase, setProxyBase] = useState<string>(() => localStorage.getItem(PROXY_KEY) ?? '');
  const [showModal, setShowModal]   = useState<boolean>(() => !localStorage.getItem(PROXY_KEY));
  const [urlInput, setUrlInput]     = useState<string>(() => localStorage.getItem(PROXY_KEY) ?? '');

  const [selectedIndex,    setSelectedIndex]    = useState('NIFTY');
  const [selectedInterval, setSelectedInterval] = useState('1day');
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState<string | null>(null);
  const [dataCount, setDataCount] = useState(0);
  const [tooltip,  setTooltip]  = useState<{
    x: number; y: number;
    time: string; open: number; high: number; low: number; close: number; volume: number;
  } | null>(null);

  const containerRef    = useRef<HTMLDivElement>(null);
  const chartRef        = useRef<IChartApi | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const candleSeriesRef = useRef<ISeriesApi<any> | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const volumeSeriesRef = useRef<ISeriesApi<any> | null>(null);
  const rawDataRef      = useRef<Map<number, { open: number; high: number; low: number; close: number; volume: number }>>(new Map());
  const strikeLineRefs  = useRef<IPriceLine[]>([]);

  const saveProxy = () => {
    const val = urlInput.trim();
    if (!val) return;
    localStorage.setItem(PROXY_KEY, val);
    setProxyBase(val);
    setShowModal(false);
  };

  // Chart init — once
  useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;

    const chart = createChart(el, {
      layout: {
        background: { type: ColorType.Solid, color: '#0d1117' },
        textColor: '#9ca3af',
      },
      grid: {
        vertLines: { color: '#1c2333' },
        horzLines: { color: '#1c2333' },
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: {
        borderColor: '#30363d',
        scaleMargins: { top: 0.05, bottom: 0.25 },
      },
      timeScale: {
        borderColor: '#30363d',
        timeVisible: true,
        secondsVisible: false,
      },
      handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true },
      handleScale: { mouseWheel: true, pinch: true, axisPressedMouseMove: { time: true, price: true } },
    });
    chartRef.current = chart;

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#26a69a',
      downColor: '#ef5350',
      borderVisible: false,
      wickUpColor: '#26a69a',
      wickDownColor: '#ef5350',
    });
    candleSeriesRef.current = candleSeries;

    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: 'vol_scale',
    });
    chart.priceScale('vol_scale').applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
    volumeSeriesRef.current = volumeSeries;

    chart.subscribeCrosshairMove((param) => {
      if (!param.point || !param.time) { setTooltip(null); return; }
      const d = rawDataRef.current.get(param.time as number);
      if (!d) { setTooltip(null); return; }
      setTooltip({
        x: param.point.x,
        y: param.point.y,
        time: new Date((param.time as number) * 1000).toLocaleString('en-IN', {
          day: '2-digit', month: 'short', year: 'numeric',
          hour: '2-digit', minute: '2-digit', second: '2-digit',
        }),
        ...d,
      });
    });

    const ro = new ResizeObserver(() => {
      if (chartRef.current) chartRef.current.resize(el.clientWidth, el.clientHeight, true);
    });
    ro.observe(el);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!chartRef.current) return;
    chartRef.current.applyOptions({ timeScale: { secondsVisible: selectedInterval === '1second' } });
  }, [selectedInterval]);

  const fetchData = useCallback(async () => {
    if (!candleSeriesRef.current || !volumeSeriesRef.current || !proxyBase) return;

    setLoading(true);
    setError(null);
    setTooltip(null);

    try {
      const params = new URLSearchParams({
        interval:      selectedInterval,
        from_date:     '1991-06-05T03:45:00.000Z',
        to_date:       '2030-06-05T10:00:00.000Z',
        stock_code:    INDEX_CFG[selectedIndex]?.stock_code ?? selectedIndex,
        exchange_code: INDEX_CFG[selectedIndex]?.exchange   ?? 'NSE',
      });

      const res = await fetch(`${buildUrl(proxyBase)}?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const json: ApiResponse = await res.json();
      if (json.Error) throw new Error(json.Error);

      const raw = json.Success ?? [];
      const seen = new Set<number>();
      const dataMap = new Map<number, { open: number; high: number; low: number; close: number; volume: number }>();

      const candles = raw
        .map(d => {
          const t = Math.floor(parseDatetime(d.datetime)) as UTCTimestamp;
          const open   = parseFloat(String(d.open));
          const high   = parseFloat(String(d.high));
          const low    = parseFloat(String(d.low));
          const close  = parseFloat(String(d.close));
          const volume = parseFloat(String(d.volume)) || 0;
          return { t, open, high, low, close, volume };
        })
        .filter(d => isFinite(d.t) && isFinite(d.open))
        .sort((a, b) => a.t - b.t)
        .filter(d => {
          if (seen.has(d.t)) return false;
          seen.add(d.t);
          dataMap.set(d.t, { open: d.open, high: d.high, low: d.low, close: d.close, volume: d.volume });
          return true;
        });

      rawDataRef.current = dataMap;

      candleSeriesRef.current.setData(candles.map(d => ({
        time: d.t, open: d.open, high: d.high, low: d.low, close: d.close,
      })));

      volumeSeriesRef.current.setData(candles.map(d => ({
        time: d.t,
        value: d.volume,
        color: d.close >= d.open ? 'rgba(38,166,154,0.6)' : 'rgba(239,83,80,0.6)',
      })));

      setDataCount(candles.length);

      // Redraw strike price lines
      strikeLineRefs.current.forEach(pl => {
        try { candleSeriesRef.current?.removePriceLine(pl); } catch { /* ignore */ }
      });
      strikeLineRefs.current = [];

      if (candles.length && candleSeriesRef.current) {
        const step   = STRIKE_MAP[selectedIndex] ?? 50;
        const prices = candles.flatMap(c => [c.high, c.low]);
        const start  = Math.floor(Math.min(...prices) / step) * step;
        const end    = Math.ceil(Math.max(...prices)  / step) * step;

        for (let p = start; p <= end; p += step) {
          const pl = candleSeriesRef.current.createPriceLine({
            price: p,
            color: 'rgba(148,163,184,0.18)',
            lineWidth: 1,
            lineStyle: LineStyle.Solid,
            axisLabelVisible: true,
            title: '',
          });
          strikeLineRefs.current.push(pl);
        }
      }

      chartRef.current?.timeScale().fitContent();
      requestAnimationFrame(() => { chartRef.current?.timeScale().fitContent(); });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, [selectedIndex, selectedInterval, proxyBase]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const isUp = tooltip ? tooltip.close >= tooltip.open : null;

  return (
    <div className="flex flex-col h-screen bg-[#0d1117] text-white overflow-hidden">

      {/* Proxy URL modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center">
          <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-6 w-full max-w-md mx-4 shadow-2xl">
            <h2 className="text-white font-semibold mb-1">Configure Proxy URL</h2>
            <p className="text-gray-500 text-xs mb-4">Enter your ICICI Breeze proxy base URL. It will be saved in localStorage.</p>
            <input
              type="text"
              placeholder="https://your-server.com/proxy/path/"
              className="w-full bg-[#0d1117] border border-[#30363d] text-white rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500 mb-4"
              value={urlInput}
              onChange={e => setUrlInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && saveProxy()}
              autoFocus
            />
            <div className="flex gap-2">
              <button
                onClick={saveProxy}
                disabled={!urlInput.trim()}
                className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white rounded py-2 text-sm font-medium transition-colors"
              >
                Save
              </button>
              {proxyBase && (
                <button
                  onClick={() => setShowModal(false)}
                  className="px-4 bg-[#21262d] hover:bg-[#30363d] text-gray-300 rounded py-2 text-sm transition-colors"
                >
                  Cancel
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center gap-3 px-4 py-2 bg-[#161b22] border-b border-[#30363d] flex-shrink-0 flex-wrap">
        <a href="/" className="text-gray-400 hover:text-white transition-colors flex-shrink-0" aria-label="Back">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </a>

        <h1 className="text-sm font-semibold text-gray-300 flex-shrink-0">Index Chart</h1>
        <div className="w-px h-5 bg-[#30363d] flex-shrink-0" />

        <select
          value={selectedIndex}
          onChange={e => setSelectedIndex(e.target.value)}
          className="bg-[#21262d] border border-[#30363d] text-white rounded px-2 py-1 text-sm focus:outline-none focus:border-blue-500 cursor-pointer"
        >
          {INDEXES.map(idx => <option key={idx} value={idx}>{idx}</option>)}
        </select>

        <span className="text-xs text-gray-500 bg-[#21262d] px-2 py-1 rounded flex-shrink-0">
          {INDEX_CFG[selectedIndex]?.exchange ?? 'NSE'} · {INDEX_CFG[selectedIndex]?.stock_code ?? selectedIndex}
        </span>

        <div className="w-px h-5 bg-[#30363d] flex-shrink-0" />

        <div className="flex gap-1 flex-shrink-0">
          {INTERVALS.map(iv => (
            <button
              key={iv.value}
              onClick={() => setSelectedInterval(iv.value)}
              className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                selectedInterval === iv.value
                  ? 'bg-blue-600 text-white'
                  : 'bg-[#21262d] text-gray-400 hover:text-white hover:bg-[#30363d]'
              }`}
            >
              {iv.label}
            </button>
          ))}
        </div>

        <button
          onClick={fetchData}
          disabled={loading || !proxyBase}
          className="px-2 py-1 rounded text-xs text-gray-400 hover:text-white hover:bg-[#30363d] transition-colors disabled:opacity-40 flex-shrink-0"
          title="Refresh"
        >
          ↻
        </button>

        <div className="ml-auto flex items-center gap-3 flex-shrink-0">
          {loading && <span className="text-xs text-blue-400 animate-pulse">Loading…</span>}
          {!loading && dataCount > 0 && <span className="text-xs text-gray-600">{dataCount.toLocaleString()} candles</span>}
          {error && <span className="text-xs text-red-400 max-w-[200px] truncate" title={error}>{error}</span>}

          {/* Edit proxy URL icon */}
          {proxyBase && (
            <button
              onClick={() => { setUrlInput(proxyBase); setShowModal(true); }}
              className="text-gray-600 hover:text-gray-300 transition-colors flex-shrink-0"
              title="Edit proxy URL"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536M9 13l6.586-6.586a2 2 0 012.828 2.828L11.828 15.828a2 2 0 01-1.414.586H9v-2a2 2 0 01.586-1.414z" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* OHLCV bar on hover */}
      {tooltip && (
        <div className="flex items-center gap-4 px-4 py-1 bg-[#161b22] border-b border-[#30363d] text-xs flex-shrink-0 flex-wrap">
          <span className="text-gray-500">{tooltip.time}</span>
          <span>O <span className={isUp ? 'text-[#26a69a]' : 'text-[#ef5350]'}>{tooltip.open.toFixed(2)}</span></span>
          <span>H <span className={isUp ? 'text-[#26a69a]' : 'text-[#ef5350]'}>{tooltip.high.toFixed(2)}</span></span>
          <span>L <span className={isUp ? 'text-[#26a69a]' : 'text-[#ef5350]'}>{tooltip.low.toFixed(2)}</span></span>
          <span>C <span className={isUp ? 'text-[#26a69a]' : 'text-[#ef5350]'}>{tooltip.close.toFixed(2)}</span></span>
          {tooltip.volume > 0 && <span className="text-gray-400">V {tooltip.volume.toLocaleString('en-IN')}</span>}
          {isUp !== null && (
            <span className={`font-semibold ${isUp ? 'text-[#26a69a]' : 'text-[#ef5350]'}`}>
              {isUp ? '▲' : '▼'} {Math.abs(tooltip.close - tooltip.open).toFixed(2)} ({Math.abs((tooltip.close - tooltip.open) / tooltip.open * 100).toFixed(2)}%)
            </span>
          )}
        </div>
      )}

      {/* Chart */}
      <div className="relative flex-1 min-h-0">
        <div ref={containerRef} className="w-full h-full" />
        {!loading && dataCount === 0 && !error && proxyBase && (
          <div className="absolute inset-0 flex items-center justify-center text-gray-600 pointer-events-none">No data</div>
        )}
      </div>
    </div>
  );
};
