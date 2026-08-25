"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { authClient } from "@/lib/auth-client";

export default function RegisterPage() {
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setError("");
    setSuccess("");

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    setIsSubmitting(true);

    try {
      const result = await authClient.signUp.email({
        name: name.trim(),
        username: username.trim(),
        email: email.trim(),
        password,
      });

      if (result.error) {
        setError(result.error.message || "Unable to create account.");
        return;
      }

      setSuccess("Account created successfully. You can now sign in.");
    } catch {
      setError("Unable to create account.");
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
              Create Your Account
            </h2>

            <p className="mt-2 text-sm text-slate-400">
              Begin your journey into the Realms.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="mt-8 space-y-5">
            <div>
              <label
                htmlFor="name"
                className="mb-2 block text-sm font-medium text-slate-300"
              >
                Display Name
              </label>

              <input
                id="name"
                name="name"
                type="text"
                autoComplete="name"
                value={name}
                onChange={(event) => setName(event.target.value)}
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
                placeholder="Enter your display name"
                required
              />
            </div>

            <div>
              <label
                htmlFor="username"
                className="mb-2 block text-sm font-medium text-slate-300"
              >
                Username
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
                placeholder="Choose a permanent username"
                required
              />
            </div>

            <div>
              <label
                htmlFor="email"
                className="mb-2 block text-sm font-medium text-slate-300"
              >
                Email
              </label>

              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
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
                placeholder="Enter your email"
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
                autoComplete="new-password"
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
                placeholder="Create a password"
                minLength={8}
                required
              />
            </div>

            <div>
              <label
                htmlFor="confirmPassword"
                className="mb-2 block text-sm font-medium text-slate-300"
              >
                Confirm Password
              </label>

              <input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
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
                placeholder="Confirm your password"
                minLength={8}
                required
              />
            </div>

            {error && (
              <p className="text-center text-sm text-red-300">
                {error}
              </p>
            )}

            {success && (
              <p className="text-center text-sm text-emerald-300">
                {success}
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
              {isSubmitting ? "Creating Account..." : "Create Account"}
            </button>
          </form>

          <div className="mt-7 text-center">
            <Link
              href="/login"
              className="text-sm text-slate-400 transition hover:text-amber-200"
            >
              Already have an account? Sign in
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}