import { useEffect, useState } from 'react';

export function useNow(intervalMs = 60_000) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const tick = () => setNow(Date.now());
    let timer;
    const schedule = () => {
      timer = setTimeout(() => {
        tick();
        schedule();
      }, intervalMs - (Date.now() % intervalMs));
    };
    schedule();
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [intervalMs]);

  return now;
}
