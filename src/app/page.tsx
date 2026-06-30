'use client';

import { useState } from 'react';
import { ChatPanel } from '@/components/ChatPanel';

export default function Home() {
  return (
    <div className="h-screen flex bg-gray-100">
      <ChatPanel />
    </div>
  );
}