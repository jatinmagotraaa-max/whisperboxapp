import { createClient } from '@supabase/supabase-js';

// These values come from your .env.local file (see .env.local.example)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// A single shared Supabase client for the whole app
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// TypeScript type matching your "confessions" table schema
export type Confession = {
  id: string;           
  text: string;         
  category?: string;    
  user_id?: string;     
  created_at: string;   
  likes: number;        
};

export type Comment = {
  id: string;
  confession_id: string;
  parent_comment_id: string | null;
  text: string;
  created_at: string;
  likes: number;
};

// ── Ownership Tracking (Local Storage based for Anonymous Users) ──

const OWNERSHIP_KEY = 'whisper_box_owned_ids';
const USER_ID_KEY = 'whisper_box_user_id';

/** Gets or creates a persistent anonymous User ID */
export const getAnonymousUserId = (): string => {
  if (typeof window === 'undefined') return '';
  let id = localStorage.getItem(USER_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(USER_ID_KEY, id);
  }
  return id;
};

/** Saves an ID of a post/comment the user created */
export const saveOwnership = (id: string) => {
  if (typeof window === 'undefined') return;
  try {
    const raw = localStorage.getItem(OWNERSHIP_KEY);
    const owned = JSON.parse(raw || '[]');
    if (Array.isArray(owned)) {
      if (!owned.includes(id)) {
        owned.push(id);
        localStorage.setItem(OWNERSHIP_KEY, JSON.stringify(owned));
      }
    } else {
      localStorage.setItem(OWNERSHIP_KEY, JSON.stringify([id]));
    }
  } catch (e) {
    localStorage.setItem(OWNERSHIP_KEY, JSON.stringify([id]));
  }
};

/** Removes an ID of a post/comment from user's owned list */
export const removeOwnership = (id: string) => {
  if (typeof window === 'undefined') return;
  try {
    const raw = localStorage.getItem(OWNERSHIP_KEY);
    const owned = JSON.parse(raw || '[]');
    if (Array.isArray(owned)) {
      const filtered = owned.filter(item => item !== id);
      localStorage.setItem(OWNERSHIP_KEY, JSON.stringify(filtered));
    }
  } catch (e) {}
};

/** Checks if the user is the owner of this post/comment */
export const checkOwnership = (id: string): boolean => {
  if (typeof window === 'undefined') return false;
  try {
    const raw = localStorage.getItem(OWNERSHIP_KEY);
    const owned = JSON.parse(raw || '[]');
    return Array.isArray(owned) && owned.includes(id);
  } catch (e) {
    return false;
  }
};
