import { useEffect, useRef, useState } from "react";
import { subscribeNetworkActivity } from "@/lib/networkActivity";

export default function ApiLoadingBar() {
  const [active, setActive] = useState(false);
  const [width, setWidth] = useState(0);
  const timerRef = useRef(null);

  useEffect(() => {
    return subscribeNetworkActivity((isActive) => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (isActive) {
        setActive(true);
        setWidth(18);
        timerRef.current = setInterval(() => {
          setWidth((w) => Math.min(90, w + (100 - w) * 0.08));
        }, 120);
      } else {
        setWidth(100);
        setTimeout(() => {
          setActive(false);
          setWidth(0);
        }, 180);
      }
    });
  }, []);

  if (!active && width === 0) return null;

  return (
    <div className="pointer-events-none fixed left-0 top-0 z-[100] h-[3px] w-full">
      <div
        className="h-full bg-primary transition-[width,opacity] duration-200 ease-out"
        style={{ width: `${width}%`, opacity: active || width > 0 ? 1 : 0 }}
      />
    </div>
  );
}

