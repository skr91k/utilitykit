import { useState } from 'react';
import type { FiscalYear as FiscalYearType } from '../types';
import { formatCurrency, getPnLClass, getPnLColor, formatDate } from '../utils/format';
import { SummaryItem } from './SummaryItem';
import { TradeItem } from './TradeItem';

interface FiscalYearProps {
  fiscalYear: FiscalYearType;
  useFullFormat: boolean;
  mobileDesktopView?: boolean;
}



export const FiscalYear = ({ fiscalYear, useFullFormat, mobileDesktopView = false }: FiscalYearProps) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [expandedDates, setExpandedDates] = useState<Set<number>>(new Set());

  const toggleDate = (index: number) => {
    setExpandedDates(prev => {
      const newSet = new Set(prev);
      if (newSet.has(index)) {
        newSet.delete(index);
      } else {
        newSet.add(index);
      }
      return newSet;
    });
  };

  const totalExpense = fiscalYear.expense ?? (fiscalYear.pnl?.reduce((sum, entry) => sum + (entry.expense || 0), 0) || 0);

  // Helper to get responsive class - show all columns if mobileDesktopView is enabled
  const getHiddenClass = (baseClass: string) => mobileDesktopView ? baseClass : `hidden md:${baseClass}`;

  return (
    <div className="mb-4 border-2 border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden transition-all hover:border-[#667eea] dark:hover:border-blue-500 hover:shadow-lg">
      <div
        className="bg-gradient-to-r from-[#667eea] to-[#764ba2] dark:from-gray-800 dark:to-gray-700 text-white p-4 md:p-5 cursor-pointer hover:from-[#5568d3] hover:to-[#653a8b] dark:hover:from-gray-700 dark:hover:to-gray-600 transition-all"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex flex-wrap items-center gap-3 md:gap-4">
          <span className="text-lg md:text-xl font-bold mr-auto">{fiscalYear.title}</span>
          <div className="flex flex-wrap flex-1 gap-3 md:gap-4 text-sm justify-end">
            <div className={getHiddenClass('block')}>
              <SummaryItem label="Net Bill" value={fiscalYear.netBill} useFullFormat={useFullFormat} small />
            </div>
            {totalExpense !== 0 && (
              <div className={getHiddenClass('block')}>
                <SummaryItem label="Expense" value={totalExpense} useFullFormat={useFullFormat} isExpense={true} small />
              </div>
            )}
            {/* <div className={getHiddenClass('block')}>
              <SummaryItem label="Gross Bill" value={fiscalYear.grossBill} useFullFormat={useFullFormat} />
            </div> */}
            <div className={getHiddenClass('block')}>
              <SummaryItem label="Trade P&L" value={fiscalYear.tpl} useFullFormat={useFullFormat} small />
            </div>
            <SummaryItem label="Net P&L" value={fiscalYear.netTPL} useFullFormat={useFullFormat} />
          </div>
        </div>
      </div>

      <div className={`accordion-content bg-gray-50 dark:bg-gray-900 ${isExpanded ? 'active' : ''}`}>
        {fiscalYear.pnl && fiscalYear.pnl.length > 0 && (
          <table className="w-full border-collapse text-xs md:text-sm text-gray-900 dark:text-gray-100">
            <thead className="bg-[#667eea] dark:bg-gray-800 text-white">
              <tr>
                <th className="p-3 text-left font-semibold">Date</th>
                <th className={`p-3 text-right font-semibold ${getHiddenClass('table-cell')}`}>Bill</th>
                <th className={`p-3 text-right font-semibold ${getHiddenClass('table-cell')}`}>Expense</th>
                {/* <th className={`p-3 text-right font-semibold ${getHiddenClass('table-cell')}`}>Gross Bill</th> */}
                <th className={`p-3 text-right font-semibold ${getHiddenClass('table-cell')}`}>Trade P&L</th>
                <th className="p-3 text-right font-semibold">Net P&L</th>
              </tr>
            </thead>
            <tbody>
              {fiscalYear.pnl.map((entry, index) => (
                <>
                  <tr
                    key={`date-${index}`}
                    className="border-b border-gray-200 dark:border-gray-700 hover:bg-indigo-50 dark:hover:bg-gray-800 cursor-pointer transition-colors"
                    onClick={() => toggleDate(index)}
                  >
                    <td className={`p-3 font-semibold text-[#667eea] dark:text-blue-400`}>
                      {entry.name || formatDate(entry.dateMilli)}
                    </td>
                    <td className={`p-3 text-right ${getPnLClass(entry.bill)} ${getHiddenClass('table-cell')}`}>{formatCurrency(entry.bill, useFullFormat)}</td>
                    <td className={`p-3 text-right text-red-400 font-bold ${getHiddenClass('table-cell')}`}>
                      {entry.expense != null
                        ? formatCurrency(entry.expense, useFullFormat)
                        : entry.calculatedExpense != null
                          ? `~${formatCurrency(entry.calculatedExpense, useFullFormat)}`
                          : formatCurrency(0, useFullFormat)}
                    </td>
                    {/* <td className={`p-3 text-right ${getPnLColor(entry.grossBill)} ${getHiddenClass('table-cell')}`}>{formatCurrency(entry.grossBill, useFullFormat)}</td> */}
                    <td className={`p-3 text-right ${getPnLColor(entry.tpl)} ${getHiddenClass('table-cell')}`}>
                      {formatCurrency(entry.tpl, useFullFormat)}
                    </td>
                    <td className={`p-3 text-right ${getPnLClass(entry.ntpl)}`}>
                      {formatCurrency(entry.ntpl, useFullFormat)}
                    </td>
                  </tr>
                  {entry.trades && entry.trades.length > 0 && expandedDates.has(index) && (
                    <tr key={`trades-${index}`} className="bg-indigo-50 dark:bg-gray-800">
                      <td colSpan={mobileDesktopView ? 6 : 2} className={mobileDesktopView ? 'p-0' : 'p-0 md:hidden'}>
                        <div className="p-4 border-t border-gray-300 dark:border-gray-600">
                          <div className="font-bold text-[#667eea] dark:text-blue-400 mb-3 text-sm">
                            Trades for {entry.name || formatDate(entry.dateMilli)}
                          </div>
                          {entry.trades.map((trade, tradeIndex) => (
                            <TradeItem key={tradeIndex} trade={trade} useFullFormat={useFullFormat} mobileDesktopView={mobileDesktopView} />
                          ))}
                        </div>
                      </td>
                      {!mobileDesktopView && (
                        <td colSpan={6} className="p-0 hidden md:table-cell">
                          <div className="p-4 border-t border-gray-300 dark:border-gray-600">
                            <div className="font-bold text-[#667eea] dark:text-blue-400 mb-3 text-sm">
                              Trades for {entry.name || formatDate(entry.dateMilli)}
                            </div>
                            {entry.trades.map((trade, tradeIndex) => (
                              <TradeItem key={tradeIndex} trade={trade} useFullFormat={useFullFormat} mobileDesktopView={mobileDesktopView} />
                            ))}
                          </div>
                        </td>
                      )}
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        )}
        {(!fiscalYear.pnl || fiscalYear.pnl.length === 0) && fiscalYear.swings && fiscalYear.swings.length > 0 && (
          <table className="w-full border-collapse text-xs md:text-sm text-gray-900 dark:text-gray-100">
            <thead className="bg-[#667eea] dark:bg-gray-800 text-white">
              <tr>
                <th className="p-3 text-left font-semibold">Symbol</th>
                <th className={`p-3 text-right font-semibold ${getHiddenClass('table-cell')}`}>Qty</th>
                <th className={`p-3 text-right font-semibold ${getHiddenClass('table-cell')}`}>Buy Date</th>
                <th className={`p-3 text-right font-semibold ${getHiddenClass('table-cell')}`}>Sell Date</th>
                <th className={`p-3 text-right font-semibold ${getHiddenClass('table-cell')}`}>Buy Value</th>
                <th className={`p-3 text-right font-semibold ${getHiddenClass('table-cell')}`}>Sell Value</th>
                <th className="p-3 text-right font-semibold">P&L</th>
              </tr>
            </thead>
            <tbody>
              {fiscalYear.swings.map((swing, index) => (
                <tr key={index} className="border-b border-gray-200 dark:border-gray-700 hover:bg-indigo-50 dark:hover:bg-gray-800 transition-colors">
                  <td className="p-3 font-semibold text-[#667eea] dark:text-blue-400">{swing.symbol}</td>
                  <td className={`p-3 text-right ${getHiddenClass('table-cell')}`}>{swing.qty}</td>
                  <td className={`p-3 text-right ${getHiddenClass('table-cell')}`}>{formatDate(swing.buyAtMilli)}</td>
                  <td className={`p-3 text-right ${getHiddenClass('table-cell')}`}>{formatDate(swing.sellAtMilli)}</td>
                  <td className={`p-3 text-right ${getHiddenClass('table-cell')}`}>{formatCurrency(swing.buyVal, useFullFormat)}</td>
                  <td className={`p-3 text-right ${getHiddenClass('table-cell')}`}>{formatCurrency(swing.sellVal, useFullFormat)}</td>
                  <td className={`p-3 text-right ${getPnLClass(swing.pnl)}`}>
                    {formatCurrency(swing.pnl, useFullFormat)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {fiscalYear.top10Trades && fiscalYear.top10Trades.length > 0 && (
          <div className="p-4">
            {fiscalYear.top10Trades.map((trade, index) => (
              <TradeItem key={index} trade={trade} useFullFormat={useFullFormat} showDate={true} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
