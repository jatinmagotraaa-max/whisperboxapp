import { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Whisper Box',
};

export default function HomePage() {
  return (
    <main className="min-h-screen relative overflow-hidden flex flex-col items-center justify-center p-6">
      {/* Background Orbs */}
      <div className="absolute top-[-10%] left-[-10%] w-[40vw] h-[40vw] rounded-full bg-accent/5 blur-[120px]" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[30vw] h-[30vw] rounded-full bg-white/5 blur-[100px]" />
      
      <div className="z-10 flex flex-col items-center text-center space-y-8 max-w-3xl glass-panel p-12 rounded-3xl relative overflow-hidden">
        {/* Subtle highlight border inside the panel */}
        <div className="absolute inset-0 border border-white/10 rounded-3xl pointer-events-none" />
        
        <div className="space-y-4 relative">
          <p className="text-accent uppercase tracking-[0.3em] text-sm font-semibold">
            Unfiltered • Unseen
          </p>
          <h1 className="font-display text-6xl md:text-8xl tracking-tight text-white mb-6">
            Whisper<span className="text-glow text-accent italic">Box</span>
          </h1>
          <p className="text-dimmed text-lg md:text-xl font-light leading-relaxed max-w-xl mx-auto">
            A sanctuary for your thoughts. Share securely, interact anonymously, and converse elegantly within intimate communities.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-6 mt-12 w-full justify-center">
          <Link
            href="/feed"
            className="group relative px-8 py-4 bg-accent text-background font-semibold rounded-full overflow-hidden transition-all hover:scale-105 active:scale-95"
          >
            <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300 ease-out" />
            <span className="relative z-10">Enter the Void</span>
          </Link>


          <Link
            href="/auth/register"
            className="px-8 py-4 text-white font-medium hover:text-accent transition-colors"
          >
            Join anonymously &rarr;
          </Link>
        </div>
      </div>
      
      {/* Floating AI Advice button mocking */}
      <div className="fixed bottom-8 right-8 glass-panel px-6 py-4 rounded-full flex items-center gap-3 cursor-pointer hover:bg-white/5 transition-colors border border-accent/20 hover:border-accent">
        <div className="w-3 h-3 rounded-full bg-accent animate-pulse" />
        <span className="text-sm font-medium tracking-wide">Ask Grok</span>
      </div>
    </main>
  );
}
