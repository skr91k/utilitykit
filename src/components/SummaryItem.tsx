import { formatCurrency } from '../utils/format';

interface SummaryItemProps {
  label: string;
  value: number | null | undefined;
  useFullFormat: boolean;
  isExpense?: boolean;
  small?: boolean;
}

export const SummaryItem = ({ label, value, useFullFormat, isExpense, small }: SummaryItemProps) => {
  const formattedValue = formatCurrency(value, useFullFormat);

  if (formattedValue === '-') {
    return null;
  }

  const baseColor = isExpense
    ? 'text-red-400'
    : (value as number) >= 0
      ? 'text-green-400'
      : 'text-red-400';

  const valueClass = small ? `${baseColor} opacity-50` : `${baseColor} font-bold`;
  const labelSize = small ? 'text-[0.5rem] md:text-xs' : 'text-xs md:text-sm';
  const labelOpacity = small ? 'opacity-40' : 'opacity-80';
  const valueSize = small ? 'text-xs md:text-sm' : 'text-lg md:text-xl';
  const minWidth = small ? 'min-w-[40px]' : 'min-w-[80px]';

  return (
    <div className={`flex flex-col items-end justify-end ${minWidth}`}>
      <span className={`${labelOpacity} ${labelSize}`}>{label}</span>
      <span className={`${valueSize} ${valueClass}`}>
        {formattedValue}
      </span>
    </div>
  );
};
