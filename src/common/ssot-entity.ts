/* the entity: the container level, the unit that can be shown as a grid. It knows the record
   and adds what only makes sense over a stored collection: pk, uks and fks. */

import { AnyFieldDef, LocalNameOf, NameInfoOf, SystemTypeContext } from "./ssot-types";
import { AnyRecordDef, RecordDef, RecordInfo, RecordInfoOf, RecordInstanceType,
    NotNullableFieldsOf, completeRecord, notNullableFields } from "./ssot-record";
import { ValidatorCollection, ValidatorNamesFor } from "./validate";
import { AccessDef, AccessInfoOf } from "./access";
import { TriggerRoutineNamesOf } from "./ssot-routine";
import { ExpandType } from "./type-utils";

/* the entity references its record BY NAME, like an fk references its target entity and for
   the same reason, so the context of the entity layer is the one of the types plus the records
   already defined. It grows in stages: a record that inherits the pk of an entity cannot exist
   before that entity, so each withRecords is one more level of depth of the data model. A system
   that declares its pks as separate records at the top and spreads them by hand needs only one. */
export type RecordCollection = Record<string, AnyRecordDef>

export type SystemEntityContext = SystemTypeContext & {records: RecordCollection}

type RecordsOf<TContext> = TContext extends {records: infer TRecords} ? TRecords : {}

/* which rules a system has, so an entity can name the ones it uses. They are behaviour, so
   they live in the context and not in the description, like the completer and the type
   behaviours; what the description carries is the name, which is what gets serialized.
   Another stage, and it has to come before the entities because they name them. */
export type SystemValidatorContext = SystemEntityContext & {validators: ValidatorCollection}

type ValidatorsOf<TContext> = TContext extends {validators: infer TValidators extends ValidatorCollection}
    ? TValidators
    : {}

export function withValidators<TContext extends SystemTypeContext, const TValidators extends ValidatorCollection>(
    context: TContext,
    validators: TValidators,
): TContext & {validators: TValidators} {
    return {
        ...context,
        validators: {...(context as Partial<SystemValidatorContext>).validators, ...validators},
    } as TContext & {validators: TValidators};
}

/* the row of an entity as its rules see it: the record, with the pk not nullable */
type EntityRowOf<TContext extends SystemEntityContext, TRecord extends keyof TContext['records'] & string, TPk extends readonly string[]> =
    RecordInstanceType<TContext, NotNullableFieldsOf<TContext, TContext['records'][TRecord] & RecordDef<TContext>, TPk[number]>>

export function withRecords<TContext extends SystemTypeContext, const TRecords extends RecordCollection>(
    context: TContext,
    records: TRecords,
): TContext & {records: TRecords} {
    return {
        ...context,
        // the stages accumulate: the intersection of the type says the same as this spread
        records: {...(context as Partial<SystemEntityContext>).records, ...records},
    } as TContext & {records: TRecords};
}

/* the bound for "an entity def of any system at all", the counterpart of AnyFieldDef: the
   structural checks over pks and fks do not need to know the types of anybody */
export type AnyEntityDef = {
    name: string
    record: string
    fields: AnyRecordDef
    pk: readonly string[]
    fks?: Readonly<Record<string, FkDef>>
    uks?: Readonly<Record<string, readonly string[]>>
    validators?: readonly string[]
    schema?: string
    table?: string
    access?: AccessDef
    triggers?: Readonly<Record<string, TriggerDef>>
}

/* fks reference the target entity BY NAME (a string, not the object): that keeps the defs
   serializable and makes circular and reflexive fks representable. The counterpart is that
   the target side can only be checked at the system level: see defineEntities. */
export type FkDef = {
    entity: string
    fields: readonly string[] | Readonly<Record<string, string>>
}


/* --- Trigger events --- */

export const TRIGGER_EVENTS = ['insert', 'update', 'delete'] as const
export type TriggerEvent = typeof TRIGGER_EVENTS[number]
export const TRIGGER_TIMINGS = ['before', 'after'] as const
export type TriggerTiming = typeof TRIGGER_TIMINGS[number]
export const TRIGGER_LEVELS = ['row', 'statement'] as const
export type TriggerLevel = typeof TRIGGER_LEVELS[number]

export type TriggerDef = {
    timing: TriggerTiming
    events: readonly TriggerEvent[]
    level?: TriggerLevel
    routine: string
}

export type EntityDef<TContext extends SystemEntityContext> = {
    /* the entity says its own name: unlike a field, it is not written inside a map, so this is
       the first place the name is stated, not a repetition of a key. That the key it later gets
       in defineEntities has to match is a check, not a duplication. */
    name: string
    record: keyof TContext['records'] & string
    fields: RecordDef<TContext>
    pk: readonly string[]
    fks?: Readonly<Record<string, FkDef>>
    uks?: Readonly<Record<string, readonly string[]>>
    /* by name, like the record and the fks: a def carries no functions */
    validators?: readonly string[]
    /* the namespace the table lives in. Absent, it is the default one. */
    schema?: string
    /* the physical name of the table, for when it differs from the entity's (a legacy database).
       Absent, it is derived from the identity of the entity. */
    table?: string
    /* who may do what here: role -> capabilities. Absent, nobody may do anything. */
    access?: AccessDef
    /* what runs when its rows change, by name: the routines are in the context */
    triggers?: Readonly<Record<string, TriggerDef>>
}

/** We reserve dotted names for `schema.name` patterns. */
export type NotQualified<TName> = TName extends `${string}.${string}` ? never : unknown

export function defineEntity<
    TContext extends SystemEntityContext,
    const TName extends string,
    const TRecord extends keyof TContext['records'] & string,
    const TPk extends readonly (keyof TContext['records'][TRecord] & string)[],
    const TUks extends Readonly<Record<string, readonly (keyof TContext['records'][TRecord] & string)[]>> = {},
    const TFks extends Readonly<Record<string, {entity: string, fields: readonly (keyof TContext['records'][TRecord] & string)[] | {readonly [K in keyof TContext['records'][TRecord]]?: string}}>> = {},
    /* only the rules whose shape this entity's row has: naming one that asks for a field the
       record has not got is not in the union and does not compile */
    const TValidators extends readonly ValidatorNamesFor<EntityRowOf<TContext, TRecord, TPk>, ValidatorsOf<TContext>>[] = [],
    const TSchema extends string | undefined = undefined,
    const TTable extends string | undefined = undefined,
    const TAccess extends AccessDef = {},
    /* only the trigger routines of the context: naming a function, or nothing at all, does not compile */
    const TTriggers extends Readonly<Record<string, TriggerDef & {routine: TriggerRoutineNamesOf<TContext>}>> = {},
>(
    context: TContext,
    def: {name: TName, record: TRecord, pk: TPk, fks?: TFks, uks?: TUks, validators?: TValidators,
        schema?: TSchema, table?: TTable & NotQualified<TTable>, access?: TAccess, triggers?: TTriggers},
): {name: TName, record: TRecord, fields: TContext['records'][TRecord], pk: TPk, fks: TFks, uks: TUks, validators: TValidators,
    schema: TSchema, table: TTable, access: TAccess, triggers: TTriggers} {
    return {
        name: def.name,
        record: def.record,
        // the name is what the human writes and what gets serialized; the fields are resolved
        // from the context so that everything downstream keeps working on values
        fields: context.records[def.record] as TContext['records'][TRecord],
        pk: def.pk,
        fks: def.fks ?? {} as TFks,
        uks: def.uks ?? {} as TUks,
        validators: def.validators ?? [] as unknown as TValidators,
        schema: def.schema as TSchema,
        table: def.table as TTable,
        access: def.access ?? {} as TAccess,
        triggers: def.triggers ?? {} as TTriggers,
    };
}

// `inSchema` and `InSchemaOf` take care of qualifying each entity with its schema.
// E.g. `inSchema('public', {user: {...}})` becomes `{ 'public.user': {...} }`

/* anything that lives in a namespace: the entities, and the routines too */
type InNamespace = {readonly schema?: string, readonly [key: string]: unknown}

export type InSchemaOf<TSchema extends string, TEntities extends Readonly<Record<string, InNamespace>>> = {
    [E in keyof TEntities & string as `${TSchema}.${E}`]: ExpandType<Omit<TEntities[E], 'schema'> & {schema: TSchema}>
}

export function inSchema<
    const TSchema extends string,
    const TEntities extends Readonly<Record<string, InNamespace>>,
>(schema: TSchema, entityDefs: TEntities): InSchemaOf<TSchema, TEntities> {
    return Object.fromEntries(Object.entries(entityDefs).map(([name, entityDef]) =>
        [`${schema}.${name}`, {...entityDef, schema}]
    )) as InSchemaOf<TSchema, TEntities>;
}

export type PkFieldsOf<TEntityDef extends AnyEntityDef> =
    Pick<TEntityDef['fields'], TEntityDef['pk'][number] & keyof TEntityDef['fields']>

export function extractPk<TEntityDef extends AnyEntityDef>(entityDef: TEntityDef): PkFieldsOf<TEntityDef> {
    const fields: AnyRecordDef = entityDef.fields;
    return Object.fromEntries(entityDef.pk.map(name => [name, fields[name]])) as PkFieldsOf<TEntityDef>;
}

type FlattenPks<TPks extends readonly (readonly string[])[]> =
    TPks extends readonly [infer THead extends readonly string[], ...infer TRest extends readonly (readonly string[])[]]
        ? readonly [...THead, ...FlattenPks<TRest>]
        : readonly []

type DedupPk<TPk extends readonly string[], TSeen extends string = never> =
    TPk extends readonly [infer THead extends string, ...infer TRest extends readonly string[]]
        ? THead extends TSeen
            ? DedupPk<TRest, TSeen>
            : readonly [THead, ...DedupPk<TRest, TSeen | THead>]
        : readonly []

export type MergedPk<TPks extends readonly (readonly string[])[]> = DedupPk<FlattenPks<TPks>>

export function mergePk<const TPks extends readonly (readonly string[])[]>(...pks: TPks): MergedPk<TPks> {
    const merged: string[] = [];
    for (const pk of pks) {
        for (const name of pk) {
            if (!merged.includes(name)) merged.push(name);
        }
    }
    return merged as unknown as MergedPk<TPks>;
}

/* the Info side of an entity: everything explicit, and in only one form. The fks lose the
   array shorthand: fields is always the source → target map. The pk is deduplicated, so
   overlapping pks can be spread in the Def without mergePk. */
export type FkInfo = {
    entity: string
    fields: Readonly<Record<string, string>>
}

export type TriggerInfo = {
    timing: TriggerTiming
    events: readonly TriggerEvent[]
    level: TriggerLevel
    routine: string
}

export type TriggerInfoOf<TTrigger extends TriggerDef> = {
    timing: TTrigger['timing']
    events: TTrigger['events']
    level: TTrigger extends {level: infer TLevel extends TriggerLevel} ? TLevel : 'row'
    routine: TTrigger['routine']
}

export type FkInfoOf<TFk extends FkDef> = {
    entity: TFk['entity']
    fields: TFk['fields'] extends readonly (infer TNames extends string)[] ? {[K in TNames]: K} : TFk['fields']
}

export type EntityInfo<TContext extends SystemEntityContext> = {
    name: string
    record: string
    fields: RecordInfo<TContext>
    pk: readonly string[]
    fks: Readonly<Record<string, FkInfo>>
    uks: Readonly<Record<string, readonly string[]>>
    validators: readonly string[]
    schema: string | null
    table: string | null
    access: AccessDef
    triggers: Readonly<Record<string, TriggerInfo>>
}

/** The type of a completed schema. Nullifying undefined, to be derived. */
export type SchemaInfoOf<TSchema extends string | undefined> = NameInfoOf<TSchema>

/* the same reasoning as the field: the info is derived, so it says its own name. The entity
   does not receive it from anywhere else — its name is the key it has in the map of the system —
   so completeEntity takes it, the way completeField takes the name of the field. */
export type EntityInfoOf<TContext extends SystemEntityContext, TEntityDef extends EntityDef<TContext>> = {
    name: TEntityDef['name']
    record: TEntityDef['record']
    fields: RecordInfoOf<TContext, NotNullableFieldsOf<TContext, TEntityDef['fields'], TEntityDef['pk'][number]>>
    pk: DedupPk<TEntityDef['pk']>
    fks: TEntityDef['fks'] extends Readonly<Record<string, FkDef>>
        ? {[F in keyof TEntityDef['fks']]: FkInfoOf<TEntityDef['fks'][F]>}
        : {}
    uks: TEntityDef['uks'] extends Readonly<Record<string, readonly string[]>> ? TEntityDef['uks'] : {}
    validators: TEntityDef['validators'] extends readonly string[] ? TEntityDef['validators'] : readonly []
    schema: NameInfoOf<TEntityDef['schema']>
    table: NameInfoOf<TEntityDef['table']>
    access: AccessInfoOf<TEntityDef['access']>
    triggers: TEntityDef['triggers'] extends Readonly<Record<string, TriggerDef>>
        ? {[T in keyof TEntityDef['triggers']]: TriggerInfoOf<TEntityDef['triggers'][T]>}
        : {}
}

function completeFk(fkDef: FkDef): FkInfo {
    return {
        entity: fkDef.entity,
        fields: Array.isArray(fkDef.fields)
            ? Object.fromEntries(fkDef.fields.map(name => [name, name]))
            : fkDef.fields,
    };
}

function completeTrigger(triggerDef: TriggerDef): TriggerInfo {
    return {
        timing: triggerDef.timing,
        events: triggerDef.events,
        level: triggerDef.level ?? 'row',
        routine: triggerDef.routine,
    };
}

export function completeEntity<TContext extends SystemEntityContext, const TEntityDef extends EntityDef<TContext>>(
    context: TContext,
    entityDef: TEntityDef,
): EntityInfoOf<TContext, TEntityDef> {
    return {
        name: entityDef.name,
        record: entityDef.record,
        fields: completeRecord(context, notNullableFields(entityDef.fields, entityDef.pk) as RecordDef<TContext>),
        pk: mergePk(entityDef.pk),
        fks: Object.fromEntries(Object.entries(entityDef.fks ?? {}).map(([name, fkDef]) => [name, completeFk(fkDef)])),
        uks: entityDef.uks ?? {},
        validators: entityDef.validators ?? [],
        schema: entityDef.schema ?? null,
        table: entityDef.table ?? null,
        access: entityDef.access ?? {},
        triggers: Object.fromEntries(Object.entries(entityDef.triggers ?? {}).map(([name, triggerDef]) => [name, completeTrigger(triggerDef)])),
    } as EntityInfoOf<TContext, TEntityDef>;
}

/* the instance type of a row of the entity: like the record one, but the pk fields
   are not nullable */
export type EntityInstanceType<TContext extends SystemEntityContext, TEntityDef extends EntityDef<TContext>> =
    RecordInstanceType<TContext, NotNullableFieldsOf<TContext, TEntityDef['fields'], TEntityDef['pk'][number]>>

type SameKeySet<TA extends string, TB extends string> = [TA] extends [TB] ? ([TB] extends [TA] ? true : false) : false

type FkTargetFields<TFk extends FkDef> =
    TFk['fields'] extends readonly string[] ? TFk['fields'][number]
    : TFk['fields'] extends Readonly<Record<string, string>> ? TFk['fields'][keyof TFk['fields']]
    : never

type FkMatchesTargetKey<TFk extends FkDef, TTarget extends AnyEntityDef> =
    SameKeySet<FkTargetFields<TFk>, TTarget['pk'][number]> extends true ? true
    : true extends {[U in keyof NonNullable<TTarget['uks']>]: SameKeySet<FkTargetFields<TFk>, NonNullable<TTarget['uks']>[U][number]>}[keyof NonNullable<TTarget['uks']>] ? true
    : false

type ValidatedFks<TFks extends Readonly<Record<string, FkDef>>, TEntities extends Readonly<Record<string, AnyEntityDef>>> = {
    [F in keyof TFks]: TFks[F]['entity'] extends keyof TEntities
        ? FkMatchesTargetKey<TFks[F], TEntities[TFks[F]['entity'] & keyof TEntities]> extends true
            ? TFks[F]
            : never
        : never
}

export type ValidatedEntities<TEntities extends Readonly<Record<string, AnyEntityDef>>> = {
    [E in keyof TEntities]: {
        name: LocalNameOf<E & string, TEntities[E]['schema']>
        fks?: ValidatedFks<NonNullable<TEntities[E]['fks']>, TEntities>
    }
}

/* system-level checks, where all the entities are known: every fk must point to an entity
   of the system, and its target fields must be the complete pk or one of the uks of it */
export function defineEntities<const TEntities extends Readonly<Record<string, AnyEntityDef>>>(
    entityDefs: TEntities & ValidatedEntities<TEntities>
): TEntities {
    return entityDefs;
}
