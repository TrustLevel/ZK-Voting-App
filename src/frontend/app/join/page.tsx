// not used at the moment

'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AppShell, PageIntro } from '@/components/AppShell';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { FieldLabel, inputClass } from '@/components/Field';
import { AlertIcon, ArrowLeftIcon } from '@/components/Icons';

export default function JoinEvent() {
  const [eventCode, setEventCode] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!eventCode.trim()) {
      setError('Please enter an event code');
      return;
    }

    if (!email.trim()) {
      setError('Please enter your email address');
      return;
    }

    // Redirect to event page
    window.location.href = `/event/${eventCode}`;
  };

  return (
    <AppShell width="sm" center>
      <PageIntro
        eyebrow="VOTER"
        title="Join Event"
        lede="Enter your event code and email to participate"
      />

      <Card>
        <form onSubmit={handleJoin} className="space-y-5">
          <div>
            <FieldLabel htmlFor="eventCode">Event Code</FieldLabel>
            <input
              id="eventCode"
              type="text"
              value={eventCode}
              onChange={(e) => setEventCode(e.target.value)}
              placeholder="Enter event code"
              className={inputClass}
              required
            />
          </div>

          <div>
            <FieldLabel htmlFor="email">Email Address</FieldLabel>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your.email@example.com"
              className={inputClass}
              required
            />
          </div>

          {error && (
            <p role="alert" className="flex items-center gap-1.5 text-sm text-red-700">
              <AlertIcon size={16} />
              {error}
            </p>
          )}

          <Button type="submit" variant="primary" size="lg">
            Continue
          </Button>
        </form>
      </Card>

      <div className="mt-6 text-center">
        <Link href="/" className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-muted hover:text-ink">
          <ArrowLeftIcon size={16} />
          Back to Home
        </Link>
      </div>
    </AppShell>
  );
}
