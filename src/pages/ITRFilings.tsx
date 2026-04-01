import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { database } from '../utils/firebase';
import { ref, get, set } from 'firebase/database';
import { formatCurrency } from '../utils/format';

interface ITRData {
  assessmentYear: string;
  totalIncome: number;
  grossTotalIncome: number;
  salaryIncome: number;
  businessIncome: number;
  speculativeIncome: number;
  capitalGains: number;
  otherSourcesIncome: number;
  totalTaxPaid: number;
  md5: string; // Actually SHA-256 hash, kept as 'md5' for variable naming consistency
}

export const ITRFilings = () => {
  const [view, setView] = useState<'users' | 'data'>('users');
  const [selectedUser, setSelectedUser] = useState<string>('');
  const [usernames, setUsernames] = useState<string[]>([]);
  const [itrData, setItrData] = useState<ITRData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [useFullFormat, setUseFullFormat] = useState(false);

  // Upload states
  const [uploadUsername, setUploadUsername] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<FileList | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string>('');

  // Load all usernames
  const loadUsernames = async () => {
    setLoading(true);
    setError(null);

    try {
      const itrRef = ref(database, '/itrfilings');
      const snapshot = await get(itrRef);
      const data = snapshot.val();

      if (!data) {
        setUsernames([]);
        setLoading(false);
        return;
      }

      const users = Object.keys(data);
      setUsernames(users);
      setLoading(false);
    } catch (err) {
      setLoading(false);
      setError(err instanceof Error ? err.message : 'Failed to load usernames');
    }
  };

  // Load ITR data for a specific user
  const loadUserITRData = async (username: string) => {
    setLoading(true);
    setError(null);
    setSelectedUser(username);

    try {
      const userRef = ref(database, `/itrfilings/${username}`);
      const snapshot = await get(userRef);
      const data = snapshot.val();

      if (!data) {
        setItrData([]);
        setLoading(false);
        setView('data');
        return;
      }

      // Parse all ITR JSON files for this user
      const parsedData: ITRData[] = [];

      Object.entries(data).forEach(([md5, value]) => {
        try {
          // Parse the JSON string if it's a string, otherwise use the object directly
          const itrJson = typeof value === 'string' ? JSON.parse(value as string) : value;

          // Extract the ITR3 data (handle both ITR3 and other ITR forms)
          const itrForm = itrJson?.ITR?.ITR3 || itrJson?.ITR?.ITR1 || itrJson?.ITR?.ITR2 || itrJson?.ITR?.ITR4;

          if (itrForm) {
            const assessmentYear = itrForm.Form_ITR3?.AssessmentYear ||
                                   itrForm.Form_ITR1?.AssessmentYear ||
                                   itrForm.Form_ITR2?.AssessmentYear ||
                                   itrForm.Form_ITR4?.AssessmentYear ||
                                   'N/A';

            const totalIncome = itrForm['PartB-TI']?.TotalIncome || 0;
            const grossTotalIncome = itrForm['PartB-TI']?.GrossTotalIncome || 0;
            const salaryIncome = itrForm.ScheduleS?.TotIncUnderHeadSalaries || 0;
            const businessIncome = itrForm.ITR3ScheduleBP?.BusinessIncOthThanSpec?.NetPLBusOthThanSpec ||
                                  itrForm.ITR3ScheduleBP?.BusinessIncOthThanSpec?.IncChrgUnHdProftGain || 0;
            const speculativeIncome = itrForm.ITR3ScheduleBP?.SpecBusinessInc?.NetPLFrmSpecBus ||
                                     itrForm.ITR3ScheduleBP?.SpecBusinessInc?.AdjustedPLFrmSpecuBus || 0;
            const capitalGains = itrForm.ScheduleCGFor23?.SumOfCGIncm || 0;
            const otherSourcesIncome = itrForm.ScheduleOS?.IncChargeable || 0;
            const totalTaxPaid = itrForm.PartB_TTI?.TaxPaid?.TaxesPaid?.TotalTaxesPaid || 0;

            parsedData.push({
              assessmentYear,
              totalIncome,
              grossTotalIncome,
              salaryIncome,
              businessIncome,
              speculativeIncome,
              capitalGains,
              otherSourcesIncome,
              totalTaxPaid,
              md5
            });
          }
        } catch (err) {
          console.error(`Error parsing ITR data for ${md5}:`, err);
        }
      });

      // Sort by assessment year (descending)
      parsedData.sort((a, b) => b.assessmentYear.localeCompare(a.assessmentYear));

      setItrData(parsedData);
      setLoading(false);
      setView('data');
    } catch (err) {
      setLoading(false);
      setError(err instanceof Error ? err.message : 'Failed to load ITR data');
    }
  };

  // Calculate SHA-256 hash (used instead of MD5 as it's more secure and supported in browsers)
  const calculateHash = async (content: string): Promise<string> => {
    const msgBuffer = new TextEncoder().encode(content);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return hashHex;
  };

  // Handle file upload
  const handleUpload = async () => {
    if (!selectedFiles || selectedFiles.length === 0) {
      alert('Please select at least one JSON file');
      return;
    }

    if (!uploadUsername.trim()) {
      alert('Please enter a username');
      return;
    }

    setUploading(true);
    setUploadStatus('');

    let successCount = 0;
    let duplicateCount = 0;
    let errorCount = 0;

    try {
      for (let i = 0; i < selectedFiles.length; i++) {
        const file = selectedFiles[i];

        try {
          const content = await file.text();

          // Validate JSON
          JSON.parse(content);

          // Calculate hash (SHA-256)
          const hash = await calculateHash(content);

          // Check if already exists
          const fileRef = ref(database, `/itrfilings/${uploadUsername.trim()}/${hash}`);
          const snapshot = await get(fileRef);

          if (snapshot.exists()) {
            duplicateCount++;
            console.log(`Duplicate: ${file.name} (Hash: ${hash})`);
          } else {
            // Upload to Firebase
            await set(fileRef, content);
            successCount++;
            console.log(`Uploaded: ${file.name} (Hash: ${hash})`);
          }
        } catch (err) {
          errorCount++;
          console.error(`Error processing ${file.name}:`, err);
        }
      }

      setUploadStatus(
        `Upload complete! ✓ ${successCount} uploaded, ⊘ ${duplicateCount} duplicates skipped, ✗ ${errorCount} errors`
      );

      // Refresh usernames list
      await loadUsernames();

      // Clear form
      setSelectedFiles(null);
      setUploadUsername('');

      // Reset file input
      const fileInput = document.getElementById('fileInput') as HTMLInputElement;
      if (fileInput) fileInput.value = '';

    } catch (err) {
      setUploadStatus(`Upload failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setUploading(false);
    }
  };

  useEffect(() => {
    loadUsernames();
  }, []);

  const getFYFromAssessmentYear = (ay: string) => {
    // Assessment Year 2024 means FY 2023-24
    if (ay === 'N/A') return 'N/A';
    const year = parseInt(ay);
    if (isNaN(year)) return ay;
    return `${year - 1}-${year.toString().slice(2)}`;
  };

  const handleBack = () => {
    setView('users');
    setSelectedUser('');
    setItrData([]);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#667eea] to-[#764ba2] dark:from-gray-900 dark:to-gray-800 p-3 md:p-5 transition-colors duration-300">
      <div className="max-w-6xl mx-auto bg-white dark:bg-gray-800 rounded-2xl shadow-2xl overflow-hidden transition-colors duration-300">
        {/* Header */}
        <div className="bg-gradient-to-r from-[#667eea] to-[#764ba2] dark:from-gray-800 dark:to-gray-700 text-white p-6 md:p-8 text-center relative transition-colors duration-300">
          {view === 'data' && (
            <div className="absolute top-4 right-4 md:top-8 md:right-8 hidden md:flex items-center gap-4">
              {/* Currency Toggle */}
              <div className="flex items-center gap-3 text-sm">
                <label htmlFor="currencyFormat" className="cursor-pointer select-none hidden md:block">
                  Short Format
                </label>
                <div className="relative inline-block w-[50px] h-6">
                  <input
                    type="checkbox"
                    id="currencyFormat"
                    checked={useFullFormat}
                    onChange={(e) => setUseFullFormat(e.target.checked)}
                    className="opacity-0 w-0 h-0"
                  />
                  <span className="toggle-slider" />
                </div>
                <label htmlFor="currencyFormat" className="cursor-pointer select-none hidden md:block">
                  Full Amount
                </label>
              </div>
            </div>
          )}

          <h1 className="text-2xl md:text-4xl font-bold mb-2">
            {view === 'users' ? 'ITR Filings - Users' : `ITR Filings - ${selectedUser}`}
          </h1>
          <p className="text-base md:text-lg opacity-90">
            {view === 'users' ? 'Select a user to view their ITR data' : 'Income Tax Return Summary'}
          </p>
        </div>

        {/* Content */}
        <div className="p-6 md:p-10 bg-gray-50 dark:bg-gray-900 transition-colors duration-300">
          {/* Users List View */}
          {view === 'users' && (
            <>
              <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow mb-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-bold text-gray-900 dark:text-white">Users</h2>
                  <button
                    onClick={loadUsernames}
                    className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
                  >
                    Refresh
                  </button>
                </div>

                {loading && (
                  <div className="text-center py-8 text-gray-600 dark:text-gray-400">
                    Loading users...
                  </div>
                )}

                {error && (
                  <div className="bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 p-4 rounded mb-4">
                    Error: {error}
                  </div>
                )}

                {!loading && usernames.length === 0 && (
                  <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                    No users found. Upload ITR files below to get started.
                  </div>
                )}

                {!loading && usernames.length > 0 && (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {usernames.map((username) => (
                      <button
                        key={username}
                        onClick={() => loadUserITRData(username)}
                        className="p-4 bg-gradient-to-r from-[#667eea] to-[#764ba2] text-white rounded-lg hover:shadow-lg hover:-translate-y-1 transition-all text-left"
                      >
                        <div className="flex items-center gap-3">
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            className="h-8 w-8"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                            />
                          </svg>
                          <span className="text-lg font-semibold">{username}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Upload Section */}
              <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow">
                <h2 className="text-xl font-bold mb-4 text-gray-900 dark:text-white">Upload ITR Files</h2>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-semibold mb-2 text-gray-700 dark:text-gray-300">
                      Username
                    </label>
                    <input
                      type="text"
                      value={uploadUsername}
                      onChange={(e) => setUploadUsername(e.target.value)}
                      placeholder="Enter username"
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#667eea] dark:bg-gray-700 dark:text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold mb-2 text-gray-700 dark:text-gray-300">
                      ITR JSON Files (Multiple files allowed)
                    </label>
                    <input
                      id="fileInput"
                      type="file"
                      accept=".json"
                      multiple
                      onChange={(e) => setSelectedFiles(e.target.files)}
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#667eea] dark:bg-gray-700 dark:text-white file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-[#667eea] file:text-white hover:file:bg-[#5568d3]"
                    />
                    {selectedFiles && (
                      <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
                        {selectedFiles.length} file(s) selected
                      </p>
                    )}
                  </div>

                  <button
                    onClick={handleUpload}
                    disabled={uploading}
                    className="w-full px-6 py-3 bg-gradient-to-r from-[#667eea] to-[#764ba2] text-white rounded-lg font-semibold hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {uploading ? 'Uploading...' : 'Upload Files'}
                  </button>

                  {uploadStatus && (
                    <div className={`p-4 rounded ${
                      uploadStatus.includes('failed') || uploadStatus.includes('errors')
                        ? 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400'
                        : 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400'
                    }`}>
                      {uploadStatus}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}

          {/* ITR Data Table View */}
          {view === 'data' && (
            <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow">
              <div className="flex items-center justify-between mb-4">
                <button
                  onClick={handleBack}
                  className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600 transition-colors flex items-center gap-2"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-5 w-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                  </svg>
                  Back to Users
                </button>
                <button
                  onClick={() => loadUserITRData(selectedUser)}
                  className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
                >
                  Refresh
                </button>
              </div>

              {loading && (
                <div className="text-center py-8 text-gray-600 dark:text-gray-400">
                  Loading ITR data...
                </div>
              )}

              {error && (
                <div className="bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 p-4 rounded mb-4">
                  Error: {error}
                </div>
              )}

              {!loading && itrData.length === 0 && (
                <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                  No ITR data found for {selectedUser}.
                </div>
              )}

              {!loading && itrData.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                    <thead className="bg-gray-100 dark:bg-gray-700">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider sticky left-0 bg-gray-100 dark:bg-gray-700 z-10">
                          FY
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                          Salary
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                          Business
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                          Speculative
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                          Capital Gains
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                          Other Sources
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                          Gross Total
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                          Total Income
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                          Tax Paid
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                      {itrData.map((item, index) => (
                        <tr key={index} className="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                          <td className="px-4 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white sticky left-0 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700">
                            {getFYFromAssessmentYear(item.assessmentYear)}
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap text-sm text-right text-gray-900 dark:text-gray-300">
                            {formatCurrency(item.salaryIncome, useFullFormat)}
                          </td>
                          <td className={`px-4 py-4 whitespace-nowrap text-sm text-right font-medium ${
                            item.businessIncome < 0
                              ? 'text-red-600 dark:text-red-400'
                              : 'text-gray-900 dark:text-gray-300'
                          }`}>
                            {formatCurrency(item.businessIncome, useFullFormat)}
                          </td>
                          <td className={`px-4 py-4 whitespace-nowrap text-sm text-right font-medium ${
                            item.speculativeIncome < 0
                              ? 'text-red-600 dark:text-red-400'
                              : 'text-green-600 dark:text-green-400'
                          }`}>
                            {formatCurrency(item.speculativeIncome, useFullFormat)}
                          </td>
                          <td className={`px-4 py-4 whitespace-nowrap text-sm text-right font-medium ${
                            item.capitalGains < 0
                              ? 'text-red-600 dark:text-red-400'
                              : 'text-green-600 dark:text-green-400'
                          }`}>
                            {formatCurrency(item.capitalGains, useFullFormat)}
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap text-sm text-right text-gray-900 dark:text-gray-300">
                            {formatCurrency(item.otherSourcesIncome, useFullFormat)}
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap text-sm text-right font-semibold text-blue-600 dark:text-blue-400">
                            {formatCurrency(item.grossTotalIncome, useFullFormat)}
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap text-sm text-right font-bold text-purple-600 dark:text-purple-400">
                            {formatCurrency(item.totalIncome, useFullFormat)}
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap text-sm text-right font-medium text-orange-600 dark:text-orange-400">
                            {formatCurrency(item.totalTaxPaid, useFullFormat)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          <Link
            to="/"
            className="inline-block mt-6 px-6 py-3 bg-gradient-to-r from-[#667eea] to-[#764ba2] dark:from-gray-700 dark:to-gray-600 text-white rounded font-semibold hover:-translate-y-0.5 hover:shadow-lg transition-all"
          >
            Back to Home
          </Link>
        </div>
      </div>
    </div>
  );
};
