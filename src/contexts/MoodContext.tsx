'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';

export type Mood = 'midnight' | 'vampire' | 'love' | 'christmas' | 'sakura';

interface MoodContextType {
  mood: Mood;
  setMood: (mood: Mood) => void;
}

const MoodContext = createContext<MoodContextType | undefined>(undefined);

export function MoodProvider({ children }: { children: React.ReactNode }) {
  const [mood, setMoodState] = useState<Mood>('midnight');

  useEffect(() => {
    // Load from local storage on mount
    const savedMood = localStorage.getItem('whisperbox_mood') as Mood;
    if (savedMood) {
      setMoodState(savedMood);
      document.body.setAttribute('data-mood', savedMood);
    } else {
      document.body.setAttribute('data-mood', 'midnight');
    }
  }, []);

  const setMood = (newMood: Mood) => {
    setMoodState(newMood);
    localStorage.setItem('whisperbox_mood', newMood);
    document.body.setAttribute('data-mood', newMood);
    
    // Slight haptic feedback on mood change
    if (typeof window !== 'undefined' && window.navigator && window.navigator.vibrate) {
      try {
        window.navigator.vibrate(15);
      } catch (e) {}
    }
  };

  return (
    <MoodContext.Provider value={{ mood, setMood }}>
      {children}
    </MoodContext.Provider>
  );
}

export function useMood() {
  const context = useContext(MoodContext);
  if (context === undefined) {
    throw new Error('useMood must be used within a MoodProvider');
  }
  return context;
}
