"use client";

import React, { useEffect, useRef, useState } from "react";

type Props = {
  children: React.ReactNode;
  minHeight?: string;
  rootMargin?: string;
  className?: string;
};

/** Mount expensive below-the-fold sections only when they are about to appear. */
export default function DeferredMount({ children, minHeight = "180px", rootMargin = "220px 0px", className = "" }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const element = hostRef.current;
    if (!element) return;
    if (typeof IntersectionObserver === "undefined") { setVisible(true); return; }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) { setVisible(true); observer.disconnect(); }
    }, { rootMargin });
    observer.observe(element);
    return () => observer.disconnect();
  }, [rootMargin]);

  return <div ref={hostRef} className={className} style={!visible ? { minHeight } : undefined}>{visible ? children : null}</div>;
}
