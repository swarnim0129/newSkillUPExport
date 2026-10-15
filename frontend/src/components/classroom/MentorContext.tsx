'use client';

import { createContext, useContext } from 'react';
import type { Mentor } from '@/lib/mentorApi';

export interface MentorContextValue {
    mentor: Mentor;
    setMentor: (mentor: Mentor) => void;
    demoEnabled: boolean;
    getToken: () => Promise<string | null>;
}

export const MentorContext = createContext<MentorContextValue | null>(null);

export function useMentor() {
    const value = useContext(MentorContext);
    if (!value) throw new Error('useMentor must be used inside the mentor layout');
    return value;
}
