/**
 * The arched portrait frame from the design. Shows the photo when one is
 * visible to the viewer, otherwise a calm silhouette.
 */
export function ArchPortrait({ photoUrl, alt = '', className = 'h-[200px]', children }) {
  return (
    <div
      className={`relative flex items-end justify-center overflow-hidden rounded-t-full rounded-b-[18px] border border-gold bg-surface2 ${className}`}
    >
      {photoUrl ? (
        // Photos use short-lived signed URLs, so they bypass the Next.js image cache.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photoUrl} alt={alt} className="absolute inset-0 size-full object-cover" />
      ) : (
        <svg
          width="140"
          height="150"
          viewBox="0 0 140 150"
          fill="none"
          aria-hidden="true"
          className="max-h-[75%]"
        >
          <circle cx="70" cy="62" r="30" fill="var(--bg)" stroke="var(--gold)" strokeWidth="1.5" />
          <path
            d="M12 150c3-44 30-62 58-62s55 18 58 62z"
            fill="var(--bg)"
            stroke="var(--gold)"
            strokeWidth="1.5"
          />
        </svg>
      )}
      {children}
    </div>
  );
}
