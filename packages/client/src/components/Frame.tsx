import type { ReactNode } from 'react';

export function Frame({
  title,
  sub,
  children,
}: {
  title: string;
  sub?: string;
  children: ReactNode;
}) {
  return (
    <div className="frame">
      <header className="frame-header">
        <span className="frame-title">概念カーリング</span>
        {sub ? <span className="frame-sub">{sub}</span> : null}
      </header>
      <main className="frame-body" aria-label={title}>
        {children}
      </main>
    </div>
  );
}
