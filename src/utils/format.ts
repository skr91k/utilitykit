export const formatCurrency = (amount: number | null | undefined, useFullFormat: boolean): string => {
  if (amount === null || amount === undefined || isNaN(amount)) return '-';

  const absAmount = Math.abs(amount);
  const sign = amount < 0 ? '-' : '';

  if (useFullFormat) {
    return sign + absAmount.toLocaleString('en-IN', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 1
    });
  } else {
    if (absAmount >= 10000000) {
      return sign + parseFloat((absAmount / 10000000).toFixed(1)) + ' Cr';
    } else if (absAmount >= 100000) {
      return sign + parseFloat((absAmount / 100000).toFixed(1)) + ' L';
    } else if (absAmount >= 1000) {
      return sign + parseFloat((absAmount / 1000).toFixed(1)) + ' K';
    } else {
      return sign + parseFloat(absAmount.toFixed(0));
    }
  }
};

export const getPnLColor = (value: number): string => {
  return value >= 0 ? 'text-green-500' : 'text-red-500';
};

export const getPnLClass = (value: number): string => {
  return `${getPnLColor(value)} font-bold`;
};

export const formatDate = (dateMilli: number) => {
  const date = new Date(dateMilli);
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};
