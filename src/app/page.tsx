import Link from "next/link";

export default function Home() {
  return (
    <main className="relative z-10 flex min-h-screen items-center justify-center px-6">
      <section className="text-center">
        <h1
          className="
            font-evanescent
            text-6xl
            tracking-tight
            sm:text-7xl
            md:text-8xl
            lg:text-9xl
          "
        >
          <span
            className="
              bg-gradient-to-r
              from-purple-500
              via-amber-300
              to-purple-500
              bg-clip-text
              text-transparent
              drop-shadow-[0_0_18px_rgba(251,191,36,0.28)]
            "
          >
            SERRIAN TIDE
          </span>
        </h1>

        <p className="mt-5 text-lg tracking-wide text-slate-300">
          Enter your imagination.
        </p>

        <div className="mt-10">
          <Link
            href="/login"
            className="
              inline-flex
              items-center
              justify-center
              rounded-full
              border
              border-amber-300/50
              bg-amber-300/10
              px-8
              py-4
              font-semibold
              text-amber-100
              shadow-[0_0_30px_rgba(251,191,36,0.08)]
              backdrop-blur-sm
              transition
              hover:border-amber-300/80
              hover:bg-amber-300/20
              hover:shadow-[0_0_35px_rgba(251,191,36,0.18)]
            "
          >
            Enter Your Imagination
          </Link>
        </div>
      </section>
    </main>
  );
}