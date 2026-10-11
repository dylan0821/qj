window.MathJax = {
  loader: {load: ['[tex]/boldsymbol'], source: {'[tex]/boldsymbol': new URL('./vendor/boldsymbol.js', document.baseURI).href}},
  tex: {
    inlineMath: [['\\(', '\\)']], displayMath: [['\\[', '\\]']],
    packages: ['base', 'ams', 'newcommand', 'configmacros', 'boldsymbol'],
    processEscapes: true,
    macros: {
      le: '\\leqslant', leq: '\\leqslant', ge: '\\geqslant', geq: '\\geqslant',
      overparen: ['\\overset{\\frown}{#1}', 1],
      wideparen: ['\\overset{\\frown}{#1}', 1],
      textless: '<', textgreater: '>', allowbreak: '', qedhere: '\\quad\\Box'
    }
  },
  svg: {fontCache: 'local'},
  startup: {typeset: false},
  options: {enableMenu: false}
};
