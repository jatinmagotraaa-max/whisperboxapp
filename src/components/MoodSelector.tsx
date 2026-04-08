'use client';

import { useMood, Mood } from '@/contexts/MoodContext';
import { motion, AnimatePresence } from 'framer-motion';
import React, { useState, useEffect, useRef } from 'react';
import { Palette, Moon, Flame, Heart, TreePine, Flower2 } from 'lucide-react';

const modes: { id: Mood; label: string; icon: any; color: string }[] = [
  { id: 'midnight', label: 'Midnight', icon: Moon, color: 'bg-[#E2E8F0] text-[#020617]' },
  { id: 'vampire', label: 'Vampire', icon: Flame, color: 'bg-red-500 text-white' },
  { id: 'love', label: 'Love', icon: Heart, color: 'bg-rose-400 text-white' },
  { id: 'christmas', label: 'Christmas', icon: TreePine, color: 'bg-emerald-600 text-white' },
  { id: 'sakura', label: 'Sakura', icon: Flower2, color: 'bg-pink-300 text-white' },
];

export default function MoodSelector() {
  const { mood, setMood } = useMood();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  return (
    <div className="relative" ref={containerRef}>
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="w-10 h-10 flex items-center justify-center rounded-2xl bg-primary/[0.03] border border-primary/[0.05] hover:bg-primary/[0.08] text-dimmed hover:text-primary transition-all"
        aria-label="Change Mood"
      >
        <Palette size={18} />
      </button>

      <AnimatePresence>
        {isOpen && (
          <>
            {/* Selection Tray */}
            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.95 }}
              className="absolute top-14 right-0 w-48 bg-surface/95 backdrop-blur-3xl border border-primary/10 rounded-2xl shadow-2xl p-2 z-50 flex flex-col gap-1 origin-top-right"
            >
              <div className="px-3 py-2 border-b border-primary/5 mb-1">
                <span className="text-[10px] uppercase font-bold tracking-widest text-dimmed/80">Set the Vibe</span>
              </div>
              {modes.map((m) => {
                const Icon = m.icon;
                const isActive = mood === m.id;
                return (
                  <button
                    key={m.id}
                    onClick={() => { setMood(m.id); setIsOpen(false); }}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all ${
                      isActive ? 'bg-primary/10' : 'hover:bg-primary/5'
                    }`}
                  >
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center ${isActive ? m.color : 'bg-primary/10 text-primary/50'}`}>
                      <Icon size={12} strokeWidth={isActive ? 3 : 2} />
                    </div>
                    <span className={`text-xs font-semibold tracking-wider ${isActive ? 'text-primary' : 'text-primary/60'}`}>
                      {m.label}
                    </span>
                    {isActive && (
                      <motion.div layoutId="activeMoodDot" className="w-1.5 h-1.5 rounded-full bg-accent ml-auto shadow-[0_0_8px_currentColor]" />
                    )}
                  </button>
                );
              })}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
