import type { Trade } from '../types';
import { formatCurrency, getPnLClass, formatDate } from '../utils/format';

interface TradeItemProps {
  trade: Trade;
  useFullFormat: boolean;
  showDate?: boolean;
  mobileDesktopView?: boolean;
}

export const TradeItem = ({ trade, useFullFormat, showDate, mobileDesktopView = false }: TradeItemProps) => {
  const getTypeClass = (type: string) => {
    switch (type.toUpperCase()) {
      case 'SELL':
        return 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300';
      case 'BUY':
        return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300';
      case 'INTRADAY':
        return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300';
      default:
        return 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300';
    }
  };

  // Helper to get responsive class - show all columns if mobileDesktopView is enabled
  const getHiddenClass = (baseClass: string) => mobileDesktopView ? baseClass : `hidden md:${baseClass}`;

  return (
    <div className={`grid ${mobileDesktopView ? 'grid-cols-[1fr_80px_80px_80px]' : 'grid-cols-[1fr_auto] md:grid-cols-[1fr_80px_80px_80px]'} gap-2 items-center p-2 bg-white dark:bg-gray-800 rounded-md mb-2 border border-gray-200 dark:border-gray-700`}>
      <div className="font-bold text-gray-800 dark:text-gray-200 text-sm">{trade.symbol}</div>
      <div className={`${getHiddenClass('flex')} justify-end items-center gap-2`}>
        {showDate && trade.dateMilli && (
          <span className="text-xs text-gray-500 dark:text-gray-400 font-medium whitespace-nowrap hidden md:inline">
            {formatDate(trade.dateMilli)}
          </span>
        )}
        <span className={`px-2 py-1 rounded text-xs font-bold ${getTypeClass(trade.type)}`}>
          {trade.type}
        </span>
      </div>
      <div className={`${getHiddenClass('flex')} flex-col items-end`}>
        <span className="text-[10px] text-gray-500 dark:text-gray-400 uppercase">Position Size</span>
        <span className="font-semibold text-sm text-gray-900 dark:text-gray-100">{formatCurrency(trade.value, useFullFormat)}</span>
      </div>
      <div className="flex flex-col items-end">
        {!(trade.type.toUpperCase() === 'BUY' && trade.tradePNL === 0) && (
          <>
            <span className="text-[10px] text-gray-500 dark:text-gray-400 uppercase">P&L</span>
            <span className={`font-semibold text-sm ${getPnLClass(trade.tradePNL)}`}>
              {formatCurrency(trade.tradePNL, useFullFormat)}
            </span>
          </>
        )}
      </div>
    </div>
  );
};
