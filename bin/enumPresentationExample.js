const util = require('util');
const {inspect} = util;
const fs = require('fs');

const DM_DEV = true;
let bsn = require('@brightsign/bsnconnector')

const {bsnGetSession, BsnSessionStatus} = bsn;

// If desired, create a json file for alternate credentials: ./test_data/credentials.json
// Credentials object may also have an optional 'serverUrl' property to specify an alternate BSN url
let credentials;
try {
  credentials = require('../config/credentials.json');
} catch (error) {
  credentials = {
    user: 'ted@brightsign.biz',
    password: 'admin',
    network: 'ted',
    serverUrl: null,      // 'https://beta.brightsignnetwork.com:8443' // production test
  };
}

// user: 'fvillegas@motionad.tv',
// password: 'admin',
// network: 'fvillegas',

// user: 'rgardner@brightsign.biz',
// password: 'admin',
// network: 'Xfinity_Prod',

// user: 'content@divmedia.net',
// password: 'admin',
// network: 'Diversified Media Group',

// user: 'ted@brightsign.biz',
// password: 'admin',
// network: 'ted',

// bsnGetSession returns singleton session - initializes if necessary
// Call activate function to log in
console.log('Logging In ...');
bsnGetSession().activate(credentials.user, credentials.password, credentials.network, credentials.serverUrl)
  .then((session) => {
    // Not necessary, but here we look at session status and properties
    console.log('Session Status: ', BsnSessionStatus[session.status]);
    console.log(inspect(session, {depth: null, colors: true}));
    console.log('');

    // Retrieve unfiltered presentation list
    // This shows all presentation, including 'Simple' (old BSN WebUI) presentations
    //  and the 'Disabled Players' presentation. Note that these do not have project files.
    console.log('Getting all presentations ...');
    return bsnGetSession().getPresentationList();
  })
  .then((items) => {

    console.log('All Presentations:');
    console.log(inspect(items, {depth: null, colors: true}));
    // console.log('');

    // Now we will get the list again, but with a filter string that will only give
    //  us 'Complete' presentations with project files
    let filterExpression = '[type] IS \'Complete\' AND [ProjectFile] IS NOT NULL';
    console.log('Getting bpf/bpfx presentations ...');
    return bsnGetSession().getPresentationList({filterExpression});
  })
  .then((items) => {
    console.log('Filtered Presentations:');
    // console.log(inspect(items, {depth: null, colors: true}));
    // console.log('');

    var outputStr = '';
    items.forEach( (item) => {
      var itemStr = JSON.stringify(item);
      outputStr = outputStr.concat(itemStr);
      outputStr += '\n';
    })
    fs.writeFileSync('presentationFilesSpec.txt', outputStr);
  })
  .catch((error) => console.log('Error: ', error.message));
