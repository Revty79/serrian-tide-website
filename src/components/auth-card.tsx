import Link from "next/link";
import type { ReactNode } from "react";
import styles from "./auth-card.module.css";

export function AuthCard({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <main className={styles.main}>
      <section className={styles.card} aria-labelledby="auth-heading">
        <header className={styles.header}>
          <Link href="/" className={`font-evanescent ${styles.brand}`}>SERRIAN TIDE</Link>
          <h1 id="auth-heading" className={styles.title}>{title}</h1>
          <p className={styles.description}>{description}</p>
        </header>
        {children}
      </section>
    </main>
  );
}
