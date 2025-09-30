'use client';

export default function Home() {
  const handleJoinEvent = () => {
    // Redirect to example event
    window.location.href = '/event/example-event-123';
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="max-w-2xl w-full">
        <div className="text-center mb-12">
          <h1 className="text-5xl font-bold text-gray-900 mb-4">ZK Voting</h1>
          <p className="text-xl text-gray-600">Anonymous & Verifiable Voting with Zero-Knowledge Proofs</p>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {/* Join Event Card */}
          <div className="bg-white rounded-lg shadow-lg p-8 hover:shadow-xl transition">
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Join Event</h2>
              <p className="text-gray-600 mb-6">Have an event link? Join and vote</p>
            </div>
            <input
              type="text"
              placeholder="Paste event link here"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent mb-4"
            />
            <button
              onClick={handleJoinEvent}
              className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg hover:bg-blue-700 transition font-medium"
            >
              Join Event
            </button>
          </div>

          {/* Create Event Card */}
          <div className="bg-white rounded-lg shadow-lg p-8 hover:shadow-xl transition">
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Create Event</h2>
              <p className="text-gray-600 mb-6">Set up a new voting event</p>
            </div>
            <a
              href="/create"
              className="block w-full bg-indigo-600 text-white py-3 px-4 rounded-lg hover:bg-indigo-700 transition font-medium text-center"
            >
              Create New Event
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
