/* plain TypeScript helpers: nothing here knows about the SSOT */

export type ExpandType<T> = {[K in keyof T]: T[K]} & {}

type IsNullable<T> = null extends T ? true : undefined extends T ? true : false;

export type Optional<T> = {
  [K in keyof T as IsNullable<T[K]> extends true ? never : K]: T[K];
} & {
  [K in keyof T as IsNullable<T[K]> extends true ? K : never]?: T[K];
};

/* what survives a trip through JSON: no functions, no RegExps, no Dates */
export type JsonValue = string | number | boolean | null | readonly JsonValue[] | {readonly [K in string]?: JsonValue}
