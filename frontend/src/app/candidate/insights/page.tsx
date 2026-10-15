'use client';

import React, { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@clerk/nextjs';
import { Spinner, Tabs } from '@/components/classroom/ui';
import WhatIfTab from '@/components/grow/WhatIfTab';
import RivalTab from '@/components/grow/RivalTab';
import WellbeingTab from '@/components/grow/WellbeingTab';

type Tab = 'what-if' | 'rival' | 'wellbeing';
const TABS: { key: Tab; label: string }[] = [
    { key: 'what-if', label: 'Time machine' },
    { key: 'rival', label: 'Rival ghost' },
    { key: 'wellbeing', label: 'Burnout guard' },
];

export default function InsightsPage() {
    return (
        <Suspense fallback={<Spinner label="Loading insights" />}>
            <Insights />
        </Suspense>
    );
}

function Insights() {
    const params = useSearchParams();
    const router = useRouter();
    const { getToken } = useAuth();
    const initial = (params.get('tab') as Tab) || 'what-if';
    const [tab, setTab] = useState<Tab>(TABS.some((t) => t.key === initial) ? initial : 'what-if');

    const change = (next: Tab) => {
        setTab(next);
        router.replace(`/candidate/insights?tab=${next}`, { scroll: false });
    };

    return (
        <div className="space-y-5 pb-10">
            <div>
                <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-3xl">Insights</h1>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">See where your habits lead, race the student you want to become, and keep your pace healthy.</p>
            </div>
            <Tabs<Tab> label="Insights" value={tab} onChange={change} tabs={TABS} />
            <div role="tabpanel">
                {tab === 'what-if' && <WhatIfTab getToken={getToken} />}
                {tab === 'rival' && <RivalTab getToken={getToken} />}
                {tab === 'wellbeing' && <WellbeingTab getToken={getToken} />}
            </div>
        </div>
    );
}
