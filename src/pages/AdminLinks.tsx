import { useState, useEffect, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { database } from '../utils/firebase';
import { ref, set, get } from 'firebase/database';
import type { LinksData, LinkPage, LinkItem } from '../types';

export const AdminLinks = () => {
  const [linkPages, setLinkPages] = useState<LinksData>({});
  const [selectedUsername, setSelectedUsername] = useState<string>('');
  const [currentPage, setCurrentPage] = useState<LinkPage | null>(null);
  const [loading, setLoading] = useState(true);

  // Form states for creating new link page
  const [newUsername, setNewUsername] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [newBio, setNewBio] = useState('');
  const [newAvatar, setNewAvatar] = useState('');

  // Form states for adding new link
  const [newLinkTitle, setNewLinkTitle] = useState('');
  const [newLinkUrl, setNewLinkUrl] = useState('');
  const [newLinkDescription, setNewLinkDescription] = useState('');
  const [newLinkIcon, setNewLinkIcon] = useState('');

  // Profile editor states
  const [editTitle, setEditTitle] = useState('');
  const [editBio, setEditBio] = useState('');
  const [editAvatar, setEditAvatar] = useState('');
  const [editTheme, setEditTheme] = useState<'gradient' | 'minimal' | 'dark'>('gradient');

  // Social links states
  const [socialPlatform, setSocialPlatform] = useState('');
  const [socialUrl, setSocialUrl] = useState('');

  const loadAllLinkPages = async () => {
    setLoading(true);

    try {
      const linksRef = ref(database, '/links_data');
      const snapshot = await get(linksRef);
      const data = snapshot.val() || {};

      setLinkPages(data);

      // Auto-select first page if exists
      const usernames = Object.keys(data);
      if (usernames.length > 0 && !selectedUsername) {
        const firstUsername = usernames[0];
        setSelectedUsername(firstUsername);
        setCurrentPage(data[firstUsername]);
        loadProfileData(data[firstUsername]);
      }

      setLoading(false);
    } catch (err) {
      console.error('Failed to load link pages:', err);
      setLoading(false);
    }
  };

  const loadProfileData = (page: LinkPage) => {
    setEditTitle(page.title || '');
    setEditBio(page.bio || '');
    setEditAvatar(page.avatar || '');
    setEditTheme(page.theme || 'gradient');
  };

  useEffect(() => {
    loadAllLinkPages();
  }, []);

  useEffect(() => {
    console.log('AdminLinks state:', { loading, linkPages, selectedUsername, currentPage });
  }, [loading, linkPages, selectedUsername, currentPage]);

  const handleSelectPage = (username: string) => {
    setSelectedUsername(username);
    const page = linkPages[username];
    setCurrentPage(page);
    loadProfileData(page);
  };

  const validateUrl = (url: string): boolean => {
    try {
      const parsed = new URL(url);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
      return false;
    }
  };

  const handleCreateLinkPage = async (e: FormEvent) => {
    e.preventDefault();

    // Validate username
    if (!/^[a-z0-9]+$/.test(newUsername)) {
      alert('Username must contain only lowercase letters and numbers');
      return;
    }

    // Check if exists
    if (linkPages[newUsername]) {
      alert('Username already exists');
      return;
    }

    const newPage: LinkPage = {
      title: newTitle,
      bio: newBio,
      avatar: newAvatar,
      theme: 'gradient',
      socialLinks: {},
      links: [],
      metadata: {
        createdAt: Date.now(),
        updatedAt: Date.now(),
        totalClicks: 0,
        viewCount: 0
      }
    };

    try {
      const pageRef = ref(database, `/links_data/${newUsername}`);
      await set(pageRef, newPage);

      alert(`Link page created: /links/${newUsername}`);

      // Reset form and reload
      setNewUsername('');
      setNewTitle('');
      setNewBio('');
      setNewAvatar('');
      loadAllLinkPages();
    } catch (err) {
      alert(`Failed to create: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const handleUpdateProfile = async (e: FormEvent) => {
    e.preventDefault();

    if (!selectedUsername || !currentPage) return;

    const updatedPage: LinkPage = {
      ...currentPage,
      title: editTitle,
      bio: editBio,
      avatar: editAvatar,
      theme: editTheme,
      metadata: {
        ...currentPage.metadata,
        updatedAt: Date.now(),
        createdAt: currentPage.metadata?.createdAt || Date.now(),
        totalClicks: currentPage.metadata?.totalClicks || 0,
        viewCount: currentPage.metadata?.viewCount || 0
      }
    };

    try {
      const pageRef = ref(database, `/links_data/${selectedUsername}`);
      await set(pageRef, updatedPage);

      alert('Profile updated successfully');
      loadAllLinkPages();
    } catch (err) {
      alert(`Failed to update: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const handleAddLink = async (e: FormEvent) => {
    e.preventDefault();

    if (!selectedUsername || !currentPage) return;

    // Validate URL
    if (!validateUrl(newLinkUrl)) {
      alert('Please enter a valid HTTP or HTTPS URL');
      return;
    }

    const newLink: LinkItem = {
      id: `link_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      title: newLinkTitle,
      url: newLinkUrl,
      description: newLinkDescription,
      icon: newLinkIcon,
      enabled: true,
      order: (currentPage.links || []).length,
      clicks: 0
    };

    const updatedLinks = [...(currentPage.links || []), newLink];

    try {
      const linksRef = ref(database, `/links_data/${selectedUsername}/links`);
      await set(linksRef, updatedLinks);

      alert('Link added successfully');

      // Reset form and reload
      setNewLinkTitle('');
      setNewLinkUrl('');
      setNewLinkDescription('');
      setNewLinkIcon('');
      loadAllLinkPages();
    } catch (err) {
      alert(`Failed to add link: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const handleDeleteLink = async (linkId: string) => {
    if (!selectedUsername || !currentPage || !currentPage.links) return;

    const confirmed = window.confirm('Are you sure you want to delete this link?');
    if (!confirmed) return;

    const updatedLinks = currentPage.links
      .filter(l => l.id !== linkId)
      .map((l, index) => ({ ...l, order: index })); // Reorder

    try {
      const linksRef = ref(database, `/links_data/${selectedUsername}/links`);
      await set(linksRef, updatedLinks);

      alert('Link deleted');
      loadAllLinkPages();
    } catch (err) {
      alert(`Failed to delete: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const handleMoveLink = async (linkId: string, direction: 'up' | 'down') => {
    if (!selectedUsername || !currentPage || !currentPage.links) return;

    const currentIndex = currentPage.links.findIndex(l => l.id === linkId);
    const newIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;

    if (newIndex < 0 || newIndex >= currentPage.links.length) return;

    const updatedLinks = [...currentPage.links];
    [updatedLinks[currentIndex], updatedLinks[newIndex]] =
      [updatedLinks[newIndex], updatedLinks[currentIndex]];

    // Update order property
    updatedLinks.forEach((link, index) => {
      link.order = index;
    });

    try {
      const linksRef = ref(database, `/links_data/${selectedUsername}/links`);
      await set(linksRef, updatedLinks);

      loadAllLinkPages();
    } catch (err) {
      alert(`Failed to reorder: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const handleToggleLink = async (linkId: string) => {
    if (!selectedUsername || !currentPage || !currentPage.links) return;

    const updatedLinks = currentPage.links.map(l =>
      l.id === linkId ? { ...l, enabled: !l.enabled } : l
    );

    try {
      const linksRef = ref(database, `/links_data/${selectedUsername}/links`);
      await set(linksRef, updatedLinks);

      loadAllLinkPages();
    } catch (err) {
      alert(`Failed to toggle: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const handleAddSocialLink = async (e: FormEvent) => {
    e.preventDefault();

    if (!selectedUsername || !currentPage) return;

    if (!validateUrl(socialUrl)) {
      alert('Please enter a valid URL');
      return;
    }

    const updatedSocialLinks = {
      ...(currentPage.socialLinks || {}),
      [socialPlatform.toLowerCase()]: socialUrl
    };

    try {
      const socialRef = ref(database, `/links_data/${selectedUsername}/socialLinks`);
      await set(socialRef, updatedSocialLinks);

      alert('Social link added');
      setSocialPlatform('');
      setSocialUrl('');
      loadAllLinkPages();
    } catch (err) {
      alert(`Failed to add social link: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const handleDeleteSocialLink = async (platform: string) => {
    if (!selectedUsername || !currentPage) return;

    const confirmed = window.confirm(`Delete ${platform} link?`);
    if (!confirmed) return;

    const updatedSocialLinks = { ...(currentPage.socialLinks || {}) };
    delete updatedSocialLinks[platform];

    try {
      const socialRef = ref(database, `/links_data/${selectedUsername}/socialLinks`);
      await set(socialRef, updatedSocialLinks);

      alert('Social link deleted');
      loadAllLinkPages();
    } catch (err) {
      alert(`Failed to delete: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const handleDeleteLinkPage = async () => {
    if (!selectedUsername) return;

    const confirmed = window.confirm(`Are you sure you want to delete the link page for "${selectedUsername}"? This cannot be undone.`);
    if (!confirmed) return;

    try {
      const pageRef = ref(database, `/links_data/${selectedUsername}`);
      await set(pageRef, null);

      alert('Link page deleted');
      setSelectedUsername('');
      setCurrentPage(null);
      loadAllLinkPages();
    } catch (err) {
      alert(`Failed to delete: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#667eea] to-[#764ba2] dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
        <div className="text-white text-xl">Loading admin panel...</div>
      </div>
    );
  }

  console.log('Rendering AdminLinks, linkPages:', linkPages);

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#667eea] to-[#764ba2] dark:from-gray-900 dark:to-gray-800 py-8 px-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-6 md:p-8 mb-6">
          <h1 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white mb-2">
            Link Pages Management
          </h1>
          <p className="text-gray-600 dark:text-gray-300">
            Create and manage your Linktree pages
          </p>
          <div className="mt-4 flex gap-4 flex-wrap">
            <Link
              to="/"
              className="text-[#667eea] dark:text-blue-400 hover:underline"
            >
              ← Back to Home
            </Link>
            <button
              onClick={loadAllLinkPages}
              className="text-[#667eea] dark:text-blue-400 hover:underline"
            >
              🔄 Refresh Data
            </button>
          </div>
        </div>

        {/* Link Page Selector/Creator */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-6 md:p-8 mb-6">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
            Select or Create Link Page
          </h2>

          {/* Selector */}
          {Object.keys(linkPages).length > 0 && (
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Select Existing Page
              </label>
              <select
                value={selectedUsername}
                onChange={(e) => handleSelectPage(e.target.value)}
                className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-[#667eea] dark:focus:ring-blue-500"
              >
                <option value="">-- Select a page --</option>
                {Object.keys(linkPages).map(username => (
                  <option key={username} value={username}>
                    {username} - {linkPages[username].title}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Creator */}
          <form onSubmit={handleCreateLinkPage} className="border-t border-gray-200 dark:border-gray-700 pt-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Create New Link Page
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Username (lowercase, no spaces) *
                </label>
                <input
                  type="text"
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value.toLowerCase())}
                  placeholder="johndoe"
                  required
                  className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-[#667eea] dark:focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Display Title *
                </label>
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="John Doe"
                  required
                  className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-[#667eea] dark:focus:ring-blue-500"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Bio *
                </label>
                <textarea
                  value={newBio}
                  onChange={(e) => setNewBio(e.target.value)}
                  placeholder="Creator & Developer"
                  required
                  rows={2}
                  className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-[#667eea] dark:focus:ring-blue-500"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Avatar URL (optional)
                </label>
                <input
                  type="url"
                  value={newAvatar}
                  onChange={(e) => setNewAvatar(e.target.value)}
                  placeholder="https://example.com/avatar.jpg"
                  className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-[#667eea] dark:focus:ring-blue-500"
                />
              </div>
            </div>
            <button
              type="submit"
              className="mt-4 bg-gradient-to-r from-[#667eea] to-[#764ba2] text-white px-6 py-3 rounded-lg hover:shadow-lg transition-all"
            >
              Create Link Page
            </button>
          </form>
        </div>

        {/* Profile Editor & Links Manager (only show when a page is selected) */}
        {currentPage && selectedUsername && (
          <>
            {/* Profile Editor */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-6 md:p-8 mb-6">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
                Edit Profile for "{selectedUsername}"
              </h2>
              <form onSubmit={handleUpdateProfile}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Display Title *
                    </label>
                    <input
                      type="text"
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      required
                      className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-[#667eea] dark:focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Theme
                    </label>
                    <select
                      value={editTheme}
                      onChange={(e) => setEditTheme(e.target.value as 'gradient' | 'minimal' | 'dark')}
                      className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-[#667eea] dark:focus:ring-blue-500"
                    >
                      <option value="gradient">Gradient</option>
                      <option value="minimal">Minimal</option>
                      <option value="dark">Dark</option>
                    </select>
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Bio *
                    </label>
                    <textarea
                      value={editBio}
                      onChange={(e) => setEditBio(e.target.value)}
                      required
                      rows={2}
                      className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-[#667eea] dark:focus:ring-blue-500"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Avatar URL
                    </label>
                    <input
                      type="url"
                      value={editAvatar}
                      onChange={(e) => setEditAvatar(e.target.value)}
                      className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-[#667eea] dark:focus:ring-blue-500"
                    />
                  </div>
                </div>
                <div className="mt-4 flex gap-4">
                  <button
                    type="submit"
                    className="bg-gradient-to-r from-[#667eea] to-[#764ba2] text-white px-6 py-3 rounded-lg hover:shadow-lg transition-all"
                  >
                    Update Profile
                  </button>
                  <button
                    type="button"
                    onClick={handleDeleteLinkPage}
                    className="bg-red-600 text-white px-6 py-3 rounded-lg hover:bg-red-700 transition-all"
                  >
                    Delete This Page
                  </button>
                </div>
              </form>

              {/* Social Links Management */}
              <div className="mt-8 border-t border-gray-200 dark:border-gray-700 pt-6">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                  Social Links
                </h3>

                {/* Existing Social Links */}
                {currentPage.socialLinks && Object.keys(currentPage.socialLinks).length > 0 && (
                  <div className="mb-4 space-y-2">
                    {Object.entries(currentPage.socialLinks).map(([platform, url]) => (
                      <div key={platform} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                        <div>
                          <span className="font-semibold text-gray-900 dark:text-white capitalize">{platform}:</span>
                          <span className="ml-2 text-gray-600 dark:text-gray-300 text-sm">{url}</span>
                        </div>
                        <button
                          onClick={() => handleDeleteSocialLink(platform)}
                          className="text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                        >
                          Delete
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Add Social Link Form */}
                <form onSubmit={handleAddSocialLink} className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <input
                      type="text"
                      value={socialPlatform}
                      onChange={(e) => setSocialPlatform(e.target.value)}
                      placeholder="Platform (e.g., twitter)"
                      required
                      className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-[#667eea] dark:focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <input
                      type="url"
                      value={socialUrl}
                      onChange={(e) => setSocialUrl(e.target.value)}
                      placeholder="https://twitter.com/username"
                      required
                      className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-[#667eea] dark:focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <button
                      type="submit"
                      className="w-full bg-[#667eea] text-white px-6 py-3 rounded-lg hover:bg-[#5568d3] transition-all"
                    >
                      Add Social Link
                    </button>
                  </div>
                </form>
              </div>
            </div>

            {/* Links Manager */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-6 md:p-8 mb-6">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
                Manage Links
              </h2>

              {/* Existing Links */}
              {currentPage.links && currentPage.links.length > 0 && (
                <div className="mb-6 space-y-3">
                  {currentPage.links.map((link, index) => (
                    <div
                      key={link.id}
                      className={`p-4 border-2 rounded-lg ${
                        link.enabled
                          ? 'border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-900/20'
                          : 'border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/50 opacity-60'
                      }`}
                    >
                      <div className="flex items-start gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            {link.icon && <span className="text-xl">{link.icon}</span>}
                            <h3 className="font-semibold text-gray-900 dark:text-white">
                              {link.title}
                            </h3>
                            <span className="text-xs text-gray-500 dark:text-gray-400">
                              ({link.clicks || 0} clicks)
                            </span>
                          </div>
                          <p className="text-sm text-gray-600 dark:text-gray-400 truncate">
                            {link.url}
                          </p>
                          {link.description && (
                            <p className="text-sm text-gray-500 dark:text-gray-500 mt-1">
                              {link.description}
                            </p>
                          )}
                        </div>
                        <div className="flex flex-col gap-2">
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleMoveLink(link.id, 'up')}
                              disabled={index === 0}
                              className="px-2 py-1 bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-300 dark:hover:bg-gray-500 disabled:opacity-30 disabled:cursor-not-allowed"
                            >
                              ↑
                            </button>
                            <button
                              onClick={() => handleMoveLink(link.id, 'down')}
                              disabled={index === currentPage.links.length - 1}
                              className="px-2 py-1 bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-300 dark:hover:bg-gray-500 disabled:opacity-30 disabled:cursor-not-allowed"
                            >
                              ↓
                            </button>
                          </div>
                          <button
                            onClick={() => handleToggleLink(link.id)}
                            className={`px-3 py-1 rounded text-sm ${
                              link.enabled
                                ? 'bg-yellow-500 text-white hover:bg-yellow-600'
                                : 'bg-green-500 text-white hover:bg-green-600'
                            }`}
                          >
                            {link.enabled ? 'Disable' : 'Enable'}
                          </button>
                          <button
                            onClick={() => handleDeleteLink(link.id)}
                            className="px-3 py-1 bg-red-600 text-white rounded text-sm hover:bg-red-700"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Add New Link Form */}
              <form onSubmit={handleAddLink} className="border-t border-gray-200 dark:border-gray-700 pt-6">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                  Add New Link
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Link Title *
                    </label>
                    <input
                      type="text"
                      value={newLinkTitle}
                      onChange={(e) => setNewLinkTitle(e.target.value)}
                      placeholder="My Portfolio"
                      required
                      className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-[#667eea] dark:focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      URL *
                    </label>
                    <input
                      type="url"
                      value={newLinkUrl}
                      onChange={(e) => setNewLinkUrl(e.target.value)}
                      placeholder="https://example.com"
                      required
                      className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-[#667eea] dark:focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Icon (emoji)
                    </label>
                    <input
                      type="text"
                      value={newLinkIcon}
                      onChange={(e) => setNewLinkIcon(e.target.value)}
                      placeholder="🌐"
                      maxLength={2}
                      className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-[#667eea] dark:focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Description
                    </label>
                    <input
                      type="text"
                      value={newLinkDescription}
                      onChange={(e) => setNewLinkDescription(e.target.value)}
                      placeholder="Check out my work"
                      className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-[#667eea] dark:focus:ring-blue-500"
                    />
                  </div>
                </div>
                <button
                  type="submit"
                  className="mt-4 bg-gradient-to-r from-[#667eea] to-[#764ba2] text-white px-6 py-3 rounded-lg hover:shadow-lg transition-all"
                >
                  Add Link
                </button>
              </form>
            </div>

            {/* Analytics & Preview */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-6 md:p-8">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
                Analytics & Preview
              </h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <div className="bg-gradient-to-br from-[#667eea] to-[#764ba2] text-white p-4 rounded-lg">
                  <div className="text-2xl font-bold">
                    {currentPage.metadata?.viewCount || 0}
                  </div>
                  <div className="text-sm opacity-90">Total Views</div>
                </div>
                <div className="bg-gradient-to-br from-[#667eea] to-[#764ba2] text-white p-4 rounded-lg">
                  <div className="text-2xl font-bold">
                    {currentPage.metadata?.totalClicks || 0}
                  </div>
                  <div className="text-sm opacity-90">Total Clicks</div>
                </div>
                <div className="bg-gradient-to-br from-[#667eea] to-[#764ba2] text-white p-4 rounded-lg">
                  <div className="text-2xl font-bold">
                    {(currentPage.links || []).length}
                  </div>
                  <div className="text-sm opacity-90">Total Links</div>
                </div>
                <div className="bg-gradient-to-br from-[#667eea] to-[#764ba2] text-white p-4 rounded-lg">
                  <div className="text-2xl font-bold">
                    {(currentPage.links || []).filter(l => l.enabled).length}
                  </div>
                  <div className="text-sm opacity-90">Active Links</div>
                </div>
              </div>
              <a
                href={`/links/${selectedUsername}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block bg-gradient-to-r from-[#667eea] to-[#764ba2] text-white px-6 py-3 rounded-lg hover:shadow-lg transition-all"
              >
                Preview Link Page →
              </a>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
