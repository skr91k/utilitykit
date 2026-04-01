import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { database, trackLinkClick, trackLinkPageView } from '../utils/firebase';
import { ref, get } from 'firebase/database';
import type { LinkPage } from '../types';

export const LinksPage = () => {
  const { username } = useParams<{ username: string }>();
  const [linkPageData, setLinkPageData] = useState<LinkPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    const fetchLinkPage = async () => {
      if (!username) {
        setNotFound(true);
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const linkRef = ref(database, `/links_data/${username}`);
        const snapshot = await get(linkRef);

        if (!snapshot.exists()) {
          setNotFound(true);
          setLoading(false);
          return;
        }

        const data = snapshot.val() as LinkPage;
        setLinkPageData(data);

        // Track page view
        await trackLinkPageView(username);

        setLoading(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load');
        setLoading(false);
      }
    };

    fetchLinkPage();
  }, [username]);

  const handleLinkClick = async (linkId: string, url: string) => {
    try {
      // Track click asynchronously
      if (username) {
        trackLinkClick(username, linkId);
      }

      // Open link in same tab
      window.location.href = url;
    } catch (err) {
      console.error('Failed to track click:', err);
      // Still open the link even if tracking fails
      window.location.href = url;
    }
  };

  const getInitials = (name: string): string => {
    return name
      .split(' ')
      .map(word => word[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#667eea] to-[#764ba2] dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
        <div className="text-center text-white text-xl">Loading...</div>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#667eea] to-[#764ba2] dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
        <div className="text-center max-w-md mx-auto bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-8">
          <h2 className="text-2xl md:text-3xl font-bold mb-4 text-gray-900 dark:text-white">
            Page Not Found
          </h2>
          <p className="text-gray-600 dark:text-gray-300 mb-6">
            The link page you're looking for doesn't exist.
          </p>
          <a
            href="/links/shakir"
            className="inline-block bg-gradient-to-r from-[#667eea] to-[#764ba2] text-white px-6 py-3 rounded-lg hover:shadow-lg transition-all"
          >
            Visit Shakir's Links
          </a>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#667eea] to-[#764ba2] dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
        <div className="text-center max-w-md mx-auto bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-8">
          <h2 className="text-2xl font-bold mb-4 text-red-600 dark:text-red-400">Error</h2>
          <p className="text-gray-900 dark:text-white mb-4">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="bg-gradient-to-r from-[#667eea] to-[#764ba2] text-white px-6 py-3 rounded-lg hover:shadow-lg transition-all"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!linkPageData) return null;

  const enabledLinks = (linkPageData.links || [])
    .filter(link => link.enabled)
    .sort((a, b) => a.order - b.order);

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#667eea] to-[#764ba2] dark:from-gray-900 dark:to-gray-800 py-8 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Profile Section */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-8 mb-6">
          <div className="text-center">
            {/* Avatar */}
            <div className="mb-6">
              {linkPageData.avatar ? (
                <img
                  src={linkPageData.avatar}
                  alt={linkPageData.title}
                  className="w-24 h-24 md:w-32 md:h-32 rounded-full mx-auto border-4 border-[#667eea] dark:border-blue-500 object-cover"
                />
              ) : (
                <div className="w-24 h-24 md:w-32 md:h-32 rounded-full mx-auto border-4 border-[#667eea] dark:border-blue-500 bg-gradient-to-br from-[#667eea] to-[#764ba2] flex items-center justify-center text-white text-3xl md:text-4xl font-bold">
                  {getInitials(linkPageData.title)}
                </div>
              )}
            </div>

            {/* Title */}
            <h1 className="text-2xl md:text-4xl font-bold text-gray-900 dark:text-white mb-3">
              {linkPageData.title}
            </h1>

            {/* Bio */}
            <p className="text-gray-600 dark:text-gray-300 text-sm md:text-base max-w-lg mx-auto">
              {linkPageData.bio}
            </p>
          </div>
        </div>

        {/* Links Section */}
        {enabledLinks.length > 0 && (
          <div className="space-y-4">
            {enabledLinks.map((link) => (
              <button
                key={link.id}
                onClick={() => handleLinkClick(link.id, link.url)}
                className="w-full bg-white dark:bg-gray-800 rounded-xl shadow-lg p-4 md:p-5 hover:-translate-y-1 hover:shadow-2xl transition-all duration-200 text-left border-2 border-transparent hover:border-[#667eea] dark:hover:border-blue-500"
              >
                <div className="flex items-center gap-3">
                  {link.icon && (
                    <span className="text-2xl md:text-3xl flex-shrink-0">{link.icon}</span>
                  )}
                  <div className="flex-1 min-w-0">
                    <h3 className="text-lg md:text-xl font-semibold text-gray-900 dark:text-white truncate">
                      {link.title}
                    </h3>
                    {link.description && (
                      <p className="text-sm text-gray-600 dark:text-gray-400 truncate">
                        {link.description}
                      </p>
                    )}
                  </div>
                  <svg
                    className="w-5 h-5 md:w-6 md:h-6 text-gray-400 dark:text-gray-500 flex-shrink-0"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                    />
                  </svg>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Social Links Section */}
        {linkPageData.socialLinks && Object.keys(linkPageData.socialLinks).length > 0 && (
          <div className="mt-6 space-y-3">
            {Object.entries(linkPageData.socialLinks).map(([platform, url]) => (
              <a
                key={platform}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-4 bg-white dark:bg-gray-800 rounded-xl shadow-lg p-4 hover:-translate-y-1 hover:shadow-2xl transition-all duration-200 border-2 border-transparent hover:border-[#667eea] dark:hover:border-blue-500"
              >
                <div className="w-12 h-12 flex-shrink-0 rounded-full bg-gradient-to-br from-[#667eea] to-[#764ba2] flex items-center justify-center">
                  <span className="text-xl font-bold text-white capitalize">
                    {platform.charAt(0).toUpperCase()}
                  </span>
                </div>
                <span className="text-lg font-semibold text-gray-900 dark:text-white capitalize">
                  {platform}
                </span>
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
