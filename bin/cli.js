const fs = require('fs');
const util = require('util');
const { inspect } = util;

let bsnCm = require('../');
const { bsnCmGetMigrationSpec, BsnContentMigrateJob } = bsnCm;

// const scope = 'CRI_Test';
// const authentication = {
//   "userName": "jpiros@brightsign.biz",
//   "password": "admin",
//   "networkName": "CRI_Test"      
// };
// const inputFile = 'presentationFilesSpecJanAccountCRI_TestNetwork.txt'; 

const scope = 'ted';
const authentication = {
  "userName": "ted@brightsign.biz",
  "password": "admin",
  "networkName": "ted"      
};
const inputFile = 'presentationFilesSpecTedAccountTedNetwork.txt'; 

var presentationSpecs = [];

function convertFiles() {

  let migrateConfig;
  try {
    migrateConfig = require('../config/migrate.config.json');
    migrateConfig.source.authentication = authentication;
  } catch (error) {
    throw 'failure loading migrate config ' + JSON.stringify(error);
  }

  migrateConfig.assets = [];

  presentationSpecs.forEach((presentationSpec) => {
    var migrateConfigAsset = {
      assetType: "ProjectBpf",
      id: "0",
      location: "Bsn",
      locator: "bsn://Project/" + presentationSpec.id.toString(),
      name: presentationSpec.name,
      networkId: presentationSpec.id,
      path: "",
      scope,
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

function readLines(input, func) {
  var remaining = '';

  input.on('data', function (data) {
    remaining += data;
    var index = remaining.indexOf('\n');
    while (index > -1) {
      var line = remaining.substring(0, index);
      remaining = remaining.substring(index + 1);

      item = JSON.parse(line);
      presentationSpecs.push(item);
      // func(line);
      index = remaining.indexOf('\n');
    }
  });

  input.on('end', function () {
    if (remaining.length > 0) {
      func(remaining);
    }

    // pick specific presentation here as needed
    // console.log(presentationSpecs);

    // ted bpf with dp's
    // const presentationSpec = presentationSpecs[26];

    // const presentationSpec = presentationSpecs[0];
    // presentationSpecs = [presentationSpec];
    // presentationSpecs = [presentationSpecs[0], presentationSpecs[1]];
    // presentationSpecs = [presentationSpecs[0], presentationSpecs[1]];

    convertFiles();
  });
}

function func(data) {
  // console.log('Line: ' + data);
}

var input = fs.createReadStream(inputFile);
readLines(input, func);
