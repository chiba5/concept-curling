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
      <i className="crop tl" aria-hidden="true" />
      <i className="crop tr" aria-hidden="true" />
      <i className="crop bl" aria-hidden="true" />
      <i className="crop br" aria-hidden="true" />
      <header className="frame-header">
        <span className="frame-title">
          <span className="seal-mark" aria-hidden="true">
            概
          </span>
          概念カーリング
        </span>
        {sub ? <span className="frame-sub">{sub}</span> : null}
      </header>
      <main className="frame-body" aria-label={title}>
        {children}
      </main>
    </div>
  );
}
