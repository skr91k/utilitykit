import { useState, type ReactNode } from 'react';
import { formatCurrency, getPnLClass } from '../utils/format';

interface CollapsibleSectionProps {
  title: string;
  totalLabel: string;
  totalValue: number;
  useFullFormat: boolean;
  children: ReactNode;
}

export const CollapsibleSection = ({
  title,
  totalLabel,
  totalValue,
  useFullFormat,
  children
}: CollapsibleSectionProps) => {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="mb-4 border-2 border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden transition-all hover:border-[#667eea] dark:hover:border-blue-500 hover:shadow-lg">
      <div
        className="bg-gradient-to-r from-[#667eea] to-[#764ba2] dark:from-gray-800 dark:to-gray-700 text-white p-4 md:p-5 cursor-pointer hover:from-[#5568d3] hover:to-[#653a8b] dark:hover:from-gray-700 dark:hover:to-gray-600 transition-all"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex flex-wrap items-center gap-3 md:gap-4">
          <span className="text-lg md:text-xl font-bold mr-auto">{title}</span>
          <div className="flex flex-wrap gap-3 md:gap-4 text-sm justify-end">
            <div className="flex flex-col items-end min-w-[80px]">
              <span className="opacity-80 text-xs">{totalLabel}</span>
              <span className={`font-bold text-lg ${getPnLClass(totalValue)}`}>
                {formatCurrency(totalValue, useFullFormat)}
              </span>
            </div>
          </div>
          <div className={`expand-icon w-8 h-8 rounded-full bg-white/20 flex items-center justify-center transition-all hover:bg-white/35 hover:scale-110 flex-shrink-0 ${isExpanded ? 'active' : ''}`} />
        </div>
      </div>

      <div className={`accordion-content bg-gray-50 dark:bg-gray-900 ${isExpanded ? 'active' : ''}`}>
        {children}
      </div>
    </div>
  );
};
