import { useState, useEffect, useRef, useCallback } from 'react';
import { loadExpiries, formatExpiry, expiryToApiDate, type ProductType, type ExpiryMap } from '../utils/expiry';
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
  FOCIT:      { stock_code: 'BSEFOC',  exchange: 'BSE' },
  NIFTYIT:    { stock_code: 'CNXIT', exchange: 'NSE' },
  SENSEX50:   { stock_code: 'BSES50',  exchange: 'BSE' },
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

// Fallback LTP (approx. levels, mid-2026) used to centre option strikes when
// the user has not clicked a price on the index chart.
const INDEX_LTP: Record<string, number> = {
  NIFTY:      24000,
  BANKNIFTY:  56800,
  FINNIFTY:   27000,
  MIDCPNIFTY: 13500,
  NIFTYNXT50: 68000,
  NIFTYIT:    40000,
  SENSEX:     78500,
  BANKEX:     64000,
  SENSEX50:   25000,
  FOCIT:      12000,
};

// Number of strikes listed above and below the ATM strike
const STRIKE_WINGS = 20;

const INTERVALS = [
  { label: '1D', value: '1day' },
  { label: '1m', value: '1minute' },
  { label: '1s', value: '1second' },
];

const PRODUCTS: { label: string; value: ProductType }[] = [
  { label: 'Index',   value: 'index' },
  { label: 'Futures', value: 'futures' },
  { label: 'Options', value: 'options' },
];

// Cash exchange -> derivatives exchange
const DERIV_EXCHANGE: Record<string, string> = { NSE: 'NFO', BSE: 'BFO' };

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
  // ICICI datetimes are IST wall-clock with no tz. lightweight-charts always
  // renders in UTC, so parse the wall-clock as UTC to display IST verbatim.
  const s = dt.replace(' ', 'T');
  return new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : s + 'Z').getTime() / 1000;
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
  const [toDate,           setToDate]           = useState(() => new Date().toISOString().slice(0, 10));
  const [productType,      setProductType]      = useState<ProductType>('index');
  const [selectedExpiry,   setSelectedExpiry]   = useState('');
  const [strike,           setStrike]           = useState('');
  const [right,            setRight]            = useState<'call' | 'put'>('call');
  const [expiryMap,        setExpiryMap]        = useState<ExpiryMap>({});
  const [clickedPrice,     setClickedPrice]     = useState<number | null>(null);

  // Latest productType for the (once-bound) chart click handler
  const productTypeRef = useRef(productType);
  productTypeRef.current = productType;
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

    // Click on the index/futures chart -> remember the price to centre option strikes
    chart.subscribeClick((param) => {
      if (productTypeRef.current === 'options' || !param.point || !candleSeriesRef.current) return;
      const price = candleSeriesRef.current.coordinateToPrice(param.point.y);
      if (price != null && isFinite(price as number)) setClickedPrice(price as number);
    });

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
          timeZone: 'UTC',
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

  // Load expiry dates when switching to a derivative product
  useEffect(() => {
    if (productType === 'index') return;
    let cancelled = false;
    loadExpiries(productType)
      .then(map => { if (!cancelled) setExpiryMap(map); })
      .catch(() => { if (!cancelled) setExpiryMap({}); });
    return () => { cancelled = true; };
  }, [productType]);

  // Expiries for the current index (futures/options)
  const expiries = productType === 'index' ? [] : (expiryMap[selectedIndex] ?? []);

  // Default the expiry selection to the nearest upcoming (or latest) expiry
  useEffect(() => {
    if (productType === 'index' || expiries.length === 0) return;
    if (expiries.includes(selectedExpiry)) return;
    const today = new Date().toISOString().slice(2, 10).replace(/-/g, '');
    setSelectedExpiry(expiries.find(e => e >= today) ?? expiries[expiries.length - 1]);
  }, [productType, expiries, selectedExpiry]);

  // Clicking a price is only meaningful for the index it was clicked on
  useEffect(() => { setClickedPrice(null); }, [selectedIndex]);

  // ATM strike from the clicked price (or hardcoded LTP fallback) + strike ladder
  const strikeStep = STRIKE_MAP[selectedIndex] ?? 50;
  const refPrice   = clickedPrice ?? INDEX_LTP[selectedIndex] ?? 0;
  const atmStrike  = Math.round(refPrice / strikeStep) * strikeStep;
  const strikeList = Array.from({ length: STRIKE_WINGS * 2 + 1 },
    (_, i) => atmStrike + (i - STRIKE_WINGS) * strikeStep).filter(s => s > 0);

  // Default the strike to ATM (CE) when entering options or recentring on a new price
  useEffect(() => {
    if (productType !== 'options' || atmStrike <= 0) return;
    setStrike(String(atmStrike));
  }, [productType, atmStrike]);

  const fetchData = useCallback(async () => {
    if (!candleSeriesRef.current || !volumeSeriesRef.current || !proxyBase) return;
    if (productType !== 'index' && !selectedExpiry) return;
    if (productType === 'options' && !strike.trim()) return;

    setLoading(true);
    setError(null);
    setTooltip(null);

    try {
      const cfg = INDEX_CFG[selectedIndex];
      const cashExchange = cfg?.exchange ?? 'NSE';

      const params = new URLSearchParams({
        interval:      selectedInterval,
        from_date:     '1991-06-05T03:45:00.000Z',
        to_date:       `${toDate}T23:59:59.000Z`,
        stock_code:    cfg?.stock_code ?? selectedIndex,
        exchange_code: productType === 'index' ? cashExchange : (DERIV_EXCHANGE[cashExchange] ?? 'NFO'),
      });

      if (productType !== 'index') {
        params.set('product_type', productType);
        params.set('expiry_date', expiryToApiDate(selectedExpiry));
      }
      if (productType === 'options') {
        params.set('strike_price', strike.trim());
        params.set('right', right);
      }

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

      if (candles.length && candleSeriesRef.current && productType !== 'options') {
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
  }, [selectedIndex, selectedInterval, toDate, proxyBase, productType, selectedExpiry, strike, right]);

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

        {/* Product type */}
        <div className="flex gap-1 flex-shrink-0">
          {PRODUCTS.map(p => (
            <button
              key={p.value}
              onClick={() => setProductType(p.value)}
              className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                productType === p.value
                  ? 'bg-blue-600 text-white'
                  : 'bg-[#21262d] text-gray-400 hover:text-white hover:bg-[#30363d]'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Expiry selector */}
        {productType !== 'index' && (
          <select
            value={selectedExpiry}
            onChange={e => setSelectedExpiry(e.target.value)}
            className="bg-[#21262d] border border-[#30363d] text-white rounded px-2 py-1 text-sm focus:outline-none focus:border-blue-500 cursor-pointer flex-shrink-0"
          >
            {expiries.length === 0 && <option value="">No expiries</option>}
            {expiries.map(e => <option key={e} value={e}>{formatExpiry(e)}</option>)}
          </select>
        )}

        {/* Strike + right (options only) */}
        {productType === 'options' && (
          <>
            <select
              value={strike}
              onChange={e => setStrike(e.target.value)}
              className="bg-[#21262d] border border-[#30363d] text-white rounded px-2 py-1 text-sm focus:outline-none focus:border-blue-500 cursor-pointer flex-shrink-0"
              title={clickedPrice != null ? `From clicked price ${clickedPrice.toFixed(0)}` : `From LTP ${refPrice.toFixed(0)}`}
            >
              {strikeList.map(s => (
                <option key={s} value={s}>{s === atmStrike ? `${s} • ATM` : s}</option>
              ))}
            </select>
            <div className="flex gap-1 flex-shrink-0">
              {(['call', 'put'] as const).map(r => (
                <button
                  key={r}
                  onClick={() => setRight(r)}
                  className={`px-3 py-1 rounded text-xs font-medium uppercase transition-colors ${
                    right === r
                      ? (r === 'call' ? 'bg-[#26a69a] text-white' : 'bg-[#ef5350] text-white')
                      : 'bg-[#21262d] text-gray-400 hover:text-white hover:bg-[#30363d]'
                  }`}
                >
                  {r === 'call' ? 'CE' : 'PE'}
                </button>
              ))}
            </div>
          </>
        )}

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

        <div className="w-px h-5 bg-[#30363d] flex-shrink-0" />

        <label className="flex items-center gap-1 text-xs text-gray-500 flex-shrink-0">
          To
          <input
            type="date"
            value={toDate}
            onChange={e => setToDate(e.target.value)}
            className="bg-[#21262d] border border-[#30363d] text-white rounded px-2 py-1 text-sm focus:outline-none focus:border-blue-500 cursor-pointer [color-scheme:dark]"
          />
        </label>

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
