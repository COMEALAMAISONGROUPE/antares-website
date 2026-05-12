/* Stylelint config — tuned for the codebase's intentional choices:
   - Compact single-line CSS rules (no opinionated formatting)
   - Mixed shorthand and longhand (designer choice, not a bug)
   - The mobile-fixes.css uses !important liberally on purpose
   Only rules that catch REAL bugs are enabled. No formatting rules. */
export default {
  rules: {
    'block-no-empty': true,
    'color-no-invalid-hex': true,
    'declaration-block-no-duplicate-properties': [true, { ignore: ['consecutive-duplicates-with-different-values'] }],
    'declaration-block-no-shorthand-property-overrides': true,
    'font-family-no-duplicate-names': true,
    'function-calc-no-unspaced-operator': true,
    'function-linear-gradient-no-nonstandard-direction': true,
    'keyframe-declaration-no-important': true,
    'media-feature-name-no-unknown': true,
    'no-duplicate-at-import-rules': true,
    'no-empty-source': true,
    'no-invalid-double-slash-comments': true,
    'property-no-unknown': true,
    'selector-pseudo-class-no-unknown': [true, { ignorePseudoClasses: ['focus-visible'] }],
    'selector-pseudo-element-no-unknown': true,
    'selector-type-no-unknown': [true, { ignore: ['custom-elements'] }],
    'string-no-newline': true,
    'unit-no-unknown': true,
  },
};
