'use client';

import { useEffect } from 'react';

export default function CreateEvent() {
  useEffect(() => {
    // Redirect to email verification page
    window.location.href = '/create/verify';
  }, []);

  return null;
}