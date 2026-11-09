import type { BehaviourCollection, TypeProvider } from "./type-behaviour";
import type { HumanCollection, HumanProvider } from "./human";
import type { JsonValue } from "./type-utils";

/* the types a system is described with. Each system defines its own (Edad, Legajo): the
   framework only provides the mechanism and a handful of common ones. */

export const boxType = <T>() => null as T

/* tsType is a phantom: boxType carries a compile-time type in a value that is null at runtime.
   The parameter was never instantiated with anything (only TypeDef<any>), because the precise
   type of each one comes from the literal that the satisfies preserves, not from the parameter. */
export interface TypeDef {
    tsType: unknown
    /* the type this one takes its behaviour from, by name ('text' for an email). Absent, the
       type is its own base. A name and not a function: the description stays data, and whoever
       implements the type resolves it against what it registered. */
    base?: string
    attrs?: TypeAttrs
}

export type TypeCollection = Record<string, TypeDef>

/* the attributes of a type: its bound is part of its description, so it belongs in the
   definition and not buried in a validator's closure. The vocabulary ships a closed set,
   discriminated by kind, that every implementation can read. */
export type BoundAttrs   = {kind: 'bound'  , maxLength: number}
export type RangeAttrs   = {kind: 'range'  , min: number, max: number}
export type DecimalAttrs = {kind: 'decimal', precision: number, scale: number}
/* elementType names a type of the same collection, the way an fk names an entity: only the
   collection can check it, and defineTypes does */
export type ElementAttrs = {kind: 'element', elementType: string}

export type CommonTypeAttrs = BoundAttrs | RangeAttrs | DecimalAttrs | ElementAttrs
export type CommonAttrKind = CommonTypeAttrs['kind']

/* what a system carries of its own, opaque to the core. `kind?: never` is what keeps it apart
   from the shipped ones: without it, structural typing would let a {maxLength} of its own pass
   for a bound. JsonValue leaves out functions, RegExps and Date: a description is data. */
export type CustomTypeAttrs = {readonly kind?: never} & {readonly [K in string]?: JsonValue}

export type TypeAttrs = CommonTypeAttrs | CustomTypeAttrs

/* which shipped shapes a tsType can carry: a range bounds a number, a bound is a length */
export type AttrsFor<TsType> =
    | (TsType extends readonly unknown[] ? ElementAttrs : never)
    | (TsType extends string ? BoundAttrs | DecimalAttrs : never)
    | (TsType extends number ? RangeAttrs | DecimalAttrs : never)
    | CustomTypeAttrs

/* a type with attributes. It is needed wherever the collection is not written under a
   satisfies: a bare literal would widen kind to string and destroy the discriminant. */
export function defineType<
    TsType,
    const TAttrs extends TypeAttrs,
    const TBase extends string | undefined = undefined,
>(tsType: TsType, attrs: TAttrs & AttrsFor<TsType>, base?: TBase): {tsType: TsType, base: TBase, attrs: TAttrs} {
    return {tsType, base: base as TBase, attrs};
}

type ElementTypeOf<TTypeDef extends TypeDef> =
    NonNullable<TTypeDef['attrs']> extends {kind: 'element', elementType: infer TElement extends string} ? TElement : never

/* the part of the attributes that only the whole collection can settle: the element type of a
   list has to be a type of the collection, and the type of its elements */
export type ValidatedTypes<TTypes extends TypeCollection> = {
    [N in keyof TTypes]: [ElementTypeOf<TTypes[N]>] extends [never] ? TTypes[N]
        : ElementTypeOf<TTypes[N]> extends keyof TTypes
            ? TTypes[N]['tsType'] extends readonly (infer TItem)[]
                ? [TItem] extends [TTypes[ElementTypeOf<TTypes[N]> & keyof TTypes]['tsType']] ? TTypes[N] : never
                : never
            : never
}

/* what the SSOT itself needs to know about a field, and nothing else: the type, to deduce the
   instance type, and whether it admits null. Everything else a field may carry — a label, a
   description, which field names the row, a default value, a width for the grid — belongs to
   the system, which declares its own field def on top of this one. */
export type CoreFieldDef<TTypes extends TypeCollection> = {
    type: keyof TTypes
    nullable?: boolean
}

/* the info carries the name, which the def does not: the def is written inside a map, where
   the key already says it, but the info is a derived value and a derived value is worth having
   self-describing. That is also what allows serializing a map of infos as an ARRAY, which is the
   only way to guarantee the order to a system that does not share the key-order rules of JS.
   It is a denormalization, but a safe one: the framework writes it from the key, not the human. */
export type CoreFieldInfo<TTypes extends TypeCollection> = {
    name: string
    type: keyof TTypes
    nullable: boolean
}

/* completing a field def is behaviour, so it lives in the context and not in the def: the
   defaults are the system's decision, not the framework's. The name comes in because some
   defaults are derived from it (the label). Declaring the parameter as never makes this a
   supertype of every unary completer, so any system's own field def fits the bound. */
export type FieldCompleter = (fieldDef: never, name: string) => object

export type SystemTypeContext = {
    types: TypeCollection
    completeField: FieldCompleter
    behaviours: BehaviourCollection
    /* optional: what a type does not say here is read and written the way it serializes */
    human?: HumanCollection
}

/* the gate where a system's own field def and completer are checked against its types:
   the def has to carry at least the core, and the completed info has to fill it in */
export function defineTypes<
    const TTypes extends TypeCollection,
    TFieldDef extends CoreFieldDef<TTypes>,
    TFieldInfo extends CoreFieldInfo<TTypes>,
>(
    context: {
        types: TTypes & ValidatedTypes<TTypes>
        completeField: (fieldDef: TFieldDef, name: string) => TFieldInfo
        behaviours: TypeProvider<TTypes>
        human?: HumanProvider<TTypes>
    }
): {
    types: TTypes
    completeField: (fieldDef: TFieldDef, name: string) => TFieldInfo
    behaviours: TypeProvider<TTypes>
    human?: HumanProvider<TTypes>
} {
    return context;
}

/* the bound for "a field def of any system at all". It is NOT FieldDef<SystemTypeContext>:
   the field def is the parameter of the completer, and a parameter is contravariant, so the
   widest context yields the narrowest (never) field def. */
export type AnyFieldDef = {
    type: string
    nullable?: boolean
}

/* the core part of the completion, so that a system's completer spreads it instead of writing
   it from scratch: whatever the framework adds to the core later arrives by itself, and the
   system only writes what is its own. The nullable default lives HERE and nowhere else, because
   the static rule (NullPart) says the same thing from the other side — nullable unless it says
   nullable:false, which is also the default of SQL. A system that overrides it in its completer
   makes the info and the deduced type disagree in silence. */
export function completeCoreField<TFieldDef extends AnyFieldDef>(fieldDef: TFieldDef, name: string): {
    name: string
    type: TFieldDef['type']
    nullable: boolean
} {
    return {
        name,
        type: fieldDef.type,
        nullable: fieldDef.nullable ?? true,
    };
}

export const commonTypeDefs = {
    text       : {tsType: boxType<string>()},
    integer    : {tsType: boxType<number>()},
    boolean    : {tsType: boxType<boolean>()},
} satisfies TypeCollection;


/* The identity of a described thing that lives in a database namespace (an entity, a routine):
   its local name, qualified by its schema when it has one */

/** The type of a completed name. Nullifying undefined, to be derived. */
export type NameInfoOf<TName extends string | undefined> = TName extends string ? TName : null

/** The check to ensure a local name is derived from a fully-qualified name.
 * E.g. "ventas.usuarios" -> "usuarios" */
export type LocalNameOf<E extends string, TSchema> =
    TSchema extends string ? (E extends `${TSchema}.${infer TLocal}` ? TLocal : never) : E
