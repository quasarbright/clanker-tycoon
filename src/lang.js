// The worker language: a small subset of JavaScript.
//
// The model writes a worker's program as plain JS text. We parse it with acorn (an off-the-shelf
// parser), check it stays inside the subset, and run the syntax tree ourselves. We never hand it to
// the real JS engine, so the program can't touch the page; it only sees the tools we pass in.
//
// The interpreter is a coroutine (a generator): running a program yields one action at a time
// (move, pick up, pack, …), the sim performs it over however many seconds it takes, then resumes
// the program with the action's result (true if it worked). Questions (count, holding, needs, …)
// answer instantly without yielding. A program that evaluates too much without acting is stopped
// with a "loop" error, which the game treats as something unexpected for the worker to think about.
//
// Kept free of game and model specifics: the tool names and what they do come from the caller.
import * as acorn from "acorn";

/** How much a program may evaluate between two actions before we call it a runaway loop. */
export const STEP_LIMIT = 4000;

export class ProgramError extends Error {
  /** kind: "parse" | "subset" | "unknown" | "skill" (checking) or "loop" | "runtime" (running) */
  constructor(message, kind) { super(message); this.kind = kind; }
}

const ALLOWED = new Set([
  "Program", "ExpressionStatement", "BlockStatement", "EmptyStatement",
  "VariableDeclaration", "VariableDeclarator", "FunctionDeclaration", "ReturnStatement",
  "IfStatement", "WhileStatement", "ForStatement", "ForOfStatement", "BreakStatement", "ContinueStatement",
  "Identifier", "Literal", "ArrayExpression", "MemberExpression",
  "UnaryExpression", "BinaryExpression", "LogicalExpression", "ConditionalExpression",
  "AssignmentExpression", "UpdateExpression", "CallExpression",
]);

/** Parse program text. Throws ProgramError("parse") with acorn's message. */
export function parseProgram(src) {
  try {
    return acorn.parse(String(src ?? ""), { ecmaVersion: 2022 });
  } catch (e) {
    throw new ProgramError(`parse error: ${e.message}`, "parse");
  }
}

/**
 * Check a parsed program. `tools` = { actions: [names the worker can use], queries: [names],
 * known: [every action name in the game] }. A call to a known action the worker can't use is a
 * "skill" problem (the instructions asked for something they can't do); anything else wrong is
 * the model's fault. Returns a list of { kind, message }.
 */
export function checkProgram(ast, { actions, queries, known }) {
  const problems = [];
  const add = (kind, message) => { if (!problems.some((p) => p.message === message)) problems.push({ kind, message }); };
  const declared = new Set(["undefined"]);
  walk(ast, (n) => {
    if (n.type === "VariableDeclarator" && n.id.type === "Identifier") declared.add(n.id.name);
    if (n.type === "FunctionDeclaration") { declared.add(n.id.name); for (const p of n.params) if (p.type === "Identifier") declared.add(p.name); }
    if (n.type === "ForOfStatement" && n.left.type === "VariableDeclaration") for (const d of n.left.declarations) if (d.id.type === "Identifier") declared.add(d.id.name);
  });
  walk(ast, (n, parent) => {
    if (!ALLOWED.has(n.type)) add("subset", `${n.type} isn't allowed`);
    if (n.type === "VariableDeclaration" && n.kind === "var") add("subset", "use let or const, not var");
    if (n.type === "Literal" && n.regex) add("subset", "regular expressions aren't allowed");
    if (n.type === "FunctionDeclaration" && (n.async || n.generator)) add("subset", "async and generator functions aren't allowed");
    if (n.type === "FunctionDeclaration" && n.params.some((p) => p.type !== "Identifier")) add("subset", "function parameters must be plain names");
    if (n.type === "MemberExpression" && !n.computed && n.property.name !== "length") add("subset", `.${n.property.name} isn't allowed (only .length and [index])`);
    if (n.type === "AssignmentExpression" && n.left.type !== "Identifier") add("subset", "you can only assign to plain variables");
    if (n.type === "UpdateExpression" && n.argument.type !== "Identifier") add("subset", "++ and -- only work on plain variables");
    if (n.type === "CallExpression") {
      if (n.callee.type !== "Identifier") add("subset", "only plain function calls are allowed (no methods)");
      else {
        const name = n.callee.name;
        if (actions.includes(name) || queries.includes(name) || declared.has(name)) { /* fine */ }
        else if (known.includes(name)) add("skill", `${name}() needs a skill this worker doesn't have`);
        else add("unknown", `there's no function called ${name}()`);
      }
    }
    if (n.type === "Identifier" && parent && isReference(n, parent) && !declared.has(n.name)) add("unknown", `unknown name ${n.name}`);
  });
  return problems;
}

function isReference(n, parent) {
  if (parent.type === "MemberExpression" && parent.property === n && !parent.computed) return false;
  if (parent.type === "CallExpression" && parent.callee === n) return false;
  if (parent.type === "FunctionDeclaration") return false;
  if (parent.type === "VariableDeclarator" && parent.id === n) return false;
  return true;
}

function walk(node, visit, parent = null) {
  if (!node || typeof node !== "object" || typeof node.type !== "string") return;
  visit(node, parent);
  for (const key in node) {
    if (key === "type" || key === "start" || key === "end") continue;
    const v = node[key];
    if (Array.isArray(v)) for (const c of v) walk(c, visit, node);
    else if (v && typeof v === "object" && typeof v.type === "string") walk(v, visit, node);
  }
}

// ---------- the interpreter ----------

class Env {
  constructor(parent = null) { this.vars = new Map(); this.parent = parent; }
  declare(name, value) { this.vars.set(name, value); }
  lookup(name) {
    for (let e = this; e; e = e.parent) if (e.vars.has(name)) return e;
    return null;
  }
}
const BREAK = Symbol("break"), CONTINUE = Symbol("continue");
class Return { constructor(value) { this.value = value; } }

/**
 * Run a parsed program as a coroutine. `tools` = { actions: {name: (...args) => actionObject},
 * queries: {name: (...args) => value} }. Each action call yields its action object; whatever the
 * caller passes to next() becomes the call's result. Throws ProgramError("loop" | "runtime").
 */
export function* runProgram(ast, tools) {
  const ctx = { steps: 0, tools };
  const env = new Env();
  yield* block(ast.body, env, ctx);
}

function* block(stmts, env, ctx) {
  for (const s of stmts) if (s.type === "FunctionDeclaration") env.declare(s.id.name, { fn: s, closure: env });
  for (const s of stmts) yield* exec(s, env, ctx);
}

function tick(ctx) {
  if (++ctx.steps > STEP_LIMIT) throw new ProgramError("the program went round and round without doing anything", "loop");
}

function* exec(n, env, ctx) {
  tick(ctx);
  switch (n.type) {
    case "ExpressionStatement": yield* ev(n.expression, env, ctx); return;
    case "EmptyStatement": case "FunctionDeclaration": return;
    case "BlockStatement": yield* block(n.body, new Env(env), ctx); return;
    case "VariableDeclaration":
      for (const d of n.declarations) env.declare(d.id.name, d.init ? yield* ev(d.init, env, ctx) : undefined);
      return;
    case "IfStatement":
      if (yield* ev(n.test, env, ctx)) yield* exec(n.consequent, env, ctx);
      else if (n.alternate) yield* exec(n.alternate, env, ctx);
      return;
    case "WhileStatement":
      while (yield* ev(n.test, env, ctx)) {
        const r = yield* loopBody(n.body, env, ctx);
        if (r === BREAK) break;
      }
      return;
    case "ForStatement": {
      const scope = new Env(env);
      if (n.init) n.init.type === "VariableDeclaration" ? yield* exec(n.init, scope, ctx) : yield* ev(n.init, scope, ctx);
      while (!n.test || (yield* ev(n.test, scope, ctx))) {
        const r = yield* loopBody(n.body, scope, ctx);
        if (r === BREAK) break;
        if (n.update) yield* ev(n.update, scope, ctx);
      }
      return;
    }
    case "ForOfStatement": {
      const list = yield* ev(n.right, env, ctx);
      if (!Array.isArray(list)) throw new ProgramError("for...of needs a list", "runtime");
      const name = n.left.type === "VariableDeclaration" ? n.left.declarations[0].id.name : n.left.name;
      for (const item of list) {
        const scope = new Env(env);
        scope.declare(name, item);
        const r = yield* loopBody(n.body, scope, ctx);
        if (r === BREAK) break;
      }
      return;
    }
    case "BreakStatement": throw BREAK;
    case "ContinueStatement": throw CONTINUE;
    case "ReturnStatement": throw new Return(n.argument ? yield* ev(n.argument, env, ctx) : undefined);
    default: throw new ProgramError(`${n.type} isn't allowed`, "runtime");
  }
}

function* loopBody(body, env, ctx) {
  try { yield* exec(body, env, ctx); } catch (e) {
    if (e === BREAK) return BREAK;
    if (e === CONTINUE) return CONTINUE;
    throw e;
  }
  return null;
}

function* ev(n, env, ctx) {
  tick(ctx);
  switch (n.type) {
    case "Literal": return n.value;
    case "Identifier": {
      if (n.name === "undefined") return undefined;
      const e = env.lookup(n.name);
      if (!e) throw new ProgramError(`unknown name ${n.name}`, "runtime");
      return e.vars.get(n.name);
    }
    case "ArrayExpression": {
      const out = [];
      for (const el of n.elements) out.push(yield* ev(el, env, ctx));
      return out;
    }
    case "MemberExpression": {
      const obj = yield* ev(n.object, env, ctx);
      if (obj == null) throw new ProgramError("tried to look inside nothing", "runtime");
      if (!n.computed) return obj.length;
      return obj[yield* ev(n.property, env, ctx)];
    }
    case "UnaryExpression": {
      const v = yield* ev(n.argument, env, ctx);
      switch (n.operator) {
        case "!": return !v;
        case "-": return -v;
        case "+": return +v;
        default: throw new ProgramError(`operator ${n.operator} isn't allowed`, "runtime");
      }
    }
    case "BinaryExpression": {
      const a = yield* ev(n.left, env, ctx), b = yield* ev(n.right, env, ctx);
      switch (n.operator) {
        case "+": return a + b; case "-": return a - b; case "*": return a * b;
        case "/": return a / b; case "%": return a % b;
        case "===": case "==": return a === b;
        case "!==": case "!=": return a !== b;
        case "<": return a < b; case ">": return a > b; case "<=": return a <= b; case ">=": return a >= b;
        default: throw new ProgramError(`operator ${n.operator} isn't allowed`, "runtime");
      }
    }
    case "LogicalExpression": {
      const a = yield* ev(n.left, env, ctx);
      if (n.operator === "&&") return a ? yield* ev(n.right, env, ctx) : a;
      if (n.operator === "||") return a ? a : yield* ev(n.right, env, ctx);
      if (n.operator === "??") return a ?? (yield* ev(n.right, env, ctx));
      throw new ProgramError(`operator ${n.operator} isn't allowed`, "runtime");
    }
    case "ConditionalExpression":
      return (yield* ev(n.test, env, ctx)) ? yield* ev(n.consequent, env, ctx) : yield* ev(n.alternate, env, ctx);
    case "AssignmentExpression": {
      const e = env.lookup(n.left.name);
      if (!e) throw new ProgramError(`unknown name ${n.left.name}`, "runtime");
      const v = yield* ev(n.right, env, ctx), old = e.vars.get(n.left.name);
      const val = n.operator === "=" ? v : n.operator === "+=" ? old + v : n.operator === "-=" ? old - v : n.operator === "*=" ? old * v : undefined;
      if (val === undefined && n.operator !== "=") throw new ProgramError(`operator ${n.operator} isn't allowed`, "runtime");
      e.vars.set(n.left.name, val);
      return val;
    }
    case "UpdateExpression": {
      const e = env.lookup(n.argument.name);
      if (!e) throw new ProgramError(`unknown name ${n.argument.name}`, "runtime");
      const old = e.vars.get(n.argument.name), val = n.operator === "++" ? old + 1 : old - 1;
      e.vars.set(n.argument.name, val);
      return n.prefix ? val : old;
    }
    case "CallExpression": {
      const name = n.callee.name;
      const args = [];
      for (const a of n.arguments) args.push(yield* ev(a, env, ctx));
      const user = env.lookup(name);
      if (user && user.vars.get(name)?.fn) return yield* callUser(user.vars.get(name), args, ctx);
      if (ctx.tools.queries[name]) return ctx.tools.queries[name](...args);
      if (ctx.tools.actions[name]) {
        const result = yield ctx.tools.actions[name](...args);
        ctx.steps = 0; // acting resets the runaway-loop counter
        return result;
      }
      throw new ProgramError(`there's no function called ${name}()`, "runtime");
    }
    default: throw new ProgramError(`${n.type} isn't allowed`, "runtime");
  }
}

function* callUser({ fn, closure }, args, ctx) {
  const scope = new Env(closure);
  fn.params.forEach((p, i) => scope.declare(p.name, args[i]));
  try { yield* block(fn.body.body, scope, ctx); } catch (e) {
    if (e instanceof Return) return e.value;
    throw e;
  }
  return undefined;
}
