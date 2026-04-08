'use client';

import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Heart, 
  Home, 
  Ghost, 
  Brain, 
  Layers, 
  User, 
  Bell, 
  Hash,
  Sparkles,
  Pencil
} from 'lucide-react';
import { supabase, type Confession, type Comment, saveOwnership, checkOwnership, removeOwnership } from '@/lib/supabase';
import MoodSelector from '@/components/MoodSelector';

const MAX_CHARS = 500;

// Replicate Apple UIImpactFeedbackGenerator safely on web
const triggerHaptic = (style: 'light' | 'medium' | 'success' | 'error') => {
  if (typeof window !== 'undefined' && window.navigator && window.navigator.vibrate) {
    try {
      switch(style) {
        case 'light': window.navigator.vibrate(10); break;
        case 'medium': window.navigator.vibrate(20); break;
        case 'success': window.navigator.vibrate([15, 60, 20]); break;
        case 'error': window.navigator.vibrate([30, 40, 30, 40, 30]); break;
      }
    } catch (e) {}
  }
};

export default function FeedPage() {
  const [confessions, setConfessions] = useState<Confession[]>([]);
  const [loading, setLoading] = useState(true);
  const [isComposeOpen, setIsComposeOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [showOnlyMine, setShowOnlyMine] = useState(false);

  // Load persistent filter states on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedMine = localStorage.getItem('whisper_box_filter_mine');
      if (savedMine === 'true') setShowOnlyMine(true);
      
      const savedCat = localStorage.getItem('whisper_box_filter_cat');
      if (savedCat) setSelectedCategory(savedCat);
    }
  }, []);

  // Save filter states when they change
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('whisper_box_filter_mine', showOnlyMine.toString());
      localStorage.setItem('whisper_box_filter_cat', selectedCategory);
    }
  }, [showOnlyMine, selectedCategory]);

  const [notifications, setNotifications] = useState<any[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  // Queue for new incoming confessions — shown as a banner instead of auto-injecting
  const [pendingConfessions, setPendingConfessions] = useState<Confession[]>([]);
  const confessionsRef = useRef<Confession[]>([]);

  const categories = ['All', 'General', 'Love', 'Family', 'Vent', 'Mental Health', 'Other'];

  // Fetch confessions
  const fetchConfessions = async () => {
    setLoading(true);
    let query = supabase.from('confessions').select('*');
    
    if (showOnlyMine) {
      if (typeof window !== 'undefined') {
        let owned: string[] = [];
        try {
          const raw = localStorage.getItem('whisper_box_owned_ids');
          owned = JSON.parse(raw || '[]');
          if (!Array.isArray(owned)) owned = [];
        } catch (e) {
          owned = [];
        }
        
        if (owned.length > 0) {
          query = query.in('id', owned);
        } else {
          setConfessions([]);
          confessionsRef.current = [];
          setLoading(false);
          return;
        }
      }
    } else if (selectedCategory !== 'All') {
      query = query.eq('category', selectedCategory);
    }

    const { data, error } = await query.order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching confessions:', error.message);
    } else if (data) {
      setConfessions(data);
      confessionsRef.current = data;
    }
    setPendingConfessions([]);
    setLoading(false);
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from('confessions').delete().eq('id', id);
    if (!error) {
      setConfessions(prev => prev.filter(c => c.id !== id));
      removeOwnership(id);
      triggerHaptic('medium');
    } else {
      console.error('Delete failed:', error);
      alert('Deletion failed: ' + (error.message || 'Check your Supabase permissions.'));
      triggerHaptic('error');
    }
  };

  const fetchNotifications = async () => {
    if (typeof window === 'undefined') return;
    const owned = JSON.parse(localStorage.getItem('whisper_box_owned_ids') || '[]');
    if (owned.length === 0) return;

    const { data } = await supabase
      .from('notifications')
      .select('*')
      .in('target_post_id', owned)
      .order('created_at', { ascending: false })
      .limit(20);
    
    if (data) setNotifications(data);
  };

  useEffect(() => {
    fetchConfessions();
    fetchNotifications();

    // Subscribe to new notifications
    const notifChannel = supabase
      .channel('schema-db-changes')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications' }, () => {
         fetchNotifications();
      })
      .subscribe();

    // Subscribe to new confessions — queue them silently, don't auto-inject
    const confChannel = supabase
      .channel('new-confessions')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'confessions' }, (payload) => {
        const newConf = payload.new as Confession;
        // Skip if it already exists in the current feed (e.g. our own post we just submitted)
        if (confessionsRef.current.some(c => c.id === newConf.id)) return;
        // Skip if a category filter is active and it doesn't match
        if (selectedCategory !== 'All' && newConf.category !== selectedCategory) return;
        // Skip in "My Secrets" mode
        if (showOnlyMine) return;
        // Queue it — show banner instead of injecting
        setPendingConfessions(prev => {
          if (prev.some(c => c.id === newConf.id)) return prev;
          return [newConf, ...prev];
        });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(notifChannel);
      supabase.removeChannel(confChannel);
    };
  }, [selectedCategory, showOnlyMine]);

  const notifRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(event.target as Node)) {
        setShowNotifications(false);
      }
    }
    if (showNotifications) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showNotifications]);

  const handleNewConfession = (newPost?: Confession) => {
    // Silently prepend our own new post instead of refetching (avoids scroll jump)
    if (newPost) {
      setConfessions(prev => {
        const updated = [newPost, ...prev.filter(c => c.id !== newPost.id)];
        confessionsRef.current = updated;
        return updated;
      });
    } else {
      fetchConfessions();
    }
    setTimeout(() => setIsComposeOpen(false), 1500);
  };

  // Load pending confessions into the feed when user taps the banner
  const loadPendingConfessions = () => {
    setConfessions(prev => {
      const merged = [...pendingConfessions.filter(p => !prev.some(c => c.id === p.id)), ...prev];
      confessionsRef.current = merged;
      return merged;
    });
    setPendingConfessions([]);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen relative flex flex-col items-center pb-32">
      
      {/* Floating Action Button (Apple Liquid Glass Style) */}
      {!isComposeOpen && (
         <FloatingActionButton onCompose={() => { triggerHaptic('medium'); setIsComposeOpen(true); }} />
      )}

      {isComposeOpen && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/95 backdrop-blur-md transition-all"
          onClick={() => setIsComposeOpen(false)}
        >
           <div 
             className="w-full max-w-2xl bg-surface/40 p-6 md:p-8 rounded-3xl border border-white/5 shadow-2xl relative animate-in fade-in zoom-in duration-200"
             onClick={(e) => e.stopPropagation()}
           >
              <button 
                onClick={() => { triggerHaptic('light'); setIsComposeOpen(false); }}
                className="absolute top-5 right-5 z-20 w-10 h-10 flex items-center justify-center rounded-full bg-primary/10 hover:bg-primary/20 text-primary/70 hover:text-primary transition-all shadow-lg backdrop-blur-sm"
                aria-label="Close"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
              </button>
              <ConfessionInput onConfess={handleNewConfession} />
           </div>
        </div>
      )}

      {/* ── Premium Nav Bar ── */}
      <header className="fixed top-0 left-0 right-0 z-40 pt-4 md:pt-8 pb-4 bg-background/95 backdrop-blur-[40px] border-b border-primary/[0.03] safe-area-inset-top">
        <div className="flex items-center justify-between w-full max-w-5xl px-4 md:px-8 mx-auto">
          <div className="flex flex-col">
            <h1 className="font-display text-xl md:text-2xl tracking-tighter font-bold text-primary/95">
              WhisperBox
            </h1>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
              <span className="text-[9px] md:text-[10px] text-primary/30 uppercase tracking-[0.3em] font-bold">Safe Space</span>
            </div>
          </div>

          <div className="flex items-center gap-2 md:gap-4">
            <button
               onClick={() => { triggerHaptic('medium'); setShowOnlyMine(!showOnlyMine); if (!showOnlyMine) setSelectedCategory('All'); }}
               className={`relative h-9 md:h-10 px-3 md:px-5 rounded-xl md:rounded-2xl flex items-center gap-2 transition-all duration-500 overflow-hidden ${
                 showOnlyMine 
                   ? 'text-accent shadow-[0_0_20px_rgba(212,175,55,0.15)] bg-accent/10 border border-accent/30' 
                   : 'text-dimmed hover:text-primary/80 bg-primary/[0.03] border border-primary/[0.05] hover:bg-primary/[0.08]'
               }`}
            >
              <User size={14} strokeWidth={showOnlyMine ? 3 : 2} />
              <span className="hidden md:inline text-[11px] font-bold tracking-widest uppercase">My Secrets</span>
              {showOnlyMine && <span className="md:hidden text-[10px] font-bold uppercase">Mine</span>}
            </button>

            <MoodSelector />

            <div className="relative" ref={notifRef}>
               <button 
                 onClick={() => { triggerHaptic('light'); setShowNotifications(!showNotifications); }}
                 className="w-10 h-10 flex items-center justify-center rounded-2xl bg-primary/[0.03] border border-primary/[0.05] hover:bg-primary/[0.08] text-dimmed hover:text-primary transition-all relative"
               >
                 <Bell size={18} className={notifications.some(n => !n.is_read) ? 'animate-bounce text-accent' : ''} />
                 {notifications.some(n => !n.is_read) && (
                   <span className="absolute top-2.5 right-2.5 w-1.5 h-1.5 bg-rose-500 rounded-full shadow-[0_0_8px_rgba(244,63,94,0.6)]" />
                 )}
               </button>

               <AnimatePresence>
                 {showNotifications && (
                     <motion.div 
                     initial={{ opacity: 0, y: 10, scale: 0.95 }}
                     animate={{ opacity: 1, y: 0, scale: 1 }}
                     exit={{ opacity: 0, y: 10, scale: 0.95 }}
                     className="absolute top-14 right-0 w-80 bg-surface/95 backdrop-blur-3xl border border-primary/10 rounded-[28px] shadow-2xl overflow-hidden z-50 origin-top-right"
                   >
                      <div className="p-5 border-b border-primary/5 flex justify-between items-center bg-primary/[0.02]">
                        <span className="text-[10px] font-bold tracking-widest uppercase text-primary/40">Activity Feed</span>
                        <button 
                          onClick={async () => {
                             const owned = JSON.parse(localStorage.getItem('whisper_box_owned_ids') || '[]');
                             await supabase.from('notifications').update({ is_read: true }).in('target_post_id', owned);
                             fetchNotifications();
                          }}
                          className="text-[10px] text-accent font-bold hover:text-white uppercase tracking-widest transition-colors"
                        >
                          Clear
                        </button>
                      </div>
                      <div className="max-h-80 overflow-y-auto no-scrollbar py-2">
                        {notifications.length === 0 ? (
                          <div className="p-12 text-center flex flex-col items-center gap-3">
                            <Ghost size={24} className="text-white/10" />
                            <span className="text-[11px] text-white/20 italic font-medium">Silent for now.</span>
                          </div>
                        ) : (
                          notifications.map(n => (
                            <div key={n.id} className={`px-5 py-4 border-b border-white/5 last:border-0 hover:bg-white/[0.03] transition-colors relative cursor-pointer ${!n.is_read ? 'bg-accent/[0.02]' : ''}`}>
                              {!n.is_read && <div className="absolute left-0 top-0 bottom-0 w-1 bg-accent/40" />}
                              <p className="text-[13px] text-white/70 leading-relaxed font-light">{n.content}</p>
                              <span className="text-[9px] text-white/20 mt-1.5 block tracking-widest uppercase">{new Date(n.current_at || n.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                            </div>
                          ))
                        )}
                      </div>
                   </motion.div>
                 )}
               </AnimatePresence>
            </div>
          </div>
        </div>
        {/* Genre Pill Selection Bar */}
        <div className="mt-4 md:mt-8 px-4 w-full max-w-5xl mx-auto flex items-center justify-start md:justify-center relative overflow-hidden group">
          {/* Faded scroll edges for mobile */}
          <div className="absolute left-4 top-0 bottom-0 w-8 bg-gradient-to-r from-[#020617] to-transparent z-10 pointer-events-none md:hidden opacity-0 group-hover:opacity-100 transition-opacity" />
          <div className="absolute right-4 top-0 bottom-0 w-8 bg-gradient-to-l from-[#020617] to-transparent z-10 pointer-events-none md:hidden opacity-0 group-hover:opacity-100 transition-opacity" />
          
          <div className="bg-white/[0.03] p-1 rounded-[22px] md:rounded-[26px] border border-white/[0.05] flex items-center gap-1 overflow-x-auto no-scrollbar shadow-inner backdrop-blur-md w-full md:w-auto">
            {[
              { id: 'All', icon: <Hash size={12}/> },
              { id: 'General', icon: <Sparkles size={12}/> },
              { id: 'Love', icon: <Heart size={12}/> },
              { id: 'Family', icon: <Home size={12}/> },
              { id: 'Vent', icon: <Ghost size={12}/> },
              { id: 'Mental Health', icon: <Brain size={12}/> },
              { id: 'Other', icon: <Layers size={12}/> }
            ].map((cat) => (
              <button
                key={cat.id}
                onClick={() => { 
                  triggerHaptic('light'); 
                  setSelectedCategory(cat.id); 
                  setShowOnlyMine(false); 
                }}
                className={`flex-shrink-0 relative px-4 md:px-5 py-2 md:py-2.5 rounded-[18px] md:rounded-[20px] text-[10px] md:text-[11px] font-bold tracking-[0.1em] uppercase transition-all duration-500 flex items-center gap-2 outline-none group ${
                  selectedCategory === cat.id && !showOnlyMine ? 'text-background' : 'text-primary/40 hover:text-primary/70'
                }`}
              >
                {selectedCategory === cat.id && !showOnlyMine && (
                  <motion.div
                    layoutId="pill"
                    className="absolute inset-0 bg-accent rounded-[18px] md:rounded-[20px] shadow-[0_4px_20px_rgba(212,175,55,0.4)]"
                    transition={{ type: 'spring', bounce: 0.25, duration: 0.5 }}
                  />
                )}
                <span className="relative z-10 flex items-center gap-2">
                  {cat.icon}
                  {cat.id}
                </span>
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* Spacer */}
      <div className="h-[170px] md:h-[210px] w-full" />

      <div className="z-10 w-full max-w-3xl relative px-4 md:px-8">
        
        {/* ── Feed Content ── */}
        <div className="pt-0 md:pt-2 px-4 md:px-0 flex flex-col space-y-6">
          <AnimatePresence>
            {pendingConfessions.length > 0 && !loading && (
              <motion.div
                initial={{ opacity: 0, y: -20, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="sticky top-28 z-30 flex justify-center w-full"
              >
                <button
                  onClick={() => { triggerHaptic('success'); loadPendingConfessions(); }}
                  className="bg-accent/90 backdrop-blur-md text-[#020617] px-6 py-2 rounded-full shadow-[0_0_20px_rgba(212,175,55,0.4)] font-bold text-xs uppercase tracking-widest flex items-center gap-2 hover:scale-105 active:scale-95 transition-all"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 19V5M5 12l7-7 7 7"/></svg>
                  {pendingConfessions.length} New Whisper{pendingConfessions.length > 1 ? 's' : ''}
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {loading ? (
            <div className="flex justify-center p-12">
              <svg className="animate-spin text-accent" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <circle cx="12" cy="12" r="10" strokeOpacity="0.2" />
                <path d="M12 2a10 10 0 0 1 10 10" />
              </svg>
            </div>
          ) : confessions.length === 0 ? (
            <div className="glass-panel p-10 rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.12)] text-center relative overflow-hidden">
              <div className="absolute inset-0 border border-primary/5 rounded-2xl pointer-events-none" />
              <p className="text-dimmed">The space is empty. Be the first to whisper.</p>
            </div>
          ) : (
            confessions.map((confession, i) => (
              <div 
                key={confession.id} 
                className="animate-in fade-in slide-in-from-bottom-4 duration-500 fill-mode-both"
                style={{ animationDelay: `${i * 50}ms` }}
              >
                <ConfessionCard 
                  confession={confession} 
                  onDelete={() => handleDelete(confession.id)}
                  onEdit={(id, newText, newCategory) => {
                    setConfessions(prev => prev.map(c => 
                      c.id === id ? { ...c, text: newText, category: newCategory } : c
                    ));
                  }}
                />
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function ConfessionInput({ onConfess }: { onConfess: (newPost?: Confession) => void }) {
  const [text, setText] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [focused, setFocused] = useState(false);
  const [shaking, setShaking] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!textareaRef.current) return;
    textareaRef.current.style.height = 'auto';
    textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
  }, [text]);

  const remaining = MAX_CHARS - text.length;
  const isOverLimit = remaining < 0;
  const isEmpty = text.trim().length === 0;

  const [category, setCategory] = useState('General');
  const categories = ['General', 'Love', 'Family', 'Vent', 'Mental Health', 'Other'];

  async function handleSubmit() {
    if (isEmpty) {
      setShaking(true);
      setTimeout(() => setShaking(false), 600);
      textareaRef.current?.focus();
      return;
    }
    if (isOverLimit) return;
    setStatus('loading');

    const { data, error } = await supabase.from('confessions').insert({ 
      text: text.trim(),
      category: category 
    }).select().single();

    if (error) {
      setStatus('error');
      triggerHaptic('error');
    } else {
      if (data?.id) saveOwnership(data.id);
      setText('');
      setStatus('success');
      triggerHaptic('success');
      onConfess(data as Confession);
      
      // Auto-reset success state
      setTimeout(() => setStatus('idle'), 3000);
    }
  }

  return (
    <div
      className={`glass-panel p-6 md:p-8 rounded-3xl relative overflow-hidden transition-all duration-300 ${shaking ? 'animate-shake' : ''}`}
      style={{ boxShadow: focused ? '0 0 40px rgba(212,175,55,0.06)' : 'none' }}
    >
      <div className="absolute inset-0 border border-primary/5 rounded-3xl pointer-events-none" />
      <div
        className="absolute inset-0 transition-opacity duration-500 pointer-events-none rounded-3xl"
        style={{
          background: focused ? 'linear-gradient(135deg, rgba(212,175,55,0.03) 0%, transparent 40%)' : 'transparent',
        }}
      />
      
      {status === 'success' ? (
        <div className="flex flex-col items-center justify-center py-10 animate-in fade-in zoom-in duration-300">
          <div className="w-16 h-16 rounded-full border-2 border-accent/50 flex items-center justify-center mb-4">
             <svg width="32" height="32" viewBox="0 0 24 24" fill="none" className="text-accent" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
               <polyline points="20 6 9 17 4 12" />
             </svg>
          </div>
          <p className="text-primary font-medium text-lg">Safely whispered.</p>
        </div>
      ) : (
        <>
          <h2 className="text-xl md:text-2xl font-light text-primary mb-6 pt-2 tracking-wide pr-8">
            Tell the world your secret.
          </h2>

          <div className="flex flex-wrap gap-2 mb-6">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => { triggerHaptic('light'); setCategory(cat); }}
                className={`px-4 py-1.5 rounded-full text-xs font-semibold tracking-wider uppercase transition-all duration-300 border ${
                  category === cat 
                    ? 'bg-accent text-background border-accent' 
                    : 'bg-primary/5 text-dimmed/60 border-primary/5 hover:border-primary/10 hover:bg-primary/10'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder="Start typing..."
            rows={5}
            disabled={status === 'loading'}
            className="w-full resize-none bg-transparent text-primary placeholder-dimmed/40 text-lg md:text-xl font-light outline-none disabled:opacity-50 min-h-[120px]"
            id="confession-textarea"
          />
          <div className="flex items-center justify-between mt-4 pt-4 border-t border-primary/5">
            <span className={`text-xs ${isOverLimit ? 'text-red-400' : 'text-dimmed'}`}>
              {remaining < 0 ? `${Math.abs(remaining)} over limit` : `${remaining} left`}
            </span>
            <div className="flex items-center gap-3">
              {status === 'error' && <span className="text-red-400 text-xs">Failed to send.</span>}
              <button
                id="submit-confession-btn"
                onClick={() => { triggerHaptic('medium'); handleSubmit(); }}
                disabled={isOverLimit || status === 'loading'}
                className="px-6 py-2 rounded-full bg-accent text-background font-semibold text-sm transition-all hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed select-none flex items-center gap-2"
              >
                {status === 'loading' ? 'Sending...' : 'Whisper Secret'}
              </button>
            </div>
          </div>
        </>
      )}
      
      <style jsx global>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          15%       { transform: translateX(-4px); }
          30%       { transform: translateX(4px); }
          45%       { transform: translateX(-2px); }
          60%       { transform: translateX(2px); }
        }
        .animate-shake { animation: shake 0.4s ease; }
      `}</style>
    </div>
  );
}

function ConfessionCard({ 
  confession, 
  onDelete,
  onEdit 
}: { 
  confession: Confession; 
  onDelete: () => Promise<void>;
  onEdit: (id: string, newText: string, newCategory: string) => void;
}) {
  const [advice, setAdvice] = useState<string | null>(null);
  const [loadingAdvice, setLoadingAdvice] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Reaction states
  const [likes, setLikes] = useState(confession.likes || 0);
  const [hasLiked, setHasLiked] = useState(() => {
    if (typeof window === 'undefined') return false;
    try {
      const liked = JSON.parse(localStorage.getItem('whisper_box_liked_ids') || '[]');
      return Array.isArray(liked) && liked.includes(confession.id);
    } catch { return false; }
  });

  // Comment states
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentCount, setCommentCount] = useState<number | null>(null);
  const [showComments, setShowComments] = useState(false);
  const [commentInput, setCommentInput] = useState('');
  const [loadingComments, setLoadingComments] = useState(false);
  const [sendingComment, setSendingComment] = useState(false);
  const [reported, setReported] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [isOwner, setIsOwner] = useState(false);

  // Edit states
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(confession.text);
  const [editCategory, setEditCategory] = useState(confession.category || 'General');
  const [saving, setSaving] = useState(false);
  const editTextareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setIsOwner(checkOwnership(confession.id));
    // Fetch comment count on mount so it's always visible
    supabase
      .from('comments')
      .select('id', { count: 'exact', head: true })
      .eq('confession_id', confession.id)
      .then(({ count }) => setCommentCount(count ?? 0));
  }, [confession.id]);


  // Auto-resize edit textarea
  useEffect(() => {
    if (!editTextareaRef.current) return;
    editTextareaRef.current.style.height = 'auto';
    editTextareaRef.current.style.height = `${editTextareaRef.current.scrollHeight}px`;
  }, [editText, isEditing]);

  const handleEdit = async () => {
    if (!editText.trim() || (editText.trim() === confession.text && editCategory === (confession.category || 'General'))) {
      setIsEditing(false);
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from('confessions')
      .update({ text: editText.trim(), category: editCategory })
      .eq('id', confession.id);
    
    if (!error) {
      onEdit(confession.id, editText.trim(), editCategory);
      triggerHaptic('success');
      setIsEditing(false);
    } else {
      console.error('Edit failed:', error);
      alert('Edit failed: ' + error.message);
      triggerHaptic('error');
    }
    setSaving(false);
  };

  const handleGetAdvice = async () => {
    triggerHaptic('light');
    setLoadingAdvice(true);
    setError(null);
    try {
      const res = await fetch('/api/advice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: confession.text }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to get advice');
      setAdvice(data.advice);
      triggerHaptic('success');
    } catch (err: any) {
      setError(err.message);
      triggerHaptic('error');
    } finally {
      setLoadingAdvice(false);
    }
  };

  const handleLike = async () => {
    triggerHaptic('light');
    const newHasLiked = !hasLiked;
    
    // Compute next value from current local state (no DB round-trip first)
    const newLikeCount = newHasLiked ? likes + 1 : Math.max(0, likes - 1);

    // Optimistic UI Update — apply immediately
    setHasLiked(newHasLiked);
    setLikes(newLikeCount);

    // Persist like state in localStorage
    try {
      const raw = localStorage.getItem('whisper_box_liked_ids');
      const liked: string[] = JSON.parse(raw || '[]');
      const updated = newHasLiked
        ? [...liked.filter(i => i !== confession.id), confession.id]
        : liked.filter(i => i !== confession.id);
      localStorage.setItem('whisper_box_liked_ids', JSON.stringify(updated));
    } catch {}

    // Sync to DB
    const { error } = await supabase
      .from('confessions')
      .update({ likes: newLikeCount })
      .eq('id', confession.id);

    if (error) {
      console.error('Like DB update failed:', error.message);
      // Rollback UI on failure
      setHasLiked(hasLiked);
      setLikes(likes);
      return;
    }

    // Fire notification for post owner (non-blocking)
    if (newHasLiked && !checkOwnership(confession.id)) {
      supabase.from('notifications').insert({
        target_post_id: confession.id,
        type: 'like',
        content: `Someone liked your whisper: "${confession.text.substring(0, 30)}..."`
      }).then(() => {});
    }
  };

  const fetchComments = async () => {
    setLoadingComments(true);
    const { data } = await supabase
      .from('comments')
      .select('*')
      .eq('confession_id', confession.id)
      .order('created_at', { ascending: true });
    
    if (data) {
      const decodedComments = data.map(c => {
        if (c.text.startsWith('PARENT::')) {
          const parts = c.text.split('::');
          return { ...c, parent_comment_id: parts[1], text: parts.slice(2).join('::') };
        }
        return c;
      });
      setComments(decodedComments as Comment[]);
    }
    setLoadingComments(false);
  };

  const toggleComments = () => {
    if (!showComments && comments.length === 0) {
      fetchComments();
    }
    setShowComments(!showComments);
  };

  const handlePostComment = async () => {
    if (!commentInput.trim()) return;
    setSendingComment(true);
    
    const { data, error } = await supabase
      .from('comments')
      .insert({ confession_id: confession.id, text: commentInput.trim() })
      .select().single();
    
    if (!error) {
      if (data?.id) saveOwnership(data.id);
      setCommentInput('');
      fetchComments(); // refresh list
      setCommentCount(prev => (prev ?? 0) + 1); // update badge count
      
      // Notify parent owner
      if (!checkOwnership(confession.id)) {
        await supabase.from('notifications').insert({
          target_post_id: confession.id,
          type: 'comment',
          content: `New response to your whisper: "${commentInput.substring(0, 30)}..."`
        });
      }
    } else {
      console.error('Failed to post comment', error);
      alert('Failed to send: ' + error.message);
    }
    setSendingComment(false);
  };

  const handleReport = () => {
    triggerHaptic('light');
    setReported(true);
    setTimeout(() => setReported(false), 2000);
  };

  async function handleConfirmDelete() {
    if (confirm("Are you sure you want to delete this whisper? It will be gone forever.")) {
      try {
        setDeleting(true);
        await onDelete();
      } catch (err: any) {
        console.error('Confirm delete error:', err);
      } finally {
        setDeleting(false);
      }
    }
  }

  const getCategoryStyles = (cat?: string) => {
    switch (cat) {
      case 'Love': return { border: 'border-rose-500/20', bg: 'bg-rose-500/5', text: 'text-rose-400', glow: 'shadow-[0_8px_32px_rgba(244,63,94,0.1)]' };
      case 'Family': return { border: 'border-emerald-500/20', bg: 'bg-emerald-500/5', text: 'text-emerald-400', glow: 'shadow-[0_8px_32px_rgba(16,185,129,0.1)]' };
      case 'Vent': return { border: 'border-purple-500/20', bg: 'bg-purple-500/5', text: 'text-purple-400', glow: 'shadow-[0_8px_32px_rgba(168,85,247,0.1)]' };
      case 'Mental Health': return { border: 'border-cyan-500/20', bg: 'bg-cyan-500/5', text: 'text-cyan-400', glow: 'shadow-[0_8px_32px_rgba(6,182,212,0.1)]' };
      case 'Other': return { border: 'border-slate-500/20', bg: 'bg-slate-500/5', text: 'text-slate-400', glow: 'shadow-[0_8px_32px_rgba(100,116,139,0.1)]' };
      default: return { border: 'border-primary/5', bg: 'bg-primary/5', text: 'text-accent', glow: 'shadow-[0_8px_32px_rgba(0,0,0,0.2)]' };
    }
  };

  const styles = getCategoryStyles(confession.category);

  return (
    <article className={`glass-panel p-6 md:p-8 rounded-3xl flex flex-col space-y-4 relative overflow-hidden group transition-all duration-500 hover:bg-primary/[0.08] ${styles.border} ${styles.glow}`}>
      <div className={`absolute inset-0 border rounded-3xl pointer-events-none transition-colors duration-500 group-hover:border-primary/20 ${styles.border}`} />
      <div className={`absolute inset-0 opaicty-20 pointer-events-none ${styles.bg}`} />
      
      {/* Meta details */}
      <div className="flex items-center justify-between z-10">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full animate-pulse ${styles.text.replace('text-', 'bg-')}`} />
            <span className={`text-xs uppercase tracking-[0.2em] font-bold ${styles.text}`}>
              {confession.category || 'General'}
            </span>
          </div>
          <span className="text-[10px] text-dimmed/40 pl-4 uppercase tracking-widest">
            {new Date(confession.created_at).toLocaleString(undefined, {
              month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
            })}
          </span>
        </div>
        <div className="text-[10px] text-dimmed/20 font-bold tracking-tighter">ANONYMOUS</div>
      </div>
      
      {/* Confession body */}
      {isEditing ? (
        <div className="pl-4 border-l-2 border-accent/30 mt-2 z-10 animate-in fade-in duration-200">
          {/* Category picker inside edit mode */}
          <div className="flex flex-wrap gap-2 mb-4">
            {['General', 'Love', 'Family', 'Vent', 'Mental Health', 'Other'].map((cat) => (
              <button
                key={cat}
                onClick={() => { triggerHaptic('light'); setEditCategory(cat); }}
                className={`px-3 py-1 rounded-full text-[10px] font-bold tracking-wider uppercase transition-all duration-300 border ${
                  editCategory === cat 
                    ? 'bg-accent text-background border-accent shadow-[0_0_12px_rgba(212,175,55,0.3)]' 
                    : 'bg-white/5 text-dimmed/60 border-white/5 hover:border-white/10 hover:bg-white/10'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
          <textarea
            ref={editTextareaRef}
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            rows={4}
            maxLength={500}
            autoFocus
            className="w-full resize-none bg-transparent text-primary/95 text-lg md:text-xl font-light leading-relaxed outline-none min-h-[100px] placeholder-dimmed/30"
            placeholder="Edit your whisper..."
          />
          <div className="flex items-center justify-between mt-3 pt-3 border-t border-white/5">
            <span className={`text-xs ${
              editText.length > 500 ? 'text-red-400' : 'text-dimmed/40'
            }`}>
              {500 - editText.length} left
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => { setEditText(confession.text); setEditCategory(confession.category || 'General'); setIsEditing(false); }}
                className="px-4 py-1.5 rounded-full text-xs font-bold text-dimmed hover:text-white border border-white/10 hover:bg-white/10 transition-all uppercase tracking-wider"
              >
                Cancel
              </button>
              <button
                onClick={handleEdit}
                disabled={saving || !editText.trim() || editText.length > 500}
                className="px-5 py-1.5 rounded-full text-xs font-bold bg-accent text-background hover:opacity-90 transition-all uppercase tracking-wider disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
              >
                {saving ? (
                  <><svg className="animate-spin" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10" strokeOpacity="0.2" /><path d="M12 2a10 10 0 0 1 10 10" /></svg> Saving...</>
                ) : 'Save'}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <p className="text-primary/95 text-lg md:text-xl font-light leading-relaxed whitespace-pre-wrap pl-4 border-l-2 border-white/10 mt-2 z-10">
          {confession.text}
        </p>
      )}

      {/* Interactions Section */}
      <div className="mt-2 pt-4 border-t border-white/5 flex flex-col gap-4">
        
        <div className="flex flex-wrap items-center gap-6">
          {/* Reaction Button */}
          <button 
            onClick={handleLike}
            className={`hover:scale-105 active:scale-95 transition-transform flex items-center gap-1.5 ${hasLiked ? 'text-[#D4AF37] drop-shadow-[0_0_8px_rgba(212,175,55,0.4)]' : 'text-dimmed hover:text-[#D4AF37]/70'}`}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill={hasLiked ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
            </svg>
            <span className="mt-0.5 tabular-nums">{likes > 0 ? likes : '0'}</span>
          </button>

          <button 
            onClick={toggleComments}
            className="flex items-center gap-1.5 text-[11px] md:text-xs font-semibold text-dimmed hover:text-white uppercase tracking-wider transition-all"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path></svg>
            <span className="mt-0.5">
              Reply
              {(commentCount !== null && commentCount > 0) && (
                <span className="ml-1 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-white/10 text-white/70 text-[10px] font-bold">
                  {commentCount}
                </span>
              )}
            </span>
          </button>

          <div className="flex items-center gap-4 ml-auto">
            {/* Advice Button */}
            {!advice && !loadingAdvice && (
              <button
                onClick={handleGetAdvice}
                className="text-[11px] md:text-xs text-accent hover:text-white transition-colors tracking-wider uppercase font-semibold flex items-center gap-1.5"
              >
                <span className="text-lg leading-none">✦</span> Get Advice
              </button>
            )}

            {/* Report Button */}
            <button
               onClick={handleReport}
               disabled={reported}
               className={`text-[11px] md:text-xs tracking-wider uppercase font-semibold flex items-center gap-1 transition-colors ${reported ? 'text-rose-400' : 'text-dimmed hover:text-rose-400'}`}
            >
               {reported ? (
                  <>
                     <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 6L9 17l-5-5"></path></svg>
                     Reported
                  </>
               ) : (
                  <>
                     <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86 7.86 2"></polygon><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
                     Report
                  </>
               )}
            </button>

            {/* Edit & Delete Buttons (Restricted to Owner) */}
            {isOwner && (
              <div className="flex items-center gap-3">
                <button
                  onClick={() => { triggerHaptic('light'); setEditText(confession.text); setEditCategory(confession.category || 'General'); setIsEditing(!isEditing); }}
                  className={`text-[11px] md:text-xs tracking-wider uppercase font-semibold flex items-center gap-1 transition-colors ${
                    isEditing ? 'text-accent' : 'text-dimmed hover:text-accent'
                  }`}
                >
                  <Pencil size={13} strokeWidth={2} />
                  {isEditing ? 'Editing...' : 'Edit'}
                </button>
                {!isEditing && (
                  <button
                    onClick={handleConfirmDelete}
                    disabled={deleting}
                    className="text-[11px] md:text-xs tracking-wider uppercase font-semibold flex items-center gap-1 text-dimmed hover:text-rose-500 transition-colors"
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 6 5 6 21 6"></polyline>
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                    </svg>
                    {deleting ? 'Deleting...' : 'Delete'}
                  </button>
                )}
              </div>
            )}
          </div>
          
          {loadingAdvice && (
            <div className="flex items-center gap-2 text-xs text-dimmed tracking-wide ml-auto">
              <svg className="animate-spin text-accent" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <circle cx="12" cy="12" r="10" strokeOpacity="0.2" />
                <path d="M12 2a10 10 0 0 1 10 10" />
              </svg>
              Thinking...
            </div>
          )}
        </div>

        {error && <p className="text-xs text-red-400">{error}</p>}

        {advice && (
          <div className="bg-accent/5 border border-accent/20 shadow-lg rounded-xl p-4 md:p-5 relative mt-2 animate-in fade-in slide-in-from-top-4 duration-500">
            <div className="flex items-center gap-2 mb-3">
              <span className="w-2 h-2 rounded-full bg-accent animate-pulse shadow-[0_0_8px_rgb(56,189,248)]" />
              <span className="text-xs text-accent uppercase tracking-widest font-semibold flex items-center gap-1">
                Advice from the Void
              </span>
            </div>
            <p className="text-sm md:text-base text-primary/90 font-light leading-relaxed whitespace-pre-wrap pl-4 border-l-2 border-accent/30">
              {advice}
            </p>
          </div>
        )}

        {/* Comments Section (Threads-like nested threads) */}
        {showComments && (
          <div className="mt-4 animate-in fade-in slide-in-from-top-2 duration-300">
            {loadingComments ? (
               <p className="text-xs text-dimmed">Loading responses...</p>
            ) : (
              <div className="space-y-2 pl-2 md:pl-4 border-l-2 border-white/5">
                
                {/* Root Comment Input (Moved to Top) */}
                <div className="relative mb-4">
                  <div className="absolute -left-4 top-4 w-4 border-b-2 border-white/5" />
                  <div className="flex gap-2 ml-2">
                    <input 
                      type="text"
                      value={commentInput}
                      onChange={(e) => setCommentInput(e.target.value)}
                      placeholder="Add a reply to this Whisper..."
                      className="flex-1 bg-surface/30 border border-white/5 rounded-xl px-4 py-2 text-sm text-primary placeholder-dimmed outline-none focus:border-white/20 transition-colors"
                      onKeyDown={(e) => e.key === 'Enter' && handlePostComment()}
                    />
                    <button 
                      onClick={handlePostComment}
                      disabled={!commentInput.trim() || sendingComment}
                      className="bg-white/10 hover:bg-white/20 text-white p-2 rounded-xl transition-colors disabled:opacity-50"
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="22" y1="2" x2="11" y2="13"></line>
                        <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                      </svg>
                    </button>
                  </div>
                </div>

                {comments.filter(c => !c.parent_comment_id).map(comment => (
                  <CommentItem 
                    key={comment.id} 
                    comment={comment} 
                    allComments={comments} 
                    onReplyAdded={fetchComments}
                    confessionId={confession.id}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </article>
  );
}

function CommentItem({ 
  comment, 
  allComments, 
  onReplyAdded,
  confessionId
}: { 
  comment: Comment; 
  allComments: Comment[]; 
  onReplyAdded: () => void;
  confessionId: string;
}) {
  const [likes, setLikes] = useState(comment.likes || 0);
  const [hasLiked, setHasLiked] = useState(false);
  const [showReply, setShowReply] = useState(false);
  const [replyInput, setReplyInput] = useState('');
  const [sendingReply, setSendingReply] = useState(false);
  const [isOwner, setIsOwner] = useState(false);

  useEffect(() => {
    setIsOwner(checkOwnership(comment.id));
  }, [comment.id]);

  // Recursively find child comments
  const childComments = allComments.filter(c => c.parent_comment_id === comment.id);

  const handleLike = async () => {
    triggerHaptic('light');
    const newHasLiked = !hasLiked;

    // Optimistic UI Update
    setHasLiked(newHasLiked);
    setLikes(prev => newHasLiked ? prev + 1 : Math.max(0, prev - 1));

    try {
      const { data } = await supabase.from('comments').select('likes').eq('id', comment.id).single();
      const currentLikes = data?.likes || 0;
      const targetLikes = newHasLiked ? currentLikes + 1 : Math.max(0, currentLikes - 1);
      await supabase.from('comments').update({ likes: targetLikes }).eq('id', comment.id);
    } catch (err) {
      console.error('Like failed', err);
      // Rollback UI if failed
      setHasLiked(hasLiked);
      setLikes(likes);
    }
  };

  const handlePostReply = async () => {
    if (!replyInput.trim()) return;
    setSendingReply(true);
    
    const { data, error } = await supabase
      .from('comments')
      .insert({ 
        confession_id: comment.confession_id, 
        text: `PARENT::${comment.id}::${replyInput.trim()}` 
      })
      .select().single();
    
    if (!error) {
      if (data?.id) saveOwnership(data.id);

      // Notify the confession owner if they didn't reply to their own post
      if (!checkOwnership(confessionId)) {
        await supabase.from('notifications').insert({
          target_post_id: confessionId,
          type: 'comment',
          content: `Someone replied to your whisper: "${replyInput.trim().substring(0, 40)}${replyInput.trim().length > 40 ? '...' : ''}"`
        });
      }

      setReplyInput('');
      setShowReply(false);
      onReplyAdded();
    } else {
      console.error(error);
      alert('Failed to send reply: ' + error.message);
    }
    setSendingReply(false);
  };

  return (
    <div className="relative mt-4">
      {/* Connector line for the current comment */}
      <div className="absolute -left-4 top-4 w-4 border-b-2 border-white/5" />
      <div className="bg-white/[0.05] border border-white/10 backdrop-blur-[20px] p-4 rounded-3xl ml-2 shadow-sm">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs text-dimmed/60 uppercase font-semibold tracking-wider">Anonymous</p>
          <span className="text-[10px] text-dimmed/40">
            {new Date(comment.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
        <p className="text-sm text-primary/80 whitespace-pre-wrap">{comment.text}</p>
        
        {/* Comment Actions */}
        <div className="flex items-center gap-4 mt-3 pt-3 border-t border-white/5">
           <button 
             onClick={handleLike}
             className={`flex items-center gap-1.5 text-[11px] md:text-xs font-semibold uppercase tracking-wider transition-all ${
               hasLiked ? 'text-[#D4AF37] drop-shadow-[0_0_8px_rgba(212,175,55,0.4)]' : 'text-dimmed hover:text-[#D4AF37]/70 transition-colors'
             }`}
           >
             <svg width="12" height="12" viewBox="0 0 24 24" fill={hasLiked ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2">
               <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
             </svg>
             {likes > 0 && <span className="mt-0.5">{likes}</span>}
           </button>
           <button 
             onClick={() => setShowReply(!showReply)}
             className="flex items-center gap-1.5 text-[11px] font-semibold text-dimmed hover:text-white uppercase tracking-wider transition-all"
           >
             <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path></svg>
             Reply
           </button>
        </div>
      </div>

      {showReply && (
        <div className="relative mt-2 pl-4 md:pl-6 animate-in fade-in slide-in-from-top-1 duration-200">
           <div className="absolute left-2 top-0 bottom-0 w-px bg-white/5" />
           <div className="absolute left-2 top-5 w-4 border-b-2 border-white/5" />
           <div className="flex gap-2 ml-4">
             <input 
               type="text"
               value={replyInput}
               onChange={(e) => setReplyInput(e.target.value)}
               placeholder="Write a reply..."
               className="flex-1 bg-surface/30 border border-white/5 rounded-xl px-3 py-2 text-xs text-primary placeholder-dimmed outline-none focus:border-white/20 transition-colors"
               onKeyDown={(e) => e.key === 'Enter' && handlePostReply()}
               autoFocus
             />
             <button 
               onClick={handlePostReply}
               disabled={!replyInput.trim() || sendingReply}
               className="bg-white/10 hover:bg-white/20 text-white p-2 text-xs rounded-xl transition-colors disabled:opacity-50"
             >
               Send
             </button>
           </div>
        </div>
      )}

      {/* Render child replies recursively */}
      {childComments.length > 0 && (
         <div className="relative mt-1 pl-4 md:pl-6">
           {/* Vertical thread connector for children */}
           <div className="absolute left-2 top-6 bottom-0 w-px bg-primary/5" />
           <div className="ml-2">
             {childComments.map(child => (
               <CommentItem 
                 key={child.id} 
                 comment={child} 
                 allComments={allComments} 
                 onReplyAdded={onReplyAdded}
                 confessionId={confessionId}
               />
             ))}
           </div>
         </div>
       )}
    </div>
  );
}

// ── Simplified Premium Floating Glass Action Button ──
function FloatingActionButton({ onCompose }: { onCompose: () => void }) {
  // Custom bouncy Apple-like spring cubic-bezier
  const bouncy = "transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)]";
  const baseGlass = "backdrop-blur-xl border border-white/[0.06] shadow-[0_8px_30px_rgba(0,0,0,0.3)]";
  const illumination = "relative overflow-hidden before:absolute before:inset-0 before:bg-gradient-to-tr before:from-white/0 before:via-white/10 before:to-white/0 before:-translate-x-full hover:before:translate-x-full before:transition-transform before:duration-1000 before:ease-in-out after:absolute after:inset-0 after:bg-white/0 hover:after:bg-white/5 after:transition-colors";

  return (
    <div className="fixed bottom-6 right-6 md:bottom-12 md:right-12 z-40">
       <button 
          onClick={() => { triggerHaptic('medium'); onCompose(); }}
          className={`w-14 h-14 md:w-16 md:h-16 rounded-[22px] flex items-center justify-center bg-white/[0.1] text-primary ${baseGlass} ${illumination} ${bouncy} hover:scale-110 active:scale-90`}
          aria-label="Post a Whisper"
       >
          <svg className="z-10 relative" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
             <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
             <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
          </svg>
       </button>
    </div>
  );
}
