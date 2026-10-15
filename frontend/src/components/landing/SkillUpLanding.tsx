'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import { motion, useScroll, useTransform, useInView } from 'motion/react';
import Link from 'next/link';
import { useUser, useAuth, SignedIn, SignedOut, UserButton } from '@clerk/nextjs';
import { AnimatedThemeToggler } from '@/components/ui/animated-theme-toggler';
import { AnimatedShinyText } from '@/components/magicui/animated-shiny-text';
import { ShinyButton } from '@/components/magicui/shiny-button';
import { MagicCard } from '@/components/magicui/magic-card';
import { TextReveal } from '@/components/magicui/text-reveal';
import {
  ArrowRight, Route, Mic, Brain, FileText, ScanSearch, Briefcase,
  CheckCircle2, Sparkles, Zap, GraduationCap, TrendingUp,
  Target, ChevronRight, Star, Play,
  Hourglass, Telescope, BadgeCheck, Camera, Siren, Radio
} from 'lucide-react';

gsap.registerPlugin(ScrollTrigger);

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5500/api';
type UserRole = 'candidate' | 'mentor' | 'admin' | null;

const features = [
  { icon: Hourglass, title: 'Talk to Your Future Self', desc: 'A voice call with you in final year, speaking from your real projection: what happened if you kept today\u2019s habits, and if you changed them.', href: '/candidate/companion' },
  { icon: Telescope, title: 'What-If Time Machine', desc: 'Move a slider for hours, goal or DSA pace and watch your readiness curve redraw against the ready line, with every assumption shown.', href: '/candidate/insights' },
  { icon: BadgeCheck, title: 'Verified Skill Passport', desc: 'A public page and QR code where every skill links to real results: tested solutions, scored sets, AI interviews and class grades.', href: '/candidate/passport' },
  { icon: Camera, title: 'Snap & Study', desc: 'Photograph the whiteboard or your notes. Get a summary, a 5-question quiz and flashcards in seconds, plus a revision slot in your plan.', href: '/candidate/practice?tab=snap' },
  { icon: Siren, title: 'Panic Mode', desc: 'Exam in 72 hours? An hour-by-hour sprint with shaky topics first, quiz bursts, breaks and sleep, counting down to the exam.', href: '/candidate/practice?tab=panic' },
  { icon: Radio, title: 'Live Class Battles', desc: 'Faculty run a Kahoot-style timed quiz on the projector; the class answers from phones with a live leaderboard.', href: '/candidate/classes' },
];

const showcaseItems = [
  { title: 'MURPH — Your AI Voice Tutor', body: 'Ask any question while watching a video. MURPH pauses playback, answers with context from the lesson, jumps to timestamps, and quizzes you — all via voice.', icon: Mic, image: 'https://images.unsplash.com/photo-1531482615713-2afd69097998?w=800&q=80', reverse: false, checks: ['Voice-first interaction', 'Context-aware answers', 'Auto video control'] },
  { title: 'Adaptive Learning Roadmap', body: 'Upload your resume or set a target role. AI analyzes gaps and builds a step-by-step plan with curated content that evolves with you.', icon: Route, image: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=800&q=80', reverse: true, checks: ['Resume-based analysis', 'Gap identification', 'Progress tracking'] },
  { title: 'Smart Interview Prep', body: 'Practice with an AI interviewer that adapts questions to your target role. Detailed feedback on content, delivery, and confidence.', icon: Brain, image: 'https://images.unsplash.com/photo-1434030216411-0b793f4b4173?w=800&q=80', reverse: false, checks: ['Role-specific questions', 'Real-time feedback', 'Performance scoring'] },
];

export default function SkillUpLanding() {
  const { isSignedIn, user, isLoaded } = useUser();
  const { getToken } = useAuth();
  const [userRole, setUserRole] = useState<UserRole>(null);
  const [isScrolled, setIsScrolled] = useState(false);
  const heroTextRef = useRef<HTMLDivElement>(null);
  const featuresRef = useRef<HTMLDivElement>(null);
  const stepsRef = useRef<HTMLDivElement>(null);
  const showcaseRef = useRef<HTMLDivElement>(null);
  const statsRef = useRef<HTMLDivElement>(null);

  // ─── Lenis smooth scroll + GSAP integration ───
  useEffect(() => {
    const lenis = new Lenis({
      duration: 1.2,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
    });

    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add((time) => lenis.raf(time * 1000));
    gsap.ticker.lagSmoothing(0);

    // ─── GSAP Animations ───

    // Hero stagger
    if (heroTextRef.current) {
      const els = heroTextRef.current.querySelectorAll('[data-hero-anim]');
      gsap.fromTo(els,
        { y: 60, opacity: 0, filter: 'blur(8px)' },
        { y: 0, opacity: 1, filter: 'blur(0px)', duration: 1, stagger: 0.12, ease: 'power3.out', delay: 0.2 }
      );
    }

    // Features — each card slides in and fades
    if (featuresRef.current) {
      const cards = featuresRef.current.querySelectorAll('[data-feature-card]');
      gsap.fromTo(cards,
        { y: 40, opacity: 0, scale: 0.95 },
        {
          y: 0, opacity: 1, scale: 1, duration: 0.6, stagger: 0.08, ease: 'power2.out',
          scrollTrigger: { trigger: featuresRef.current, start: 'top 80%', toggleActions: 'play none none none' }
        }
      );
    }

    // Steps — slide from left with stagger
    if (stepsRef.current) {
      const steps = stepsRef.current.querySelectorAll('[data-step-card]');
      gsap.fromTo(steps,
        { x: -40, opacity: 0 },
        {
          x: 0, opacity: 1, duration: 0.7, stagger: 0.15, ease: 'power2.out',
          scrollTrigger: { trigger: stepsRef.current, start: 'top 80%', toggleActions: 'play none none none' }
        }
      );
    }

    // Stats — scale up
    if (statsRef.current) {
      const statItems = statsRef.current.querySelectorAll('[data-stat]');
      gsap.fromTo(statItems,
        { scale: 0.8, opacity: 0 },
        {
          scale: 1, opacity: 1, duration: 0.5, stagger: 0.1, ease: 'back.out(1.5)',
          scrollTrigger: { trigger: statsRef.current, start: 'top 85%', toggleActions: 'play none none none' }
        }
      );
    }

    // Showcase — parallax images
    if (showcaseRef.current) {
      const images = showcaseRef.current.querySelectorAll('[data-showcase-img]');
      images.forEach((img) => {
        gsap.fromTo(img,
          { y: 60, opacity: 0, scale: 0.92 },
          {
            y: 0, opacity: 1, scale: 1, duration: 0.8, ease: 'power2.out',
            scrollTrigger: { trigger: img, start: 'top 85%', toggleActions: 'play none none none' }
          }
        );
      });

      const texts = showcaseRef.current.querySelectorAll('[data-showcase-txt]');
      texts.forEach((txt) => {
        gsap.fromTo(txt,
          { x: -30, opacity: 0 },
          {
            x: 0, opacity: 1, duration: 0.7, ease: 'power2.out',
            scrollTrigger: { trigger: txt, start: 'top 85%', toggleActions: 'play none none none' }
          }
        );
      });
    }

    const handleScroll = () => setIsScrolled(window.scrollY > 30);
    window.addEventListener('scroll', handleScroll);

    return () => {
      lenis.destroy();
      ScrollTrigger.getAll().forEach(t => t.kill());
      window.removeEventListener('scroll', handleScroll);
    };
  }, []);

  useEffect(() => {
    const checkRole = async () => {
      if (!isLoaded || !isSignedIn || !user) return;
      try {
        const token = await getToken();
        const res = await fetch(`${API_BASE_URL}/onboarding/check`, { headers: { Authorization: `Bearer ${token}` } });
        const data = await res.json();
        if (data.exists && data.role) setUserRole(data.role as UserRole);
      } catch {}
    };
    checkRole();
  }, [isLoaded, isSignedIn, user, getToken]);

  const dashLink = userRole === 'candidate' ? '/candidate/journey' : userRole === 'mentor' ? '/mentor' : userRole === 'admin' ? '/admin/dashboard' : '/onboarding';
  const fHref = (c: string) => !isSignedIn ? '/signup' : userRole === 'candidate' ? c : '/onboarding';

  return (
    <div className="min-h-screen bg-white dark:bg-[var(--soft-sunken)] text-gray-900 dark:text-gray-100 transition-colors overflow-hidden">
      {/* Dot grid background */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="w-full h-full opacity-[0.3] dark:opacity-[0.06]" style={{ backgroundImage: 'radial-gradient(circle, #d1d5db 1px, transparent 1px)', backgroundSize: '28px 28px' }} />
      </div>

      {/* ═══════════ NAVBAR ═══════════ */}
      <header className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
        isScrolled ? 'bg-white/80 dark:bg-[var(--soft-sunken)]/80 backdrop-blur-xl shadow-[0_1px_0_0_rgba(0,0,0,0.06)] dark:shadow-[0_1px_0_0_rgba(255,255,255,0.04)]' : ''
      }`}>
        <nav className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <GraduationCap className="w-7 h-7" />
            <span className="text-lg font-extrabold tracking-tight">SkillUp</span>
          </Link>
          <div className="hidden md:flex items-center bg-gray-100/80 dark:bg-white/5 rounded-full px-1 py-1 border border-gray-200/60 dark:border-white/10">
            {['Features', 'How It Works', 'AI Tools'].map(label => (
              <a key={label} href={`#${label.toLowerCase().replace(/\s+/g, '-')}`}
                className="px-4 py-1.5 rounded-full text-sm font-medium text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-white dark:hover:bg-white/10 transition-all"
              >{label}</a>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <AnimatedThemeToggler className="p-2 rounded-lg text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors" />
            <SignedOut>
              <Link href="/signup?role=mentor" className="hidden sm:inline-flex px-4 py-2 rounded-full text-sm font-semibold text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors">
                For faculty
              </Link>
              <Link href="/signup" className="px-4 py-2 rounded-full text-sm font-semibold bg-[#c8ff00] text-black hover:bg-[#b8ef00] transition-colors shadow-sm">
                Get Started
              </Link>
              <Link href="/signup" className="hidden sm:inline-flex px-4 py-2 rounded-full text-sm font-semibold bg-gray-900 dark:bg-white text-white dark:text-black hover:bg-gray-800 dark:hover:bg-gray-100 transition-colors">
                Sign In
              </Link>
            </SignedOut>
            <SignedIn>
              <Link href={dashLink} className="px-4 py-2 rounded-full text-sm font-semibold bg-[#c8ff00] text-black hover:bg-[#b8ef00] transition-colors">
                Dashboard
              </Link>
              <UserButton afterSignOutUrl="/" appearance={{ elements: { avatarBox: 'w-8 h-8' } }} />
            </SignedIn>
          </div>
        </nav>
      </header>

      {/* ═══════════ HERO ═══════════ */}
      <section className="relative pt-32 pb-28 md:pt-40 md:pb-36">
        {/* Gradient orbs */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="absolute top-20 left-1/4 w-96 h-96 bg-[#c8ff00]/10 dark:bg-[#c8ff00]/5 rounded-full blur-[100px] animate-pulse" />
          <div className="absolute top-40 right-1/4 w-80 h-80 bg-indigo-200/20 dark:bg-indigo-600/5 rounded-full blur-[80px]" />
        </div>

        <div ref={heroTextRef} className="relative z-10 max-w-4xl mx-auto px-6 text-center">
          {/* Badge */}
          <div data-hero-anim className="mb-8">
            <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-gray-900 dark:bg-white/10 text-white dark:text-gray-200 text-xs font-semibold border border-gray-800 dark:border-white/10">
              <span className="w-1.5 h-1.5 rounded-full bg-[#c8ff00] animate-pulse" />
              <AnimatedShinyText className="text-white/90">AI-Powered Career Platform</AnimatedShinyText>
            </span>
          </div>

          {/* Headline */}
          <h1 data-hero-anim className="text-[3.2rem] sm:text-6xl md:text-7xl lg:text-[5.2rem] font-extrabold leading-[1.05] tracking-tight">
            Revolutionizing<br />
            Learning for a{' '}
            <span className="relative inline-block">
              Better
              <svg className="absolute -bottom-2 left-0 w-full" viewBox="0 0 200 12" fill="none">
                <motion.path
                  d="M2 8C50 2 150 2 198 8"
                  stroke="#c8ff00"
                  strokeWidth="4"
                  strokeLinecap="round"
                  initial={{ pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ duration: 1.2, delay: 1, ease: 'easeOut' }}
                />
              </svg>
            </span>
            <br />Career, Today
          </h1>

          {/* Subtitle */}
          <p data-hero-anim className="mt-7 text-lg text-gray-500 dark:text-gray-400 max-w-xl mx-auto leading-relaxed">
            SkillUp leverages cutting-edge AI to enhance your learning journey — personalized
            roadmaps, voice tutoring, mock interviews, and smart job matching. All free.
          </p>

          {/* CTAs */}
          <div data-hero-anim className="mt-9 flex flex-col sm:flex-row items-center justify-center gap-3">
            <SignedOut>
              <Link href="/signup">
                <ShinyButton className="h-12 px-7 bg-[#c8ff00] text-black hover:bg-[#b8ef00] shadow-lg shadow-[#c8ff00]/20">
                  Get Started <ArrowRight className="w-4 h-4" />
                </ShinyButton>
              </Link>
              <a href="#features" className="inline-flex items-center h-12 px-7 rounded-full font-semibold bg-gray-900 dark:bg-white/10 text-white hover:bg-gray-800 dark:hover:bg-white/15 transition-all">
                <Play className="w-3.5 h-3.5 mr-2" /> See Features
              </a>
            </SignedOut>
            <SignedIn>
              <Link href={dashLink}>
                <ShinyButton className="h-12 px-7 bg-[#c8ff00] text-black hover:bg-[#b8ef00] shadow-lg shadow-[#c8ff00]/20">
                  Go to Dashboard <ArrowRight className="w-4 h-4" />
                </ShinyButton>
              </Link>
            </SignedIn>
          </div>

          {/* Trust signals */}
          <div data-hero-anim className="mt-14 flex flex-wrap items-center justify-center gap-6 text-xs font-medium text-gray-400 dark:text-gray-500">
            {[{ icon: Zap, text: 'Free to start' }, { icon: GraduationCap, text: 'AI-powered learning' }, { icon: Sparkles, text: '24/7 voice tutor' }].map((item, i) => (
              <div key={i} className="flex items-center gap-1.5"><item.icon className="w-3.5 h-3.5" /><span>{item.text}</span></div>
            ))}
          </div>
        </div>

        {/* Floating Cards */}
        <div className="relative z-10 max-w-5xl mx-auto px-6 mt-16">
          <div className="flex flex-col md:flex-row items-center justify-center gap-5">
            <motion.div animate={{ y: [0, -8, 0] }} transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
              className="bg-white dark:bg-[var(--soft-surface)] rounded-2xl p-5 shadow-xl shadow-gray-200/40 dark:shadow-black/40 border border-gray-100 dark:border-gray-800/60 w-56"
            >
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 rounded-lg bg-[#c8ff00]/20 flex items-center justify-center"><TrendingUp className="w-4 h-4 text-[#7a9900] dark:text-[#c8ff00]" /></div>
                <span className="text-sm font-bold text-[#7a9900] dark:text-[#c8ff00]">+47.23%</span>
              </div>
              <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Skills Growth</div>
              <div className="text-2xl font-black mt-0.5">6 Tools</div>
              <div className="flex items-center gap-1 mt-1 text-xs font-bold text-emerald-500"><TrendingUp className="w-3 h-3" /> AI-powered</div>
            </motion.div>

            <motion.div animate={{ y: [0, -10, 0] }} transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut', delay: 0.5 }}
              className="bg-gray-900 dark:bg-[var(--soft-surface)] rounded-3xl p-4 shadow-2xl shadow-gray-300/40 dark:shadow-black/60 border border-gray-800 dark:border-gray-700/40 w-72"
            >
              <div className="flex items-center justify-between mb-3">
                <span className="text-[10px] font-bold text-gray-400">9:41</span>
                <div className="w-16 h-4 rounded-full bg-gray-700" />
                <div className="flex gap-1"><div className="w-1 h-1 rounded-full bg-gray-500" /><div className="w-1 h-1 rounded-full bg-gray-500" /></div>
              </div>
              <div className="text-center mb-3"><div className="text-sm font-bold text-white">Learning Dashboard</div></div>
              <div className="flex gap-1 mb-4">
                <div className="px-3 py-1 rounded-full bg-[#c8ff00] text-black text-[10px] font-bold">Roadmap</div>
                <div className="px-3 py-1 rounded-full bg-gray-700 text-gray-300 text-[10px] font-medium">Interview</div>
                <div className="px-3 py-1 rounded-full bg-gray-700 text-gray-300 text-[10px] font-medium">Resume</div>
              </div>
              <div className="space-y-2">
                {[85, 62, 91, 45].map((w, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <div className="w-full bg-gray-700 rounded-full h-2"><div className="bg-[#c8ff00] h-2 rounded-full transition-all duration-1000" style={{ width: `${w}%` }} /></div>
                    <span className="text-[9px] font-bold text-gray-400 w-7">{w}%</span>
                  </div>
                ))}
              </div>
            </motion.div>

            <motion.div animate={{ y: [0, -8, 0] }} transition={{ duration: 4.5, repeat: Infinity, ease: 'easeInOut', delay: 1 }}
              className="bg-white dark:bg-[var(--soft-surface)] rounded-2xl p-5 shadow-xl shadow-gray-200/40 dark:shadow-black/40 border border-gray-100 dark:border-gray-800/60 w-56"
            >
              <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Career Readiness</div>
              <div className="text-2xl font-black mt-0.5">92<span className="text-lg">%</span></div>
              <div className="flex items-center gap-1 mt-1 text-xs font-bold text-emerald-500"><TrendingUp className="w-3 h-3" /> +18.2%</div>
              <div className="mt-3 flex gap-0.5">{[1,2,3,4,5].map(i => <Star key={i} className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />)}</div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ═══════════ STATS ═══════════ */}
      <section ref={statsRef} className="py-14 border-y border-gray-100 dark:border-gray-800/40">
        <div className="max-w-5xl mx-auto px-6 grid grid-cols-2 md:grid-cols-4 gap-6">
          {[
            { value: '6+', label: 'AI Tools', icon: Zap },
            { value: 'MURPH', label: 'Voice Tutor', icon: Mic },
            { value: '∞', label: 'Paths', icon: Route },
            { value: 'Smart', label: 'Job Match', icon: Target },
          ].map((s, i) => (
            <div key={i} data-stat className="flex items-center gap-3 p-4 rounded-xl bg-gray-50 dark:bg-white/[0.03] border border-gray-100 dark:border-gray-800/40">
              <div className="w-10 h-10 rounded-xl bg-gray-900 dark:bg-white/10 flex items-center justify-center shrink-0">
                <s.icon className="w-5 h-5 text-[#c8ff00]" />
              </div>
              <div>
                <div className="text-lg font-black leading-tight">{s.value}</div>
                <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{s.label}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ═══════════ TEXT REVEAL ═══════════ */}
      <section className="py-20 px-6">
        <div className="max-w-4xl mx-auto">
          <TextReveal
            text="SkillUp combines AI-powered learning roadmaps, voice tutoring with MURPH, mock interviews, resume building and DSA practice into one four-year journey, with a companion that takes you from first semester to placements."
            className="text-gray-900 dark:text-white"
          />
        </div>
      </section>

      {/* ═══════════ FEATURES ═══════════ */}
      <section id="features" className="py-24 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <span className="inline-flex items-center gap-2 px-3 py-1 mb-5 rounded-full bg-gray-100 dark:bg-white/5 border border-gray-200/60 dark:border-white/10 text-xs font-semibold text-gray-500 dark:text-gray-400">
              <Sparkles className="w-3 h-3" /> Features
            </span>
            <h2 className="text-4xl md:text-5xl font-extrabold tracking-tight mb-4">
              Everything you need to{' '}
              <span className="relative inline-block">
                level up
                <svg className="absolute -bottom-1 left-0 w-full" viewBox="0 0 150 8" fill="none"><path d="M2 5C40 1 110 1 148 5" stroke="#c8ff00" strokeWidth="3" strokeLinecap="round" /></svg>
              </span>
            </h2>
            <p className="text-gray-500 dark:text-gray-400 max-w-lg mx-auto">From learning to landing — SkillUp covers every step with AI.</p>
          </div>

          <div ref={featuresRef} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {features.map((f, i) => (
              <div key={f.title} data-feature-card>
                <Link href={fHref(f.href)} className="group block h-full">
                  <MagicCard className="h-full p-6 bg-white dark:bg-white/[0.03] border border-gray-100 dark:border-gray-800/40 hover:border-gray-300 dark:hover:border-gray-700 hover:shadow-lg hover:shadow-gray-100/60 dark:hover:shadow-none transition-all duration-300">
                    <div className="w-11 h-11 rounded-xl bg-gray-900 dark:bg-white/10 flex items-center justify-center mb-4 group-hover:bg-[#c8ff00] transition-colors duration-300">
                      <f.icon className="w-5 h-5 text-[#c8ff00] group-hover:text-black transition-colors duration-300" />
                    </div>
                    <h3 className="text-base font-bold mb-1.5">{f.title}</h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">{f.desc}</p>
                    <div className="mt-4 flex items-center gap-1 text-xs font-semibold text-gray-400 group-hover:text-[#7a9900] dark:group-hover:text-[#c8ff00] transition-colors">
                      Learn more <ChevronRight className="w-3 h-3" />
                    </div>
                  </MagicCard>
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════ HOW IT WORKS ═══════════ */}
      <section id="how-it-works" className="py-24 px-6 bg-gray-50/80 dark:bg-white/[0.02] border-y border-gray-100 dark:border-gray-800/30">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-4xl md:text-5xl font-extrabold tracking-tight mb-4">
              Three steps to your{' '}
              <span className="relative inline-block">
                dream career
                <svg className="absolute -bottom-1 left-0 w-full" viewBox="0 0 220 8" fill="none"><path d="M2 5C60 1 160 1 218 5" stroke="#c8ff00" strokeWidth="3" strokeLinecap="round" /></svg>
              </span>
            </h2>
            <p className="text-gray-500 dark:text-gray-400 max-w-lg mx-auto">AI intelligence meets proven learning science.</p>
          </div>

          <div ref={stepsRef} className="grid md:grid-cols-3 gap-5">
            {[
              { num: '01', icon: Route, title: 'Upload & Set Goals', desc: 'Upload your resume or pick a target role. AI analyzes your skills and builds a personalized roadmap.' },
              { num: '02', icon: Mic, title: 'Learn with MURPH', desc: 'Watch curated lessons with MURPH answering your questions, explaining concepts, and controlling video.' },
              { num: '03', icon: Briefcase, title: 'Get Placed', desc: 'Practise DSA and AI mock interviews, build an ATS resume, and track your readiness forecast until placements.' },
            ].map((s, i) => (
              <div key={i} data-step-card>
                <MagicCard className="relative p-7 bg-white dark:bg-white/[0.03] border border-gray-100 dark:border-gray-800/40 hover:shadow-md transition-shadow">
                  <div className="absolute -top-3 left-7 bg-gray-900 dark:bg-white text-white dark:text-black text-[10px] font-black px-3 py-0.5 rounded-full tracking-wider">STEP {s.num}</div>
                  <div className="w-12 h-12 rounded-xl bg-gray-900 dark:bg-white/10 flex items-center justify-center mt-3 mb-5">
                    <s.icon className="w-6 h-6 text-[#c8ff00]" />
                  </div>
                  <h3 className="text-lg font-bold mb-2">{s.title}</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">{s.desc}</p>
                </MagicCard>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════ AI SHOWCASE ═══════════ */}
      <section id="ai-tools" ref={showcaseRef} className="py-24 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-extrabold tracking-tight mb-4">Powered by <span className="text-[#7a9900] dark:text-[#c8ff00]">AI</span></h2>
            <p className="text-gray-500 dark:text-gray-400 max-w-lg mx-auto">Deep dive into the tools that make SkillUp different.</p>
          </div>

          {showcaseItems.map((item, i) => (
            <div key={i} className={`flex flex-col lg:flex-row items-center gap-12 lg:gap-16 mb-24 last:mb-0 ${item.reverse ? 'lg:flex-row-reverse' : ''}`}>
              <div data-showcase-txt className="lg:w-1/2">
                <div className="w-10 h-10 rounded-xl bg-gray-900 dark:bg-white/10 text-[#c8ff00] flex items-center justify-center mb-5">
                  <item.icon className="w-5 h-5" />
                </div>
                <h3 className="text-2xl md:text-3xl font-extrabold mb-4 leading-tight">{item.title}</h3>
                <p className="text-gray-500 dark:text-gray-400 mb-6 leading-relaxed">{item.body}</p>
                <ul className="space-y-2.5">
                  {item.checks.map((check, j) => (
                    <li key={j} className="flex items-center gap-2.5 text-sm font-semibold text-gray-700 dark:text-gray-300">
                      <CheckCircle2 className="w-4 h-4 text-[#7a9900] dark:text-[#c8ff00] shrink-0" />{check}
                    </li>
                  ))}
                </ul>
              </div>
              <div data-showcase-img className="lg:w-1/2 relative">
                <div className="rounded-2xl overflow-hidden shadow-xl shadow-gray-200/40 dark:shadow-none border border-gray-100 dark:border-gray-800/40">
                  <img src={item.image} alt={item.title} className="w-full aspect-video object-cover" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ═══════════ FOR FACULTY ═══════════ */}
      <section id="for-faculty" className="py-24 px-6 bg-gray-50/80 dark:bg-white/[0.02] border-y border-gray-100 dark:border-gray-800/30">
        <div className="max-w-5xl mx-auto grid md:grid-cols-2 gap-10 items-center">
          <div>
            <p className="text-sm font-bold uppercase tracking-wider text-[#7a9900] dark:text-[#c8ff00] mb-3">For faculty</p>
            <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight mb-4">Run your class on SkillUp</h2>
            <p className="text-gray-500 dark:text-gray-400 mb-6 leading-relaxed">
              Create a class, share its join code, and set work that is checked from what students actually do: DSA problems, Practice Lab scores, mock interviews and resume scores. You see who is stuck before results day.
            </p>
            <SignedOut>
              <Link href="/signup?role=mentor" className="inline-flex items-center gap-2 min-h-11 px-6 rounded-full font-semibold bg-gray-900 dark:bg-white text-white dark:text-black hover:bg-gray-800 dark:hover:bg-gray-100 transition-colors">
                Register as faculty <ArrowRight className="w-4 h-4" aria-hidden="true" />
              </Link>
            </SignedOut>
            <SignedIn>
              <Link href={userRole === 'mentor' ? '/mentor' : '/onboarding?role=mentor'} className="inline-flex items-center gap-2 min-h-11 px-6 rounded-full font-semibold bg-gray-900 dark:bg-white text-white dark:text-black hover:bg-gray-800 dark:hover:bg-gray-100 transition-colors">
                {userRole === 'mentor' ? 'Open my classes' : 'Register as faculty'} <ArrowRight className="w-4 h-4" aria-hidden="true" />
              </Link>
            </SignedIn>
          </div>
          <ul className="space-y-3">
            {[
              'Classes with a join code, like Google Classroom',
              'Classwork that marks itself done from student practice',
              'Quizzes you write or draft with AI, auto-graded',
              'Class insights: weakest topics, common mistakes, students at risk',
              'One-click suggestions for what to set next',
            ].map((point) => (
              <li key={point} className="flex items-start gap-2.5 text-sm font-semibold text-gray-700 dark:text-gray-300">
                <CheckCircle2 className="w-4 h-4 mt-0.5 text-[#7a9900] dark:text-[#c8ff00] shrink-0" aria-hidden="true" />{point}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ═══════════ CTA ═══════════ */}
      <section className="py-24 px-6">
        <div className="max-w-4xl mx-auto">
          <div className="bg-gray-900 dark:bg-white/[0.05] rounded-3xl p-10 md:p-16 text-center text-white relative overflow-hidden border border-gray-800 dark:border-gray-800/40">
            <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(circle, #c8ff00 1px, transparent 1px)', backgroundSize: '24px 24px' }} />
            <div className="relative z-10">
              <GraduationCap className="w-10 h-10 mx-auto mb-5 text-[#c8ff00]/40" />
              <h2 className="text-3xl md:text-5xl font-extrabold mb-4 tracking-tight">Ready to level up?</h2>
              <p className="text-gray-400 mb-8 max-w-md mx-auto">Join students who use SkillUp to plan every year from first semester to placements, for free.</p>
              <SignedOut>
                <Link href="/signup">
                  <ShinyButton className="h-13 px-8 bg-[#c8ff00] text-black font-bold text-base shadow-lg shadow-[#c8ff00]/15">
                    Get Started Free <ArrowRight className="w-4 h-4" />
                  </ShinyButton>
                </Link>
              </SignedOut>
              <SignedIn>
                <Link href={dashLink}>
                  <ShinyButton className="h-13 px-8 bg-[#c8ff00] text-black font-bold text-base">
                    Go to Dashboard <ArrowRight className="w-4 h-4" />
                  </ShinyButton>
                </Link>
              </SignedIn>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════ FOOTER ═══════════ */}
      <footer className="py-10 px-6 border-t border-gray-100 dark:border-gray-800/40">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-center gap-6">
          <Link href="/" className="flex items-center gap-2"><GraduationCap className="w-6 h-6" /><span className="text-base font-extrabold">SkillUp</span></Link>
          <div className="text-xs text-gray-400 dark:text-gray-500">© 2026 SkillUp. All rights reserved.</div>
          <div className="flex gap-6 text-xs font-bold text-gray-400 uppercase tracking-wider">
            <a href="#" className="hover:text-gray-900 dark:hover:text-white transition-colors">Privacy</a>
            <a href="#" className="hover:text-gray-900 dark:hover:text-white transition-colors">Terms</a>
            <a href="#" className="hover:text-gray-900 dark:hover:text-white transition-colors">Contact</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
