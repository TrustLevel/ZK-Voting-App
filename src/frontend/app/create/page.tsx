'use client';

/**
 * CREATE EVENT PAGE
 *
 * This page allows admins to create a new voting event.
 *
 * Flow:
 * 1. Admin connects their Cardano wallet
 * 2. Backend finds or creates a user record by wallet address
 * 3. Admin configures event: name, voting options, dates, voting power
 * 4. Form submits to backend API to create the event
 * 5. Redirects to /event/{eventId}/manage with admin token
 *
 * Backend API Calls:
 * - POST /users/find-or-create-by-wallet  (find/create admin user)
 * - POST /voting-event                     (create the event)
 */

import { useState, useEffect } from 'react';
import { useWallet } from '@meshsdk/react';
import { useRouter } from 'next/navigation';
import { CardanoNetwork, NETWORK_ID, NETWORK_LABEL, NetworkInfo, fetchNetworks } from '@/lib/network';
import { AppShell, PageIntro } from '@/components/AppShell';
import { Steps } from '@/components/Steps';
import { Button } from '@/components/Button';
import { CardHeader, Notice } from '@/components/Card';
import { FieldLabel, choiceTileClass, inputClass, inputErrorClass } from '@/components/Field';
import { AlertIcon, CalendarIcon, PlusIcon, SlidersIcon, TrashIcon, WalletIcon } from '@/components/Icons';
import { InfoButton } from '@/components/InfoButton';
import { INFO } from '@/components/infoTexts';
import { WalletModal } from '@/components/WalletModal';

// ============================================================================
// CONSTANTS
// ============================================================================

const BACKEND_API_URL = process.env.NEXT_PUBLIC_BACKEND_API_URL || 'http://localhost:3000';

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function CreateEventForm() {
  const router = useRouter();
  const { connect, connected, wallet, disconnect } = useWallet();

  // --------------------------------------------------------------------------
  // STATE MANAGEMENT
  // --------------------------------------------------------------------------

  // Wallet & User State
  const [isConnecting, setIsConnecting] = useState(false);
  const [walletAddress, setWalletAddress] = useState<string>('');
  const [adminUserId, setAdminUserId] = useState<number | null>(null);
  const [showWalletModal, setShowWalletModal] = useState(false);

  // Event Configuration State
  const [eventName, setEventName] = useState('');
  const [votingPower, setVotingPower] = useState<number>(1);
  const [options, setOptions] = useState(['', '']);
  // Cardano network of the event — chosen here, cannot be changed afterwards.
  const [network, setNetwork] = useState<CardanoNetwork>('preprod');
  const [networks, setNetworks] = useState<NetworkInfo[] | null>(null);
  const [walletNetworkId, setWalletNetworkId] = useState<number | null>(null);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // UI State
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState('');

  // --------------------------------------------------------------------------
  // BACKEND API CALLS
  // --------------------------------------------------------------------------

  /**
   * Find or create a user by wallet address
   * Backend: POST /users/find-or-create-by-wallet
   * Returns: { userId: number }
   */
  const findOrCreateUser = async (walletAddress: string) => {
    try {
      const response = await fetch(`${BACKEND_API_URL}/users/find-or-create-by-wallet`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress })
      });

      if (response.ok) {
        const user = await response.json();
        setAdminUserId(user.userId);
      } else {
        setAdminUserId(null);
        console.warn('Failed to find/create user, will use null adminUserId');
      }
    } catch (error) {
      console.error('Failed to find/create user:', error);
      setAdminUserId(null);
    }
  };

  // --------------------------------------------------------------------------
  // EFFECTS / LIFECYCLE
  // --------------------------------------------------------------------------

  /**
   * Which networks this server serves (Mainnet needs its own key, relay wallet and VKey UTxO).
   * Backend: GET /voting-event/networks
   */
  useEffect(() => {
    fetchNetworks(BACKEND_API_URL)
      .then(setNetworks)
      .catch(err => {
        console.error('Failed to load networks:', err);
        setNetworks([]);
      });
  }, []);

  /**
   * Get wallet address when wallet connects and find/create user in backend
   * This runs automatically when user connects their Cardano wallet
   */
  useEffect(() => {
    const getWalletAddressAndUser = async () => {
      if (connected && wallet) {
        try {
          wallet.getNetworkId().then(setWalletNetworkId).catch(() => setWalletNetworkId(null));
          const address = await wallet.getChangeAddress();
          setWalletAddress(address);
          await findOrCreateUser(address);
        } catch (error) {
          console.error('Failed to get wallet address:', error);
          // Fallback: try getUsedAddresses
          try {
            const usedAddresses = await wallet.getUsedAddresses();
            if (usedAddresses?.[0]) {
              setWalletAddress(usedAddresses[0]);
              await findOrCreateUser(usedAddresses[0]);
            }
          } catch (err) {
            console.error('Failed to get used addresses:', err);
          }
        } finally {
          setIsConnecting(false);
        }
      }
    };

    getWalletAddressAndUser();
  }, [connected, wallet]);

  // --------------------------------------------------------------------------
  // EVENT HANDLERS
  // --------------------------------------------------------------------------

  /**
   * Connect to a specific Cardano wallet by name
   */
  const connectWalletByName = async (walletName: string) => {
    try {
      setIsConnecting(true);
      setShowWalletModal(false);
      setError('');

      await connect(walletName);
    } catch (error) {
      console.error('Failed to connect wallet:', error);
      setError('Failed to connect wallet. Please try again.');
      setIsConnecting(false);
    }
  };

  /**
   * Add a new empty voting option
   */
  const addOption = () => {
    setOptions([...options, '']);
  };

  /**
   * Remove a voting option (minimum 2 options required)
   */
  const removeOption = (index: number) => {
    if (options.length > 2) {
      setOptions(options.filter((_, i) => i !== index));
    }
  };

  /**
   * Update the text of a voting option
   */
  const updateOption = (index: number, value: string) => {
    const newOptions = [...options];
    newOptions[index] = value;
    setOptions(newOptions);
  };

  /**
   * Main form submission handler - Creates a new voting event
   *
   * Backend: POST /voting-event
   * Request Body: {
   *   eventName: string,
   *   options: string[],
   *   votingPower: number,
   *   adminUserId: number | null,
   *   startingDate: number | null,  // POSIX timestamp in seconds
   *   endingDate: number | null      // POSIX timestamp in seconds
   * }
   * Response: {
   *   eventId: number,
   *   adminToken: string,
   *   ... (other event fields)
   * }
   *
   * After successful creation:
   * 1. Stores event data in sessionStorage
   * 2. Redirects to /event/{eventId}/manage?token={adminToken}
   */
  const handleCreateEvent = async (e: React.FormEvent) => {
    e.preventDefault();

    // Clear previous errors
    setError('');

    // Validate form
    if (!eventName.trim()) {
      setError('Please enter an event name');
      return;
    }

    // Validate Options
    const filteredOptions = options.filter(o => o.trim() !== '');
    if (filteredOptions.length < 2) {
      setError('Please provide at least 2 voting options');
      return;
    }

    // Validate dates
    // datetime-local input values are in the user's local time ("YYYY-MM-DDTHH:MM").
    // new Date(value) (no 'Z') interprets them as local time and produces a correct UTC epoch.
    if (startDate) {
      const startingTimestamp = new Date(startDate).getTime();
      if (startingTimestamp < Date.now()) {
        setError('Start date cannot be in the past');
        return;
      }
    }

    if (endDate && startDate) {
      const startingTimestamp = new Date(startDate).getTime();
      const endingTimestamp = new Date(endDate).getTime();
      if (endingTimestamp <= startingTimestamp) {
        setError('End date must be after start date');
        return;
      }
    }

    // Must be connected to create event
    if (!connected) {
      setShowWalletModal(true);
      return;
    }

    try {
      setIsCreating(true);

      // Convert datetime-local (local time) to POSIX seconds.
      // new Date(value) without 'Z' interprets the string as local time; .getTime() gives UTC epoch ms.
      const startingDate = startDate ? Math.floor(new Date(startDate).getTime() / 1000) : null;
      const endingDate = endDate ? Math.floor(new Date(endDate).getTime() / 1000) : null;

      // Create voting event via backend API
      const response = await fetch(`${BACKEND_API_URL}/voting-event`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventName: eventName.trim(),
          network,
          options: filteredOptions,
          votingPower: votingPower,
          adminUserId,
          startingDate,
          endingDate,
        })
      });

      if (!response.ok) {
        throw new Error(`Backend error: ${response.status} ${response.statusText}`);
      }

      const createdEvent = await response.json();
      const eventId = createdEvent.eventId;

      // Store event data in sessionStorage for /manage page to use
      // This allows the manage page to display data immediately without backend call
      // The manage page will also load from backend as a fallback
      sessionStorage.setItem('createdEvent', JSON.stringify({
        eventId,
        eventName,
        network,
        walletAddress,
        adminUserId,
        votingPower,
        options: JSON.stringify(filteredOptions),
        startingDate,
        endingDate,
        adminToken: createdEvent.adminToken,
        createdAt: Date.now(),
      }));

      // Redirect to manage page with admin token in URL
      // Admin token is required for accessing the management dashboard
      router.push(`/event/${eventId}/manage?token=${createdEvent.adminToken}`);
    } catch (error) {
      console.error('Failed to create event:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to create event.';
      setError(errorMessage);
    } finally {
      setIsCreating(false);
    }
  };

  // --------------------------------------------------------------------------
  // RENDER / UI
  // --------------------------------------------------------------------------

  const nameError = error && !error.includes('date') && !error.includes('Date') ? error : '';
  const dateError = error && (error.includes('date') || error.includes('Date')) ? error : '';

  return (
    <AppShell>
      <PageIntro
        eyebrow="ORGANISER · STEP 1 OF 2"
        title="Create New Voting Event"
        lede="Set the event parameters: name, network, voting type, options and voting period. They cannot be changed once the event exists. Step 2, inviting participants and publishing to the blockchain, follows on the event dashboard."
        className="mb-6"
      />

      <div className="mb-8 rounded-2xl border border-line bg-[#fafafa] px-3 py-3 sm:px-6">
        <Steps
          label="Where you are"
          active="parameters"
          steps={[
            { key: 'parameters', label: 'Event parameters', done: false },
            { key: 'dashboard', label: 'Invite & publish', done: false },
          ]}
          hints={['this page', 'event dashboard, after creation']}
        />
      </div>

      <form onSubmit={handleCreateEvent} className="space-y-8">
        {/* Voting Configuration */}
        <section className="border-t border-line pt-7">
          <CardHeader
            icon={<SlidersIcon size={20} />}
            title="Voting Configuration"
            info={<InfoButton text={INFO.createdEventFixed} label="What can still change later?" />}
          />

          {/* Event Name */}
          <div className="mb-6">
            <FieldLabel htmlFor="event-name">Event Name</FieldLabel>
            <input
              id="event-name"
              type="text"
              value={eventName}
              onChange={(e) => setEventName(e.target.value)}
              aria-invalid={!!nameError}
              className={`${inputClass} ${nameError ? inputErrorClass : ''}`}
              placeholder="e.g., Q1 2025 Community Feature Voting"
            />
            {nameError && (
              <p role="alert" className="mt-2 flex items-center gap-1.5 text-sm text-red-700">
                <AlertIcon size={16} />
                {nameError}
              </p>
            )}
          </div>

          {/* Network — fixed for the lifetime of the event */}
          <div className="mb-6">
            <FieldLabel info={<InfoButton text={INFO.network} />}>Cardano Network</FieldLabel>
            <div className="grid grid-cols-2 gap-3">
              {(['preprod', 'mainnet'] as CardanoNetwork[]).map(n => {
                const info = networks?.find(i => i.network === n);
                const enabled = networks === null ? n === 'preprod' : !!info?.enabled;
                return (
                  <label
                    key={n}
                    className={`relative flex min-h-[72px] items-center justify-center rounded-xl border-2 p-4 text-center transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ink/30 ${choiceTileClass(network === n, !enabled)}`}
                  >
                    <input
                      type="radio"
                      name="network"
                      checked={network === n}
                      disabled={!enabled}
                      onChange={() => setNetwork(n)}
                      className="sr-only"
                    />
                    <span>
                      <span className="block font-semibold text-ink">{NETWORK_LABEL[n]}</span>
                      <span className="block text-sm text-muted">
                        {n === 'mainnet' ? 'Real ADA — real costs' : 'Free test ADA'}
                      </span>
                      {!enabled && networks !== null && (
                        <span className="mt-1 block text-xs text-muted">Not available on this server</span>
                      )}
                    </span>
                  </label>
                );
              })}
            </div>
            <p className="mt-2 text-xs leading-relaxed text-muted">
              The network cannot be changed after the event is created.
              {network === 'mainnet'
                ? ' On Mainnet, publishing locks about 15 ADA in the event contracts, costs about 1.5 ADA in fees, and you prepay the voters\' transaction fees (1.3 ADA per registered voter) before publishing.'
                : ' Preprod is the free test network: you need a Preprod wallet with test ADA from the faucet to publish.'}
            </p>
          </div>

          {/* Voting Power */}
          <div className="mb-6">
            <FieldLabel info={<InfoButton text={INFO.votingType} />}>Voting Type</FieldLabel>
            <div className="grid grid-cols-2 gap-3">
              <label className={`relative flex min-h-[72px] items-center justify-center rounded-xl border-2 p-4 text-center transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ink/30 ${choiceTileClass(votingPower === 1)}`}>
                <input
                  type="radio"
                  name="voting-type"
                  checked={votingPower === 1}
                  onChange={() => setVotingPower(1)}
                  className="sr-only"
                />
                <span>
                  <span className="block font-semibold text-ink">Simple</span>
                  <span className="block text-sm text-muted">1 vote per person</span>
                </span>
              </label>
              <label className={`relative flex min-h-[72px] items-center justify-center rounded-xl border-2 p-4 text-center transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ink/30 ${choiceTileClass(votingPower > 1)}`}>
                <input
                  type="radio"
                  name="voting-type"
                  checked={votingPower > 1}
                  onChange={() => setVotingPower(100)}
                  className="sr-only"
                />
                <span>
                  <span className="block font-semibold text-ink">Weighted</span>
                  <span className="block text-sm text-muted">Distribute voting power</span>
                </span>
              </label>
            </div>

            {/* Voting Power Input (shown for weighted voting) */}
            {votingPower > 1 && (
              <div className="mt-3">
                <FieldLabel htmlFor="voting-power">Total Voting Power</FieldLabel>
                <input
                  id="voting-power"
                  type="number"
                  value={votingPower}
                  onChange={(e) => setVotingPower(parseInt(e.target.value) || 1)}
                  className={inputClass}
                  min="2"
                  placeholder="e.g., 100"
                />
                <p className="mt-2 text-xs text-muted">
                  Voters can distribute these {votingPower} points across multiple options.
                </p>
              </div>
            )}
          </div>

          {/* Voting Options */}
          <div>
            <FieldLabel>Voting Options (minimum 2 required)</FieldLabel>
            <div className="space-y-3">
              {options.map((option, index) => (
                <div key={index} className="flex gap-2">
                  <input
                    type="text"
                    value={option}
                    onChange={(e) => updateOption(index, e.target.value)}
                    className={`${inputClass} flex-1`}
                    placeholder={`Option ${index + 1}`}
                    aria-label={`Option ${index + 1}`}
                  />
                  {options.length > 2 && (
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => removeOption(index)}
                      aria-label={`Remove option ${index + 1}`}
                      className="min-h-12 border-[1.5px] border-red-200 px-3"
                    >
                      <TrashIcon size={18} />
                    </Button>
                  )}
                </div>
              ))}
            </div>
            <Button variant="ghost" size="sm" onClick={addOption} className="mt-3 -ml-2">
              <PlusIcon size={18} />
              Add Option
            </Button>
          </div>
        </section>

        {/* Voting Period */}
        <section className="border-t border-line pt-7">
          <CardHeader
            icon={<CalendarIcon size={20} />}
            title="Voting Period"
            info={<InfoButton text={INFO.votingWindow} />}
            description="Set the planned start and end dates for your voting event (your local time)."
          />

          {dateError && (
            <Notice tone="danger" className="mb-4" icon={null}>
              <p role="alert" className="flex items-center gap-1.5 font-medium">
                <AlertIcon size={16} />
                {dateError}
              </p>
            </Notice>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {/* Start Date */}
            <div>
              <FieldLabel htmlFor="start-date" hint="About 10 minutes ahead at the least: everyone must be registered before you publish, and publishing takes about 5 minutes.">Start Date & Time</FieldLabel>
              <input
                id="start-date"
                type="datetime-local"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className={inputClass}
              />
            </div>

            {/* End Date */}
            <div>
              <FieldLabel htmlFor="end-date" hint="At least 5 minutes after the start, plus about 2 minutes per voter voting at the same moment.">End Date & Time</FieldLabel>
              <input
                id="end-date"
                type="datetime-local"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className={inputClass}
              />
            </div>
          </div>
        </section>

        {/* Wallet + Submit: the wallet comes last because it should match the network chosen above */}
        <section className="border-t border-line pt-7">
          <CardHeader
            icon={<WalletIcon size={20} />}
            title="Connect your wallet and create the event"
            info={<InfoButton text={INFO.organiserWallet} />}
            description={`Connect the Cardano wallet you use on ${NETWORK_LABEL[network]}. It identifies you as the organiser and later signs the transactions that publish the event. Your voters need no wallet.`}
          />

          {!connected ? (
            <Button variant="primary" size="lg" onClick={() => setShowWalletModal(true)} disabled={isConnecting} loading={isConnecting}>
              {isConnecting ? 'Connecting...' : (<><WalletIcon size={18} /> Connect Wallet</>)}
            </Button>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line px-4 py-3">
              <div className="flex items-center gap-3">
                <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full bg-emerald-600" />
                <div>
                  <div className="text-sm font-semibold text-ink">Wallet Connected</div>
                  <div className="font-mono text-xs text-muted">
                    {walletAddress.slice(0, 12)}...{walletAddress.slice(-8)}
                  </div>
                </div>
              </div>
              <Button variant="danger" size="sm" onClick={() => disconnect()}>
                Disconnect
              </Button>
            </div>
          )}

          {connected && walletNetworkId !== null && walletNetworkId !== NETWORK_ID[network] && (
            <Notice tone="attention" className="mt-3" icon={null}>
              Your connected wallet is on {walletNetworkId === 1 ? 'Mainnet' : 'a testnet'}, but you chose {NETWORK_LABEL[network]}.
              You can still create the event, but to publish it you will need a wallet on {NETWORK_LABEL[network]}.
            </Notice>
          )}

          <Button
            type="submit"
            variant={connected ? 'primary' : 'dark'}
            size="lg"
            disabled={!connected || isConnecting || isCreating}
            loading={isCreating}
            className="mt-6"
          >
            {isCreating ? 'Creating Event...' : 'Create Event'}
          </Button>
          {!connected && (
            <p className="mt-3 text-center text-sm text-muted">Connect your wallet to create the event.</p>
          )}
        </section>
      </form>

      {/* Wallet Selection Modal */}
      <WalletModal
        open={showWalletModal}
        subtitle="Choose a wallet to create your voting event"
        onSelect={connectWalletByName}
        onClose={() => setShowWalletModal(false)}
      />
    </AppShell>
  );
}
