const noUnderscoreReplacementForDisplay = {
  meta: {
    type: 'suggestion',
    docs: { description: 'Use a shared label for machine identifiers displayed to users.' },
    messages: { sharedLabel: 'Advisory: use a shared display label instead of replacing underscores inline.' },
    schema: [],
  },
  create(context) {
    return {
      CallExpression(node) {
        if (node.callee?.type !== 'MemberExpression' || node.callee.property?.name !== 'replaceAll') return;
        if (node.arguments[0]?.type !== 'Literal' || node.arguments[0].value !== '_') return;
        context.report({ node, messageId: 'sharedLabel' });
      },
    };
  },
};

const displayLabelRules = { rules: { 'no-underscore-display': noUnderscoreReplacementForDisplay } };
export default displayLabelRules;
