"use client";

import {
  createContext,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
  useCallback,
  useContext,
  useState,
} from "react";

type OperationStateContextValue = Readonly<{
  scope: string;
  values: Readonly<Record<string, unknown>>;
  setValue: (key: string, update: SetStateAction<unknown>) => void;
}>;

const OperationStateContext = createContext<OperationStateContextValue | null>(null);

export type CombatOperationValues = Readonly<Record<string, unknown>>;

export function combatOperationStateKey(scope: string, key: string): string {
  return `${scope}:${key}`;
}

export function updateCombatOperationValues(
  current: CombatOperationValues,
  key: string,
  update: SetStateAction<unknown>,
): CombatOperationValues {
  const previous = current[key];
  const next = typeof update === "function"
    ? (update as (value: unknown) => unknown)(previous)
    : update;
  return { ...current, [key]: next };
}

export function readCombatOperationValue<T>(values: CombatOperationValues, scope: string, key: string, fallback: T): T {
  const stored = values[combatOperationStateKey(scope, key)];
  return stored === undefined ? fallback : stored as T;
}

export function CombatOperationStateProvider({ scope, children }: { scope: string; children: ReactNode }) {
  const [values, setValues] = useState<Readonly<Record<string, unknown>>>({});
  const setValue = useCallback((key: string, update: SetStateAction<unknown>) => {
    setValues((current) => updateCombatOperationValues(current, key, update));
  }, []);
  return <OperationStateContext.Provider value={{ scope, values, setValue }}>{children}</OperationStateContext.Provider>;
}

export function useCombatOperationState<T>(key: string, initialValue: T | (() => T)): [T, Dispatch<SetStateAction<T>>] {
  const context = useContext(OperationStateContext);
  const [fallback, setFallback] = useState<T>(initialValue);
  const qualifiedKey = context ? combatOperationStateKey(context.scope, key) : key;
  const stored = context?.values[qualifiedKey] as T | undefined;
  const contextualInitial = context
    ? typeof initialValue === "function"
      ? (initialValue as () => T)()
      : initialValue
    : fallback;
  const value = stored === undefined ? contextualInitial : stored;
  const setValue = useCallback<Dispatch<SetStateAction<T>>>((update) => {
    if (!context) {
      setFallback(update);
      return;
    }
    context.setValue(qualifiedKey, (previous: unknown) => {
      const current = previous === undefined ? value : previous as T;
      return typeof update === "function"
        ? (update as (previousValue: T) => T)(current)
        : update;
    });
  }, [context, qualifiedKey, value]);
  return [value, setValue];
}
