const fs = require('fs');
const util = require('util');
const { inspect } = util;

let bsnCm = require('../');
const { bsnCmGetMigrationSpec, BsnContentMigrateJob } = bsnCm;

const scope = 'Spectrio-Rush';
const authentication = {
  "userName": "chill@triggerpointmedia.com",
  "password": "admin",
  "networkName": scope
};

// const scope = 'CRI_Test';
// const authentication = {
//   "userName": "jpiros@brightsign.biz",
//   "password": "admin",
//   "networkName": "CRI_Test"      
// };
// const inputFile = 'presentationFilesSpecJanAccountCRI_TestNetwork.txt'; 

// const scope = 'ted';
// const authentication = {
//   "userName": "ted@brightsign.biz",
//   "password": "admin",
//   "networkName": "ted"      
// };
// const inputFile = 'presentationFilesSpecTedAccountTedNetwork.txt'; 

// const scope = 'Xfinity_Prod';
// const authentication = {
//   "userName": 'rgardner@brightsign.biz',
//   "password": "admin",
//   "networkName": scope,      
// };
// const inputFile = 'presentationFilesSpec.txt'; 

// const scope = 'MDA001';
// const authentication = {
//   "userName": 'dragan@escapes.net',
//   "password": "admin",
//   "networkName": scope,      
// };
const inputFile = 'presentationFilesSpec.txt'; 

var presentationSpecs = [];

// const credentialsSet = [
//   {
//     user: 'rgardner@brightsign.biz',
//     password: 'admin',
//     network: 'FHLBNY',
//     serverUrl: null,
//   },
//   {
//     user: 'rgardner@brightsign.biz',
//     password: 'admin',
//     network: 'DelphiDemo',
//     serverUrl: null,
//   }
// ]

function convertFiles(presentationsToConvert) {

  let migrateConfig;
  try {
    migrateConfig = require('../config/migrate.config.json');
    
    migrateConfig.source.authentication = authentication;
  } catch (error) {
    throw 'failure loading migrate config ' + JSON.stringify(error);
  }


  migrateConfig.assets = [];

  presentationsToConvert.forEach((presentationSpec) => {
    var migrateConfigAsset = {
      assetType: "ProjectBpf",
      id: "0",
      location: "Bsn",
      locator: "bsn://Project/" + presentationSpec.id.toString(),
      name: presentationSpec.name,
      networkId: presentationSpec.id,
      path: "",
      scope: presentationSpec.credentials.network,
    };
    migrateConfig.assets.push(migrateConfigAsset);
  });

  console.log('Migrate the following assets:');
  console.log(migrateConfig.assets);

  const migrateJob = new BsnContentMigrateJob(migrateConfig);
  return migrateJob.start()
    .then(function (result) {
      console.log('Job complete:');
      console.log(result);
    })
    .catch(function (error) {
      console.log('Job completed with an error:');
      console.log(result);
      console.log(error);
    });
}

function readLines(input) {
  var remaining = '';

  input.on('data', function (data) {
    remaining += data;
    var index = remaining.indexOf('\n');
    while (index > -1) {
      var line = remaining.substring(0, index);
      remaining = remaining.substring(index + 1);

      item = JSON.parse(line);
      presentationSpecs.push(item);
      index = remaining.indexOf('\n');
    }
  });

  input.on('end', function () {

    const presentationsToConvert = [];
    let indexOfFirstPresentationToConvert = 0;
    let indexOfLastPresentationToConvert = presentationSpecs.length - 1;

    // indexOfFirstPresentationToConvert = 0;
    // indexOfLastPresentationToConvert = 43;

    for (i = indexOfFirstPresentationToConvert; i < indexOfLastPresentationToConvert; i++) {
      presentationsToConvert.push(presentationSpecs[i]);
    }

    convertFiles(presentationsToConvert);
  });
}

var input = fs.createReadStream(inputFile);
readLines(input);
