import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { trackIPData, database } from '../utils/firebase';
import { ref, get } from 'firebase/database';

export function SocialPreview() {
  const navigate = useNavigate();
  const location = useLocation();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const checkRedirect = async () => {
      // Extract the path after /l/
      const pathParts = location.pathname.split('/');
      const urlPrefix = pathParts[2]; // Gets "something" from "/l/something"

      if (urlPrefix) {
        try {
          // Check if this prefix exists in the database
          const socialRef = ref(database, `/social_list/${urlPrefix}`);
          const snapshot = await get(socialRef);

          if (snapshot.exists()) {
            const originalUrl = snapshot.val();
            // Redirect to the original URL
            window.location.href = originalUrl;
            return;
          }
        } catch (error) {
          console.error('Error checking redirect:', error);
        }
      }

      // If no redirect found, track and show preview
      setChecking(false);

    };

    trackIPData('page_load');
    checkRedirect();
  }, [location]);

  useEffect(() => {
    if (checking) return;

    // Update document title and meta tags for social media
    document.title = 'Trial and Error - Trading Dashboard';

    // Update or create meta tags for social media
    const updateMetaTag = (property: string, content: string) => {
      let metaTag = document.querySelector(`meta[property="${property}"]`) as HTMLMetaElement;
      if (!metaTag) {
        metaTag = document.createElement('meta');
        metaTag.setAttribute('property', property);
        document.head.appendChild(metaTag);
      }
      metaTag.content = content;
    };

    updateMetaTag('og:title', 'Trial and Error - Trading Dashboard');
    updateMetaTag('og:description', 'Track your trading P&L and performance metrics');
    updateMetaTag('og:image', '/preview-image.png'); // You'll need to add this image to public folder
    updateMetaTag('og:type', 'website');
    updateMetaTag('twitter:card', 'summary_large_image');
    updateMetaTag('twitter:title', 'Trial and Error - Trading Dashboard');
    updateMetaTag('twitter:description', 'Track your trading P&L and performance metrics');
    updateMetaTag('twitter:image', '/preview-image.png');
  }, [checking]);

  // Show loading state while checking for redirect
  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900">
        <div className="text-white text-xl">Redirecting...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900">
      <div className="max-w-2xl w-full mx-4 p-8 bg-gray-800 rounded-lg shadow-2xl border border-gray-700">
        <div className="text-center space-y-6">
          {/* Preview Image */}
          <div className="w-full h-64 bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
            <div className="text-white text-6xl font-bold">T&E</div>
          </div>

          {/* Title */}
          <h1 className="text-4xl font-bold text-white">
            Trial and Error
          </h1>

          {/* Description */}
          <p className="text-xl text-gray-300">
            Trading Dashboard - Track your P&L and performance metrics
          </p>

          {/* Action Button */}
          <button
            onClick={() => navigate('/')}
            className="mt-6 px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors duration-200"
          >
            Go to Dashboard
          </button>
        </div>
      </div>
    </div>
  );
}
