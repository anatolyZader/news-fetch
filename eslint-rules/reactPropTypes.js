/**
 * ESLint 10–compatible stand-in for eslint-plugin-react's react/prop-types rule.
 * eslint-plugin-react@7.x crashes on ESLint 10 (context.getFilename removed).
 */

const JSX_RETURN_TYPES = new Set([
  'JSXElement',
  'JSXFragment',
]);

function isJsxNode(node) {
  return node && JSX_RETURN_TYPES.has(node.type);
}

function returnsJsx(body) {
  if (!body) return false;
  if (body.type === 'JSXElement' || body.type === 'JSXFragment') return true;
  if (body.type !== 'BlockStatement') return false;
  for (const stmt of body.body) {
    if (stmt.type === 'ReturnStatement' && isJsxNode(stmt.argument)) return true;
  }
  return false;
}

function isComponentName(name) {
  return typeof name === 'string' && /^[A-Z]/.test(name);
}

function acceptsProps(params) {
  return Array.isArray(params) && params.length > 0;
}

/**
 * @param {import('estree').Program} ast
 * @returns {Map<string, Set<string>>}
 */
function collectPropTypesKeys(ast) {
  /** @type {Map<string, Set<string>>} */
  const map = new Map();
  for (const node of ast.body) {
    if (node.type !== 'ExpressionStatement') continue;
    const expr = node.expression;
    if (
      expr?.type !== 'AssignmentExpression'
      || expr.operator !== '='
      || expr.left?.type !== 'MemberExpression'
      || expr.left.computed
      || expr.left.property?.type !== 'Identifier'
      || expr.left.property.name !== 'propTypes'
      || expr.left.object?.type !== 'Identifier'
      || expr.right?.type !== 'ObjectExpression'
    ) {
      continue;
    }
    const keys = new Set(
      expr.right.properties
        .filter((p) => p.type === 'Property' && p.key?.type === 'Identifier')
        .map((p) => p.key.name),
    );
    map.set(expr.left.object.name, keys);
  }
  return map;
}

/**
 * @param {import('estree').Pattern} param
 * @returns {string[]}
 */
function destructuredPropNames(param) {
  if (param?.type !== 'ObjectPattern') return [];
  /** @type {string[]} */
  const names = [];
  for (const prop of param.properties) {
    if (prop.type === 'RestElement') continue;
    if (prop.type !== 'Property' || prop.key?.type !== 'Identifier') continue;
    names.push(prop.key.name);
  }
  return names;
}

function considerComponentFunction(considerFunction, fnNode, name) {
  if (!name || !isComponentName(name)) return;
  if (acceptsProps(fnNode.params) && returnsJsx(fnNode.body)) {
    considerFunction(name, fnNode);
  }
}

function walkVariableComponentDecls(decl, considerFunction) {
  if (decl.id?.type !== 'Identifier') return;
  const init = decl.init;
  if (!init || (init.type !== 'ArrowFunctionExpression' && init.type !== 'FunctionExpression')) {
    return;
  }
  considerComponentFunction(considerFunction, init, decl.id.name);
}

function walkExportDeclarations(node, considerFunction) {
  if (node.type !== 'ExportNamedDeclaration' && node.type !== 'ExportDefaultDeclaration') return;
  const decl = node.declaration;
  if (decl?.type === 'FunctionDeclaration' && decl.id) {
    considerComponentFunction(considerFunction, decl, decl.id.name);
  }
  if (decl?.type === 'VariableDeclaration') {
    for (const varDecl of decl.declarations) {
      walkVariableComponentDecls(varDecl, considerFunction);
    }
  }
}

function walkTopLevelDeclarations(ast, considerFunction) {
  for (const node of ast.body) {
    if (node.type === 'FunctionDeclaration' && node.id) {
      considerComponentFunction(considerFunction, node, node.id.name);
      continue;
    }
    if (node.type === 'ExportNamedDeclaration' || node.type === 'ExportDefaultDeclaration') {
      walkExportDeclarations(node, considerFunction);
      continue;
    }
    if (node.type !== 'VariableDeclaration') continue;
    for (const decl of node.declarations) {
      walkVariableComponentDecls(decl, considerFunction);
    }
  }
}

function getComponentCandidates(ast) {
  const candidates = [];
  walkTopLevelDeclarations(ast, (name, fnNode) => {
    candidates.push({ name, node: fnNode });
  });
  return candidates;
}

/** @type {import('eslint').Rule.RuleModule} */
export const reactPropTypesRule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Require PropTypes on React function components that accept props',
    },
    schema: [],
    messages: {
      missing:
        'Component "{{name}}" accepts props but is missing a {{name}}.propTypes definition.',
      missingProp:
        "'{{prop}}' is missing in props validation",
    },
  },
  create(context) {
    return {
      Program(node) {
        const propTypesByComponent = collectPropTypesKeys(node);
        for (const { name, node: componentNode } of getComponentCandidates(node)) {
          const propKeys = propTypesByComponent.get(name);
          const usedProps = destructuredPropNames(componentNode.params[0]);
          if (!propKeys) {
            if (usedProps.length === 0) continue;
            context.report({
              node: componentNode.id ?? componentNode,
              messageId: 'missing',
              data: { name },
            });
            continue;
          }
          for (const prop of usedProps) {
            if (propKeys.has(prop)) continue;
            context.report({
              node: componentNode.params[0],
              messageId: 'missingProp',
              data: { prop },
            });
          }
        }
      },
    };
  },
};

export const reactPropTypesPlugin = {
  rules: {
    'prop-types': reactPropTypesRule,
  },
};
