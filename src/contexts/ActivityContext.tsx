import { createContext, useState, useCallback, useRef, type ReactNode } from 'react';

export type ActivityContextState = {
  view: string | null;
  zoomPath: string[];
};

export type SendActivityFn = (eventType: string, payload?: Record<string, unknown>) => void;

type ActivityContextValue = ActivityContextState & {
  setContext: (v: Partial<ActivityContextState>) => void;
  send: SendActivityFn | null;
  setSend: (fn: SendActivityFn) => void;
};

export const ActivityContext = createContext<ActivityContextValue | null>(null);

const defaultState: ActivityContextState = {
  view: null,
  zoomPath: [],
};

export function ActivityProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ActivityContextState>(defaultState);
  const sendRef = useRef<SendActivityFn | null>(null);
  const [, setSendVersion] = useState(0);

  const setContext = useCallback((v: Partial<ActivityContextState>) => {
    setState((prev) => ({ ...prev, ...v }));
  }, []);

  const setSend = useCallback((fn: SendActivityFn) => {
    sendRef.current = fn;
    setSendVersion((v) => v + 1);
  }, []);

  const send = useCallback<SendActivityFn>((eventType, payload) => {
    sendRef.current?.(eventType, payload);
  }, []);

  const value: ActivityContextValue = {
    ...state,
    setContext,
    send,
    setSend,
  };

  return (
    <ActivityContext.Provider value={value}>
      {children}
    </ActivityContext.Provider>
  );
}
