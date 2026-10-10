"use client";
export default function WorldsError({ reset }: { reset: () => void }) { return <main className="st-page"><h1>Worlds is unavailable right now</h1><p>Your saved worlds have not been changed. Please try loading the workshop again.</p><button className="st-button" onClick={reset}>Try again</button></main>; }
