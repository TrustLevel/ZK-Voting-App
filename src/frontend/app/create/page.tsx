'use client';

import { useState } from 'react';

export default function CreateEvent() {
  const [eventName, setEventName] = useState('');
  const [votingType, setVotingType] = useState<'simple' | 'weighted'>('simple');
  const [weight, setWeight] = useState(100);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [options, setOptions] = useState(['', '']);

  const addOption = () => {
    setOptions([...options, '']);
  };

  const removeOption = (index: number) => {
    if (options.length > 2) {
      setOptions(options.filter((_, i) => i !== index));
    }
  };

  const updateOption = (index: number, value: string) => {
    const newOptions = [...options];
    newOptions[index] = value;
    setOptions(newOptions);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    console.log({
      eventName,
      votingType,
      weight: votingType === 'weighted' ? weight : 0,
      startDate,
      endDate,
      options: options.filter(o => o.trim() !== ''),
    });
    alert('Event creation will be implemented with backend integration');
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-3xl mx-auto">
        <div className="bg-white rounded-lg shadow-lg p-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Create Voting Event</h1>
          <p className="text-gray-600 mb-8">Set up a new voting event with custom parameters</p>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Event Name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Event Name</label>
              <input
                type="text"
                value={eventName}
                onChange={(e) => setEventName(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="e.g., Community Feature Voting Q1 2025"
                required
              />
            </div>

            {/* Voting Type */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Voting Type</label>
              <div className="flex gap-4">
                <label className="flex items-center">
                  <input
                    type="radio"
                    value="simple"
                    checked={votingType === 'simple'}
                    onChange={(e) => setVotingType(e.target.value as 'simple')}
                    className="mr-2"
                  />
                  <span>Simple (1 vote per person)</span>
                </label>
                <label className="flex items-center">
                  <input
                    type="radio"
                    value="weighted"
                    checked={votingType === 'weighted'}
                    onChange={(e) => setVotingType(e.target.value as 'weighted')}
                    className="mr-2"
                  />
                  <span>Weighted (distribute voting power)</span>
                </label>
              </div>
            </div>

            {/* Weight (only for weighted voting) */}
            {votingType === 'weighted' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Voting Power (total points to distribute)
                </label>
                <input
                  type="number"
                  value={weight}
                  onChange={(e) => setWeight(parseInt(e.target.value))}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  min="1"
                  required
                />
              </div>
            )}

            {/* Date Range */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Start Date</label>
                <input
                  type="datetime-local"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">End Date</label>
                <input
                  type="datetime-local"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                />
              </div>
            </div>

            {/* Voting Options */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Voting Options</label>
              <div className="space-y-3">
                {options.map((option, index) => (
                  <div key={index} className="flex gap-2">
                    <input
                      type="text"
                      value={option}
                      onChange={(e) => updateOption(index, e.target.value)}
                      className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder={`Option ${index + 1}`}
                      required
                    />
                    {options.length > 2 && (
                      <button
                        type="button"
                        onClick={() => removeOption(index)}
                        className="px-3 py-2 text-red-600 hover:bg-red-50 rounded-lg transition"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={addOption}
                className="mt-3 text-blue-600 hover:text-blue-700 font-medium"
              >
                + Add Option
              </button>
            </div>

            {/* Submit */}
            <div className="flex gap-4 pt-4">
              <button
                type="submit"
                className="flex-1 bg-blue-600 text-white py-3 px-4 rounded-lg hover:bg-blue-700 transition font-medium"
              >
                Create Event
              </button>
              <a
                href="/"
                className="flex-1 text-center bg-gray-200 text-gray-700 py-3 px-4 rounded-lg hover:bg-gray-300 transition font-medium"
              >
                Cancel
              </a>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}