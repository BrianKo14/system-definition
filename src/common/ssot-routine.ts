/* Routines (functions, procedures, triggers).
Roughly a copy of the entity definitions.  */

import { LocalNameOf, NameInfoOf, SystemTypeContext } from "./ssot-types";

export const ROUTINE_LANGUAGES = ['sql', 'plpgsql'] as const
export type RoutineLanguage = typeof ROUTINE_LANGUAGES[number]

export const ROUTINE_KINDS = ['function', 'procedure', 'trigger'] as const
export type RoutineKind = typeof ROUTINE_KINDS[number]

type TypeNameOf<TContext extends SystemTypeContext> = keyof TContext['types'] & string

/** Params in order: the name, the schema, the body, the parameters */
export type ParamDefs<TContext extends SystemTypeContext> = Readonly<Record<string, {type: TypeNameOf<TContext>}>>

type RoutineBase = {
    name: string
    schema?: string
    body: string
}


/* --- Routine types --- */

export type FunctionDef<TContext extends SystemTypeContext> = RoutineBase & {
    kind: 'function'
    params?: ParamDefs<TContext>
    returns: TypeNameOf<TContext>
    language: RoutineLanguage
}

export type ProcedureDef<TContext extends SystemTypeContext> = RoutineBase & {
    kind: 'procedure'
    params?: ParamDefs<TContext>
    returns?: never
    language: RoutineLanguage
}

// Triggers read rows instead of taking params, and returns itself.
export type TriggerRoutineDef = RoutineBase & {
    kind: 'trigger'
    params?: never
    returns?: never
    language: 'plpgsql'
}

export type RoutineDef<TContext extends SystemTypeContext> =
    FunctionDef<TContext> | ProcedureDef<TContext> | TriggerRoutineDef

export type AnyRoutineDef = {
    kind: RoutineKind
    name: string
    schema?: string
    params?: Readonly<Record<string, {type: string}>>
    returns?: string
    language: RoutineLanguage
    body: string
}

/** Validates a routine definition against the context and returns the same definition. */
export function defineRoutine<TContext extends SystemTypeContext, const TDef extends RoutineDef<TContext>>(
    _context: TContext,
    def: TDef,
): TDef {
    return def;
}

export type RoutineCollection = Readonly<Record<string, AnyRoutineDef>>

export type SystemRoutineContext = SystemTypeContext & {routines: RoutineCollection}

export function withRoutines<TContext extends SystemTypeContext, const TRoutines extends RoutineCollection>(
    context: TContext,
    routines: TRoutines,
): TContext & {routines: TRoutines} {
    return {
        ...context,
        routines: {...(context as Partial<SystemRoutineContext>).routines, ...routines},
    } as TContext & {routines: TRoutines};
}

type RoutinesOf<TContext> = TContext extends {routines: infer TRoutines extends RoutineCollection} ? TRoutines : {}

/** Trigger routines in a context. */
export type TriggerRoutineNamesOf<TContext> = {
    [N in keyof RoutinesOf<TContext>]: RoutinesOf<TContext>[N] extends {kind: 'trigger'} ? N : never
}[keyof RoutinesOf<TContext>] & string

type SchemaOf<TDef> = TDef extends {schema: infer TSchema extends string} ? TSchema : undefined

export type ValidatedRoutines<TRoutines extends RoutineCollection> = {
    [R in keyof TRoutines]: {name: LocalNameOf<R & string, SchemaOf<TRoutines[R]>>}
}

/** Routine declaration. Compiler-time checks. */
export function defineRoutines<const TRoutines extends RoutineCollection>(
    routineDefs: TRoutines & ValidatedRoutines<TRoutines>,
): TRoutines {
    return routineDefs;
}


/* --- Complete routine information --- */

export type RoutineInfo = {
    kind: RoutineKind
    name: string
    schema: string | null
    params: Readonly<Record<string, {type: string}>>
    returns: string | null
    language: RoutineLanguage
    body: string
}

export type RoutineInfoOf<TDef extends AnyRoutineDef> = {
    kind: TDef['kind']
    name: TDef['name']
    schema: NameInfoOf<SchemaOf<TDef>>
    params: TDef extends {params: infer TParams extends Readonly<Record<string, {type: string}>>} ? TParams : {}
    returns: TDef extends {returns: infer TReturns extends string} ? TReturns : null
    language: TDef['language']
    body: TDef['body']
}

export function completeRoutine<const TDef extends AnyRoutineDef>(routineDef: TDef): RoutineInfoOf<TDef> {
    return {
        kind: routineDef.kind,
        name: routineDef.name,
        schema: routineDef.schema ?? null,
        params: routineDef.params ?? {},
        returns: routineDef.returns ?? null,
        language: routineDef.language,
        body: routineDef.body,
    } as RoutineInfoOf<TDef>;
}