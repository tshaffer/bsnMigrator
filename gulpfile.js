let gulp = require('gulp');
let clean = require('gulp-clean');
let concat = require('gulp-concat');
let replace = require('gulp-just-replace');
let through = require('through2');
const os = require('os');

gulp.task('cleanTypes', function () {
  return gulp.src('./temp/decl/*',  {read: false})
    .pipe(clean({force: true}));
});

let declSrc = [
  // add all *.d.ts files to be included in index.d.ts
  './temp/decl/example.d.ts',
];

function consolidateImports () {
  const getImportSet = (src, rxp) => {
    const array = [];
    while (true) {
      let result = rxp.exec(src);
      if (result) {
        array.push(result[1]);
      } else {
        break;
      }
    }
    const set = new Set();
    let splitRxp = /[, ]+/;
    array.forEach(str => {
      let values = str.split(splitRxp);
      values.forEach(val => {
        if (val) {
          set.add(val);
        }
      });
    });
    //console.log(set);
    return set;
  };
  return through.obj(function (file, enc, cb) {
    let src = file.contents.toString();

    let rxp = /import\s{\s*(.*)}.*@brightsign\/bscore.*(\r)?\n/g;
    let importStringsCore = getImportSet(src, rxp);

    let newSrc = '/* tslint:disable:quotemark max-line-length */' + os.EOL;
    if (importStringsCore.size) {
      newSrc = newSrc + 'import {' + [...importStringsCore].join(', ') + '} from \'@brightsign/bscore\';' + os.EOL;
    }
    //console.log(newSrc);
    rxp = /import\s{\s*(.*)}.*@brightsign\/(bscore).*(\r)?\n/g;
    newSrc = newSrc + src.replace(rxp, '');
    file.contents = new Buffer(newSrc);
    this.push(file);
    cb();
  });
}

let replaceSpec = [
  {
    search: /export declare/g,
    replacement: 'export'
  },
  {
    search: /import\s((?!@brightsign\/bscore).)*(\r)?\n/g,
    replacement: ''
  }
];

gulp.task('indexTypescript',function() {
  return gulp.src(declSrc)
    .pipe(replace(replaceSpec))
    .pipe(concat('index.d.ts'))
    .pipe(consolidateImports())
    .pipe(gulp.dest('.'));
});
