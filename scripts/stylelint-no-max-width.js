import stylelint from 'stylelint';

const { createPlugin, utils: { ruleMessages, report } } = stylelint;

const ruleName = 'plugin/no-max-width-media';

const messages = ruleMessages(ruleName, {
  rejected: (params) =>
    `Mobile-First-Verstoß: nutze min-width statt max-width. Gefunden: @media ${params}`,
});

const meta = { url: '' };

// Erlaubte Ausnahmen: prefers-*, orientation, print, etc.
const EXCEPTIONS = /prefers-|orientation|print|height|aspect-ratio|resolution|color|monochrome/;

const rule = () => (root, result) => {
  root.walkAtRules('media', (atRule) => {
    if (/\bmax-width\s*:/.test(atRule.params) && !EXCEPTIONS.test(atRule.params)) {
      report({
        message: messages.rejected(atRule.params),
        node: atRule,
        result,
        ruleName,
        word: 'max-width',
      });
    }
  });
};

rule.ruleName = ruleName;
rule.messages = messages;
rule.meta = meta;

export default createPlugin(ruleName, rule);
