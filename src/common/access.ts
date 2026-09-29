/* The authorization role of an entity. */

export const CAPABILITIES = ['read', 'create', 'update', 'delete', 'lock'] as const
export type Capability = typeof CAPABILITIES[number]

/** Map role names -> capabilities */
export type AccessDef = Readonly<Record<string, readonly Capability[]>>

/** The access policy of an entity */
export type AccessInfoOf<TAccess extends AccessDef | undefined> = TAccess extends AccessDef ? TAccess : {}
