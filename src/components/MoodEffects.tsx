'use client';

import { useMood } from '@/contexts/MoodContext';
import { motion, AnimatePresence } from 'framer-motion';
import { useEffect, useState } from 'react';

// --- Sakura Petal Effect ---
function SakuraParticles() {
  const [petals, setPetals] = useState<any[]>([]);

  useEffect(() => {
    // Generate petals once on mount
    const p = Array.from({ length: 25 }).map((_, i) => ({
      id: i,
      x: Math.random() * 100, // starting viewport width %
      delay: Math.random() * 5,
      duration: 10 + Math.random() * 10,
      size: 5 + Math.random() * 10,
    }));
    setPetals(p);
  }, []);

  return (
    <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
      {petals.map((petal) => (
        <motion.div
          key={petal.id}
          initial={{ y: -50, x: `${petal.x}vw`, opacity: 0, rotate: 0 }}
          animate={{
            y: '100vh',
            x: `${petal.x + (Math.random() * 20 - 10)}vw`,
            opacity: [0, 1, 1, 0],
            rotate: 360,
          }}
          transition={{
            duration: petal.duration,
            repeat: Infinity,
            delay: petal.delay,
            ease: 'linear',
          }}
          className="absolute bg-pink-200/40 rounded-full"
          style={{
            width: petal.size,
            height: petal.size * 1.5,
            borderBottomRightRadius: '0px',
            filter: 'blur(1px)',
          }}
        />
      ))}
    </div>
  );
}

// --- Main orchestrator ---
export default function MoodEffects() {
  const { mood } = useMood();
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);
  if (!mounted) return null;

  return (
    <AnimatePresence>
      {mood === 'sakura' && <SakuraParticles key="sakura" />}
    </AnimatePresence>
  );
}
