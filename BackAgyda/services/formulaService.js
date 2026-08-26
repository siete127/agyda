// Evaluador seguro de fórmulas matemáticas con variables, para reglas de negocio
// configurables por el usuario (ej. incentivos de Ventas) sin usar eval()/Function()
// ni ejecutar código arbitrario. Soporta: + - * / ( ), comparadores > >= < <= == !=,
// y la función IF(condicion, siVerdadero, siFalso).

const TOKEN_RE = /\s*(=>|<=|>=|==|!=|[()+\-*/,<>]|[A-Za-z_][A-Za-z0-9_]*|\d+(?:\.\d+)?)\s*/y;

function tokenize(expr) {
  const tokens = [];
  let pos = 0;
  TOKEN_RE.lastIndex = 0;
  while (pos < expr.length) {
    TOKEN_RE.lastIndex = pos;
    const m = TOKEN_RE.exec(expr);
    if (!m || m.index !== pos) throw new Error(`Carácter inválido en la fórmula cerca de: "${expr.slice(pos, pos + 10)}"`);
    tokens.push(m[1]);
    pos = TOKEN_RE.lastIndex;
  }
  return tokens;
}

class Parser {
  constructor(tokens, variables) {
    this.tokens = tokens;
    this.i = 0;
    this.variables = variables;
  }
  peek() { return this.tokens[this.i]; }
  next() { return this.tokens[this.i++]; }
  expect(tok) {
    if (this.peek() !== tok) throw new Error(`Se esperaba "${tok}" en la fórmula`);
    return this.next();
  }

  parseExpression() { return this.parseComparison(); }

  parseComparison() {
    let left = this.parseAdditive();
    const ops = ['==', '!=', '>=', '<=', '>', '<'];
    while (ops.includes(this.peek())) {
      const op = this.next();
      const right = this.parseAdditive();
      left = this.applyComparison(op, left, right);
    }
    return left;
  }

  applyComparison(op, a, b) {
    switch (op) {
      case '==': return a === b;
      case '!=': return a !== b;
      case '>=': return a >= b;
      case '<=': return a <= b;
      case '>': return a > b;
      case '<': return a < b;
      default: throw new Error(`Operador desconocido: ${op}`);
    }
  }

  parseAdditive() {
    let left = this.parseMultiplicative();
    while (this.peek() === '+' || this.peek() === '-') {
      const op = this.next();
      const right = this.parseMultiplicative();
      left = op === '+' ? left + right : left - right;
    }
    return left;
  }

  parseMultiplicative() {
    let left = this.parseUnary();
    while (this.peek() === '*' || this.peek() === '/') {
      const op = this.next();
      const right = this.parseUnary();
      if (op === '/') {
        if (right === 0) throw new Error('División entre cero en la fórmula');
        left = left / right;
      } else {
        left = left * right;
      }
    }
    return left;
  }

  parseUnary() {
    if (this.peek() === '-') { this.next(); return -this.parseUnary(); }
    if (this.peek() === '+') { this.next(); return this.parseUnary(); }
    return this.parsePrimary();
  }

  parsePrimary() {
    const tok = this.peek();
    if (tok === undefined) throw new Error('Fórmula incompleta');

    if (tok === '(') {
      this.next();
      const val = this.parseExpression();
      this.expect(')');
      return val;
    }

    if (/^\d/.test(tok)) {
      this.next();
      return parseFloat(tok);
    }

    if (/^[A-Za-z_]/.test(tok)) {
      this.next();
      if (this.peek() === '(') {
        return this.parseFunctionCall(tok);
      }
      const name = tok.toLowerCase();
      if (!(name in this.variables)) throw new Error(`Variable desconocida: "${tok}"`);
      const v = this.variables[name];
      return v === null || v === undefined ? 0 : v;
    }

    throw new Error(`Token inesperado en la fórmula: "${tok}"`);
  }

  parseFunctionCall(name) {
    this.expect('(');
    const args = [];
    if (this.peek() !== ')') {
      args.push(this.parseExpression());
      while (this.peek() === ',') { this.next(); args.push(this.parseExpression()); }
    }
    this.expect(')');
    const fn = name.toUpperCase();
    if (fn === 'IF') {
      if (args.length !== 3) throw new Error('IF requiere 3 argumentos: IF(condicion, siVerdadero, siFalso)');
      return args[0] ? args[1] : args[2];
    }
    if (fn === 'MIN') return Math.min(...args);
    if (fn === 'MAX') return Math.max(...args);
    if (fn === 'ROUND') return Math.round(args[0]);
    throw new Error(`Función desconocida: "${name}"`);
  }
}

// Valida sintácticamente una fórmula contra un set de variables de ejemplo (todas en 0),
// sin necesidad de datos reales. Lanza Error con mensaje legible si es inválida.
function validarFormula(expr, variablesPermitidas) {
  const vars = {};
  for (const v of variablesPermitidas) vars[v] = 0;
  evaluarFormula(expr, vars);
}

// Evalúa una fórmula contra un objeto de variables (claves en minúsculas). Devuelve un
// número; si la expresión raíz es un booleano (ej. solo "ventas >= 10"), lo convierte
// a 1/0.
function evaluarFormula(expr, variables) {
  if (!expr || typeof expr !== 'string' || !expr.trim()) throw new Error('La fórmula no puede estar vacía');
  const varsLower = {};
  for (const [k, v] of Object.entries(variables)) varsLower[k.toLowerCase()] = v;
  const tokens = tokenize(expr);
  const parser = new Parser(tokens, varsLower);
  const result = parser.parseExpression();
  if (parser.i !== tokens.length) throw new Error(`Texto sobrante al final de la fórmula: "${tokens.slice(parser.i).join(' ')}"`);
  if (typeof result === 'boolean') return result ? 1 : 0;
  if (typeof result !== 'number' || Number.isNaN(result)) throw new Error('La fórmula no produjo un número válido');
  return Math.round(result * 100) / 100;
}

module.exports = { evaluarFormula, validarFormula };
