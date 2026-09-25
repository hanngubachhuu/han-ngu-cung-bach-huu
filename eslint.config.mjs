import js from '@eslint/js';
import globals from 'globals';
export default [
 {ignores:['dist/**','node_modules/**','data/**','study/vendor/**']},
 {files:['study/*.mjs','server/*.mjs','api/*.js','tests/*.mjs','scripts/*study*.mjs','scripts/build-web.mjs','scripts/dev-server.mjs'],
  languageOptions:{ecmaVersion:'latest',sourceType:'module',globals:{...globals.browser,...globals.node}},
  rules:{...js.configs.recommended.rules,'no-unused-vars':['error',{argsIgnorePattern:'^_',caughtErrors:'none'}],'no-empty':['error',{allowEmptyCatch:true}]}}
];
