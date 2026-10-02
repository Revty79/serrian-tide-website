import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen, Globe2 } from "lucide-react";

import styles from "./worlds.module.css";

export const metadata: Metadata = {
  title: "Worlds | Serrian Tide",
  description: "The narrative home for your Serrian Tide worlds.",
};

export default function WorldsPage() {
  return (
    <main className={styles.page}>
      <div className={styles.content}>
        <header className={styles.hero}>
          <div className={styles.emblem} aria-hidden="true">
            <Globe2 strokeWidth={0.8} />
            <span>SERRIAN TIDE</span>
          </div>
          <div className={styles.introduction}>
            <p className={styles.eyebrow}>World Building</p>
            <h1>Worlds</h1>
            <p className={styles.lead}>Give your world a story.</p>
            <p>A home for the people, places, histories, and lore that bring your games to life.</p>
          </div>
        </header>

        <section className={styles.workshop} aria-labelledby="worlds-tools-heading">
          <div className={styles.sectionHeading}>
            <div>
              <p className={styles.eyebrow}>The Narrative Side</p>
              <h2 id="worlds-tools-heading">World-building tools</h2>
            </div>
            <span className={styles.status}>Coming next</span>
          </div>
          <div className={styles.emptyState}>
            <BookOpen size={40} strokeWidth={1.2} aria-hidden="true" />
            <h3>A place for your worlds to take shape</h3>
            <p>This is where your world-building tools will live. Shape the stories around your games, from a place&apos;s history to the people who call it home.</p>
            <p className={styles.caption}>The Worlds entrance is ready. Writing and organizing tools will follow.</p>
          </div>
        </section>

        <footer className={styles.footer}>
          <Link href="/access" className="st-button is-secondary">Return to Paths</Link>
          <span>SERRIAN TIDE</span>
        </footer>
      </div>
    </main>
  );
}
