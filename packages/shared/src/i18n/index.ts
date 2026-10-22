import { en } from './en';
import { vi } from './vi';

type DeepString<T> = { [K in keyof T]: T[K] extends string ? string : DeepString<T[K]> };

/** Shape every locale must implement — missing keys fail type-checking. */
export type Translation = DeepString<typeof en>;

export const translations = { en, vi } as const;
