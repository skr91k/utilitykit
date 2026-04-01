import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { database } from '../utils/firebase';
import { ref, set, get, remove } from 'firebase/database';

interface SocialLink {
  prefix: string;
  url: string;
}

export const AddSocial = () => {
  const [prefix, setPrefix] = useState('');
  const [url, setUrl] = useState('');
  const [socialLinks, setSocialLinks] = useState<SocialLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadSocialLinks = async () => {
    setLoading(true);
    setError(null);

    try {
      const socialRef = ref(database, '/social_list');
      const snapshot = await get(socialRef);
      const data = snapshot.val();

      if (!data) {
        setSocialLinks([]);
        setLoading(false);
        return;
      }

      const linksArray: SocialLink[] = Object.entries(data).map(([key, value]) => ({
        prefix: key,
        url: value as string
      }));

      setSocialLinks(linksArray);
      setLoading(false);
    } catch (err) {
      setLoading(false);
      setError(err instanceof Error ? err.message : 'Failed to load data');
    }
  };

  useEffect(() => {
    loadSocialLinks();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate prefix (only lowercase a-z)
    if (!/^[a-z]+$/.test(prefix)) {
      alert('URL prefix must contain only lowercase letters (a-z)');
      return;
    }

    // Validate URL
    if (!url.trim()) {
      alert('Please enter a valid URL');
      return;
    }

    try {
      const socialRef = ref(database, `/social_list/${prefix}`);
      await set(socialRef, url);
      alert(`Successfully added redirect: /l/${prefix} → ${url}`);
      setPrefix('');
      setUrl('');
      loadSocialLinks();
    } catch (err) {
      alert(`Failed to add redirect: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const handleDelete = async (prefixToDelete: string) => {
    const confirmed = window.confirm(
      `Are you sure you want to delete the redirect for "/l/${prefixToDelete}"?`
    );

    if (!confirmed) return;

    try {
      const socialRef = ref(database, `/social_list/${prefixToDelete}`);
      await remove(socialRef);
      alert('Redirect deleted successfully');
      loadSocialLinks();
    } catch (err) {
      alert(`Failed to delete redirect: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#667eea] to-[#764ba2] dark:from-gray-900 dark:to-gray-800 p-3 md:p-5 transition-colors duration-300">
      <div className="max-w-4xl mx-auto bg-white dark:bg-gray-800 rounded-2xl shadow-2xl overflow-hidden transition-colors duration-300">
        {/* Header */}
        <div className="bg-gradient-to-r from-[#667eea] to-[#764ba2] dark:from-gray-800 dark:to-gray-700 text-white p-6 md:p-8 text-center transition-colors duration-300">
          <h1 className="text-2xl md:text-4xl font-bold mb-2">Social Link Redirects</h1>
          <p className="text-base md:text-lg opacity-90">Manage your /l/* redirect links</p>
        </div>

        {/* Content */}
        <div className="p-6 md:p-10 bg-gray-50 dark:bg-gray-900 transition-colors duration-300">
          {/* Add New Form */}
          <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow mb-8">
            <h2 className="text-xl font-bold mb-4 text-gray-900 dark:text-white">Add New Redirect</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold mb-2 text-gray-700 dark:text-gray-300">
                  URL Prefix (lowercase a-z only)
                </label>
                <div className="flex items-center gap-2">
                  <span className="text-gray-600 dark:text-gray-400 font-mono">/l/</span>
                  <input
                    type="text"
                    value={prefix}
                    onChange={(e) => setPrefix(e.target.value.toLowerCase())}
                    placeholder="instagram"
                    pattern="[a-z]+"
                    required
                    className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#667eea] dark:bg-gray-700 dark:text-white"
                  />
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Example: "instagram" will create /l/instagram
                </p>
              </div>

              <div>
                <label className="block text-sm font-semibold mb-2 text-gray-700 dark:text-gray-300">
                  Original URL
                </label>
                <input
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://instagram.com/yourprofile"
                  required
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#667eea] dark:bg-gray-700 dark:text-white"
                />
              </div>

              <button
                type="submit"
                className="w-full px-6 py-3 bg-gradient-to-r from-[#667eea] to-[#764ba2] text-white rounded-lg font-semibold hover:shadow-lg transition-all"
              >
                Add Redirect
              </button>
            </form>
          </div>

          {/* Existing Links */}
          <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">Existing Redirects</h2>
              <button
                onClick={loadSocialLinks}
                className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
              >
                🔄 Refresh
              </button>
            </div>

            {loading && (
              <div className="text-center py-8 text-gray-600 dark:text-gray-400">
                Loading...
              </div>
            )}

            {error && (
              <div className="bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 p-4 rounded mb-4">
                Error: {error}
              </div>
            )}

            {!loading && socialLinks.length === 0 && (
              <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                No redirects added yet. Add your first one above!
              </div>
            )}

            {!loading && socialLinks.length > 0 && (
              <div className="space-y-3">
                {socialLinks.map((link) => (
                  <div
                    key={link.prefix}
                    className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700 rounded-lg"
                  >
                    <div className="flex-1">
                      <div className="font-mono text-blue-600 dark:text-blue-400 font-semibold">
                        /l/{link.prefix}
                      </div>
                      <div className="text-sm text-gray-600 dark:text-gray-300 break-all">
                        → {link.url}
                      </div>
                    </div>
                    <div className="flex gap-2 ml-4">
                      <a
                        href={`/l/${link.prefix}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3 py-1 bg-green-500 text-white rounded text-sm hover:bg-green-600 transition-colors"
                      >
                        Test
                      </a>
                      <button
                        onClick={() => handleDelete(link.prefix)}
                        className="px-3 py-1 bg-red-500 text-white rounded text-sm hover:bg-red-600 transition-colors"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <Link
            to="/"
            className="inline-block mt-6 px-6 py-3 bg-gradient-to-r from-[#667eea] to-[#764ba2] dark:from-gray-700 dark:to-gray-600 text-white rounded font-semibold hover:-translate-y-0.5 hover:shadow-lg transition-all"
          >
            ← Back to Home
          </Link>
        </div>
      </div>
    </div>
  );
};
