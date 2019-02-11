module.exports = {
  entry: './lib/index.ts',
  output: {
    path: __dirname + '/dist',
    filename: 'bsnCm.js',
    library: 'bsnCm',
    libraryTarget: 'umd'
  },
  target: 'node',
  devtool: "source-map",
  externals: {
    'core-js/fn/object/assign' : 'commonjs core-js/fn/object/assign',
    'core-js/fn/array/from' : 'commonjs core-js/fn/array/from',
    'core-js/es6/promise' : 'commonjs core-js/es6/promise',
    'core-js/es6/set' : 'commonjs core-js/es6/set',
    'lodash': 'commonjs lodash',
    // '@brightsign/bscore': 'commonjs @brightsign/bscore',
    // '@brighsign/bsnconnector': 'commonjs @brightsign/bsnconnector',
    // '@brightsign/bs-content-manager': 'commonjs @brightsign/bs-content-manager',
    // '@brightsign/bsDataModel': 'commonjs @brightsign/bsDataModel',
    // '@brightsign/bs-data-feed-dm': 'commonjs @brightsign/bs-data-feed-dm',
    // '@brightsign/bs-playlist-dm': 'commonjs @brightsign/bs-playlist-dm',
    // '@brightsign/bs-configurator': 'commonjs @brightsign/bs-configurator',
    // "@brightsign/bs-device-artifacts": "commonjs @brightsign/bs-device-artifacts",
    // '@brightsign/bs-task-manager': 'commonjs @brightsign/bs-task-manager',
    // '@brightsign/fs-metadata': 'commonjs @brightsign/fs-metadata'
  },
  resolve: {
    extensions: ['.ts', '.js']
  },
  module: {
    rules: [
      // all files with a `.ts` or `.tsx` extension will be handled by `awesome-typescript-loader`
      { test: /\.tsx?$/, loader: 'awesome-typescript-loader' }
    ]
  }
};
