"use client";

import { useState, type InputHTMLAttributes } from "react";
import styles from "./password-input.module.css";

type PasswordInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  id: string;
  label?: string;
};

export function PasswordInput({ id, label = "password", className = "st-control", disabled, ...props }: PasswordInputProps) {
  const [visible, setVisible] = useState(false);

  return (
    <div className={styles.control}>
      <input {...props} id={id} type={visible ? "text" : "password"} disabled={disabled} className={`${className} ${styles.input}`} />
      <button
        type="button"
        aria-label={`${visible ? "Hide" : "Show"} ${label.toLowerCase()}`}
        aria-controls={id}
        aria-pressed={visible}
        disabled={disabled}
        className={styles.toggle}
        onClick={() => setVisible((current) => !current)}
      >
        {visible ? "Hide" : "Show"}
      </button>
    </div>
  );
}
