import * as assert from "assert";

import { completeEntity, defineEntity, defineEntities, inSchema, withRecords } from "../src/common/ssot-entity";
import { defineRecord } from "../src/common/ssot-record";
import { RoutineInfoOf, completeRoutine, defineRoutine, defineRoutines, withRoutines } from "../src/common/ssot-routine";
import { aida, alumnos, docentes, entityDefs, routineDefs } from "../examples/common/aida";
import { aidaConReglas, aidaTypes } from "../examples/common/aida-context";

type IsAssignable<A, B> = [A] extends [B] ? true : false

/* the routines of a test system of its own: a context with the aida types and two routines */
const minusculas = defineRoutine(aidaTypes, {
    kind: 'trigger',
    name: 'minusculas',
    language: 'plpgsql',
    body: 'begin new.email := lower(new.email); return new; end',
})
const cuantos = defineRoutine(aidaTypes, {
    kind: 'function',
    name: 'cuantos',
    params: {desde: {type: 'fecha'}},
    returns: 'integer',
    language: 'sql',
    body: 'select 1',
})
const conRutinas = withRoutines(aidaConReglas, {minusculas, cuantos})

describe("routines", function(){
    it("are descriptions: defineRoutine returns the same def, with its literals", function(){
        var kind: 'function' = cuantos.kind;
        var returns: 'integer' = cuantos.returns;
        var paramType: 'fecha' = cuantos.params.desde.type;
        assert.equal(kind, 'function');
        assert.equal(returns, 'integer');
        assert.equal(paramType, 'fecha');
        // a def carries no functions, so it survives json
        assert.deepStrictEqual(JSON.parse(JSON.stringify(routineDefs)), routineDefs);
    })
    it("type their params and their result with the types of the system", function(){
        // @ts-expect-error a param of a type the system does not declare
        defineRoutine(aidaTypes, {kind: 'function', name: 'f', params: {x: {type: 'importe'}}, returns: 'integer', language: 'sql', body: ''});
        // @ts-expect-error a result of a type the system does not declare
        defineRoutine(aidaTypes, {kind: 'function', name: 'f', returns: 'importe', language: 'sql', body: ''});
        // @ts-expect-error a function says what it returns
        defineRoutine(aidaTypes, {kind: 'function', name: 'f', language: 'sql', body: ''});
    })
    it("tell the three kinds apart by what each one may say", function(){
        // @ts-expect-error a procedure returns nothing
        defineRoutine(aidaTypes, {kind: 'procedure', name: 'p', returns: 'integer', language: 'sql', body: ''});
        // @ts-expect-error a trigger routine takes no params: it reads the row
        defineRoutine(aidaTypes, {kind: 'trigger', name: 't', params: {x: {type: 'text'}}, language: 'plpgsql', body: ''});
        // @ts-expect-error a trigger routine returns `trigger` by being one, so it does not say it
        defineRoutine(aidaTypes, {kind: 'trigger', name: 't', returns: 'text', language: 'plpgsql', body: ''});
        // @ts-expect-error a trigger routine cannot be written in plain sql
        defineRoutine(aidaTypes, {kind: 'trigger', name: 't', language: 'sql', body: ''});
        // @ts-expect-error the language is a closed set
        defineRoutine(aidaTypes, {kind: 'procedure', name: 'p', language: 'python', body: ''});
    })
    it("complete to an info where everything is explicit", function(){
        assert.deepStrictEqual(completeRoutine(minusculas), {
            kind: 'trigger', name: 'minusculas', schema: null, params: {}, returns: null,
            language: 'plpgsql', body: 'begin new.email := lower(new.email); return new; end',
        });
        var info = completeRoutine(cuantos);
        var returns: 'integer' = info.returns;
        var schema: null = info.schema;
        type Trigger = RoutineInfoOf<typeof minusculas>
        var noParams: IsAssignable<Trigger['params'], {}> = true;
        var noReturns: IsAssignable<Trigger['returns'], null> = true;
        assert.equal(returns, 'integer');
        assert.equal(schema, null);
        assert.ok(noParams && noReturns);
    })
    it("accumulate in the context, stage by stage", function(){
        var masRutinas = withRoutines(conRutinas, {otra: defineRoutine(aidaTypes, {kind: 'procedure', name: 'otra', language: 'sql', body: 'select 1'})});
        assert.deepStrictEqual(Object.keys(masRutinas.routines), ['minusculas', 'cuantos', 'otra']);
        // the stage before is still there
        assert.ok(masRutinas.validators);
    })
    it("are keyed by their identity, qualified by inSchema", function(){
        var evaluacion = inSchema('evaluacion', {cuantos});
        assert.deepStrictEqual(Object.keys(evaluacion), ['evaluacion.cuantos']);
        assert.equal(evaluacion['evaluacion.cuantos'].schema, 'evaluacion');
        assert.ok(defineRoutines({cuantos, ...evaluacion}));
        // @ts-expect-error the key must be the name of the routine
        defineRoutines({otro: cuantos});
        assert.equal(completeRoutine(evaluacion['evaluacion.cuantos']).schema, 'evaluacion');
    })
})

describe("triggers", function(){
    const persona = defineRecord(aidaTypes, {
        persona: {type: 'text'},
        email  : {type: 'email'},
    })
    const conPersona = withRecords(conRutinas, {persona})

    it("belong to the entity, and name the routine they run", function(){
        const personas = defineEntity(conPersona, {
            name: 'personas', record: 'persona', pk: ['persona'],
            triggers: {minusculas: {timing: 'before', events: ['insert', 'update'], routine: 'minusculas'}},
        });
        var routine: 'minusculas' = personas.triggers.minusculas.routine;
        assert.equal(routine, 'minusculas');
    })
    it("may only name a trigger routine of the system", function(){
        defineEntity(conPersona, {name: 'personas', record: 'persona', pk: ['persona'],
            // @ts-expect-error no routine of that name
            triggers: {t: {timing: 'before', events: ['insert'], routine: 'inexistente'}}});
        defineEntity(conPersona, {name: 'personas', record: 'persona', pk: ['persona'],
            // @ts-expect-error a function that is not a trigger routine
            triggers: {t: {timing: 'before', events: ['insert'], routine: 'cuantos'}}});
        defineEntity(conPersona, {name: 'personas', record: 'persona', pk: ['persona'],
            // @ts-expect-error the events are a closed set
            triggers: {t: {timing: 'before', events: ['truncar'], routine: 'minusculas'}}});
        defineEntity(conPersona, {name: 'personas', record: 'persona', pk: ['persona'],
            // @ts-expect-error and so is the timing
            triggers: {t: {timing: 'durante', events: ['insert'], routine: 'minusculas'}}});
    })
    it("complete: a trigger is per row unless it says otherwise, and an entity without any has none", function(){
        const personas = defineEntity(conPersona, {
            name: 'personas', record: 'persona', pk: ['persona'],
            triggers: {
                minusculas: {timing: 'before', events: ['insert', 'update'], routine: 'minusculas'},
                una_vez   : {timing: 'after' , events: ['delete'], level: 'statement', routine: 'minusculas'},
            },
        });
        const info = completeEntity(conPersona, personas);
        var level: 'row' = info.triggers.minusculas.level;
        var statement: 'statement' = info.triggers.una_vez.level;
        assert.equal(level, 'row');
        assert.equal(statement, 'statement');
        const sinTriggers = completeEntity(conPersona, defineEntity(conPersona, {name: 'personas', record: 'persona', pk: ['persona']}));
        assert.deepStrictEqual(sinTriggers.triggers, {});
    })
})

describe("the routines of aida", function(){
    it("one trigger routine runs in two entities", function(){
        assert.equal(docentes.triggers.email_en_minusculas.routine, 'email_en_minusculas');
        assert.equal(alumnos.triggers.email_en_minusculas.routine, 'email_en_minusculas');
        assert.equal(routineDefs.email_en_minusculas.kind, 'trigger');
    })
    it("has a function and a procedure besides, and all of them are in the context", function(){
        var kinds = Object.values(routineDefs).map(r => r.kind).sort();
        assert.deepStrictEqual(kinds, ['function', 'procedure', 'trigger']);
        assert.deepStrictEqual(Object.keys(aida.routines), Object.keys(routineDefs));
        assert.ok(entityDefs.docentes.triggers);
    })
})
