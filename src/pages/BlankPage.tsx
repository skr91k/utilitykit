import { useEffect } from 'react';
import { trackIPData } from '../utils/firebase';

export const BlankPage = () => {
  useEffect(() => {
    // Track IP data when blank page loads
    trackIPData('blank_page_view');
  }, []);

  return (
    <div className="min-h-screen bg-white dark:bg-gray-900">
      പറ്റിച്ചേ

    </div>
  );
};
