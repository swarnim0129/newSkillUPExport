import type { MilestoneTool } from '@/lib/journeyApi';

// Where each plan tool lives, and what to call it on a button
export const TOOL_LINKS: Record<MilestoneTool, { label: string; href: ((topic: string) => string) | null }> = {
    roadmap: { label: 'Open Roadmap', href: (t) => `/candidate/learning-roadmap${t ? `?topic=${encodeURIComponent(t)}` : ''}` },
    tutor: { label: 'Open AI Tutor', href: () => '/candidate/tutor' },
    flashcards: { label: 'Open Revision Hub', href: () => '/candidate/revision' },
    resume_analyzer: { label: 'Analyze resume', href: () => '/candidate/resume-analyzer' },
    resume_builder: { label: 'Open Resume Builder', href: () => '/candidate/resume-builder' },
    mock_interview: { label: 'Start an interview', href: () => '/candidate/ai-interview' },
    companion: { label: 'Ask the companion', href: () => '/candidate/companion' },
    dsa: { label: 'Practise DSA', href: (t) => `/candidate/practice${t ? `?focus=${encodeURIComponent(t)}` : ''}` },
    practice: { label: 'Open the Lab', href: (t) => `/candidate/practice?tab=lab${t ? `&subject=${encodeURIComponent(t)}` : ''}` },
    classwork: { label: 'Open class work', href: (t) => `/candidate/classes/${t}` },
    none: { label: 'View in plan', href: () => '/candidate/journey' },
};

export function toolLink(tool: MilestoneTool | undefined, topic = '') {
    const entry = TOOL_LINKS[tool || 'none'] || TOOL_LINKS.none;
    return { label: entry.label, href: entry.href ? entry.href(topic) : '/candidate/journey' };
}
