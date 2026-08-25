"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

import { authClient } from "@/lib/auth-client";

export default function LoginPage() {
  const router = useRouter();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setError("");
    setIsSubmitting(true);

    try {
      const result = username.includes("@")
        ? await authClient.signIn.email({
            email: username,
            password,
          })
        : await authClient.signIn.username({
            username,
            password,
          });

      if (result.error) {
        setError(result.error.message || "Unable to sign in.");
        return;
      }

      router.replace("/access");
      router.refresh();
    } catch {
      setError("Unable to sign in.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="relative z-10 flex min-h-screen items-center justify-center px-6 py-12">
      <section className="w-full max-w-md">
        <div
          className="
            rounded-3xl
            border
            border-white/10
            bg-black/35
            p-8
            shadow-2xl
            backdrop-blur-md
            sm:p-10
          "
        >
          <div className="text-center">
            <Link href="/" className="inline-block">
              <h1
                className="
                  font-evanescent
                  bg-gradient-to-r
                  from-purple-500
                  via-amber-300
                  to-purple-500
                  bg-clip-text
                  text-4xl
                  tracking-tight
                  text-transparent
                  drop-shadow-[0_0_14px_rgba(251,191,36,0.25)]
                  sm:text-5xl
                "
              >
                SERRIAN TIDE
              </h1>
            </Link>

            <h2 className="font-portcullion mt-7 text-2xl text-slate-100">
              Enter the Realms
            </h2>

            <p className="mt-2 text-sm text-slate-400">
              Sign in to continue your journey.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="mt-8 space-y-6">
            <div>
              <label
                htmlFor="username"
                className="mb-2 block text-sm font-medium text-slate-300"
              >
                Username or Email
              </label>

              <input
                id="username"
                name="username"
                type="text"
                autoComplete="username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                className="
                  w-full
                  rounded-xl
                  border
                  border-white/10
                  bg-black/35
                  px-4
                  py-3
                  text-slate-100
                  outline-none
                  transition
                  placeholder:text-slate-600
                  focus:border-amber-300/60
                  focus:ring-2
                  focus:ring-amber-300/10
                "
                placeholder="Enter your username or email"
                required
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="mb-2 block text-sm font-medium text-slate-300"
              >
                Password
              </label>

              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="
                  w-full
                  rounded-xl
                  border
                  border-white/10
                  bg-black/35
                  px-4
                  py-3
                  text-slate-100
                  outline-none
                  transition
                  placeholder:text-slate-600
                  focus:border-amber-300/60
                  focus:ring-2
                  focus:ring-amber-300/10
                "
                placeholder="Enter your password"
                required
              />
            </div>

            {error && (
              <p className="text-center text-sm text-red-300">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="
                inline-flex
                w-full
                items-center
                justify-center
                rounded-full
                border
                border-amber-300/50
                bg-amber-300/10
                px-6
                py-3
                font-semibold
                text-amber-100
                shadow-[0_0_30px_rgba(251,191,36,0.08)]
                transition
                hover:border-amber-300/80
                hover:bg-amber-300/20
                hover:shadow-[0_0_35px_rgba(251,191,36,0.18)]
                disabled:cursor-not-allowed
                disabled:opacity-50
              "
            >
              {isSubmitting ? "Entering..." : "Enter"}
            </button>
          </form>

          <div className="mt-7 space-y-3 text-center">
            <div>
              <span className="text-sm text-slate-400">
                New to Serrian Tide?{" "}
              </span>

              <Link
                href="/register"
                className="text-sm text-amber-200 transition hover:text-amber-100"
              >
                Create Account
              </Link>
            </div>

            <div>
              <Link
                href="/"
                className="text-sm text-slate-400 transition hover:text-amber-200"
              >
                ← Return to the beginning
              </Link>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}