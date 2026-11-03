import { create } from 'zustand';

export type ToastTone = 'info' | 'success' | 'warning' | 'danger';

export interface ToastInput {
  title: string;
  description?: string;
  tone?: ToastTone;
  /** One follow-up action, e.g. "Undo". */
  action?: { label: string; onClick: () => void };
  /** Milliseconds; defaults to 5 s (8 s when there is an action). */
  duration?: number;
}

interface ToastEntry extends ToastInput {
  id: string;
  open: boolean;
}

interface ToastState {
  toasts: ToastEntry[];
  add: (toast: ToastInput) => string;
  close: (id: string) => void;
  remove: (id: string) => void;
}

const MAX_VISIBLE = 3;
let counter = 0;

export const useToastStore = create<ToastState>()((set) => ({
  toasts: [],
  add: (toast) => {
    const id = `toast-${++counter}`;
    set((state) => ({ toasts: [...state.toasts, { ...toast, id, open: true }].slice(-MAX_VISIBLE) }));
    return id;
  },
  close: (id) => set((state) => ({ toasts: state.toasts.map((t) => (t.id === id ? { ...t, open: false } : t)) })),
  remove: (id) => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
}));

/** Show a toast from anywhere. Toasts confirm actions; they are never the only place an error is shown. */
export function toast(input: ToastInput): string {
  return useToastStore.getState().add(input);
}
