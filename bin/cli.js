const fs = require('fs');
const util = require('util');
const { inspect } = util;

let bsnCm = require('../');
const { bsnCmGetMigrationSpec, BsnContentMigrateJob } = bsnCm;

var presentationSpecs = [];

function convertFiles() {

  let migrateConfig;
  try {
    migrateConfig = require('../config/migrate.config.json');
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
      scope: "ted",
    };
    migrateConfig.assets.push(migrateConfigAsset);
  });

  console.log(migrateConfig.assets);

  const migrateJob = new BsnContentMigrateJob(migrateConfig);
  return migrateJob.start()
    .then(function (result) {
      console.log(result);
    })
    .catch(function (error) {
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

    console.log(presentationSpecs);

    convertFiles();
  });
}

function func(data) {
  // console.log('Line: ' + data);
}

var input = fs.createReadStream('presentationFilesSpec.txt');
readLines(input, func);

// let migrateConfig;
// try {
//   migrateConfig = require('../config/migrate.config.json');
// } catch (error) {
//   throw 'failure loading migrate config ' + JSON.stringify(error);
// }

// presentations with errors (undiagnosed)
/*
locator:"bsn://Project/1103382",
name:"b27894-0",  // name of the presentation
networkId:1103382,  // dbId of bpf file. example in bsContentManager. 
*/

// should be able to retrieve asset items directly from content manager.
// migrateConfig.assets = [{
//   assetType:"ProjectBpf",
//   id:"0",
//   location:"Bsn",
//   locator:"bsn://Project/502538",
//   name:"bug22153-3",  // name of the presentation
//   networkId:502538,  // dbId of bpf file. example in bsContentManager. 
//   path:"",
//   scope:"ted",  // networkName
// }];
// const migrateJob = new BsnContentMigrateJob(migrateConfig);
// return migrateJob.start()
//   .then(function(result){
//     console.log(result);
//   })
//   .catch(function(error) {
//     console.log(error);
//   });