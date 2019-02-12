const util = require('util');
const {inspect} = util;

let bsnCm = require('../');
const {bsnCmGetMigrationSpec, BsnContentMigrateJob} = bsnCm;

let migrateConfig;
try {
  migrateConfig = require('../config/migrate.config.json');
} catch (error) {
  throw 'failure loading migrate config ' + JSON.stringify(error);
}

// should be able to retrieve asset items directly from content manager.
migrateConfig.assets = [{
  assetType:"ProjectBpf",
  id:"0",
  location:"Bsn",
  locator:"bsn://Project/382866",
  name:"0-BSDemo",  // name of the presentation
  networkId:382866,  // dbId of bpf file. example in bsContentManager. 
  path:"",
  scope:"ted",  // networkName
}];
const migrateJob = new BsnContentMigrateJob(migrateConfig);
return migrateJob.start()
  .then(function(result){
    console.log(result);
  })
  .catch(function(error) {
    console.log(error);
  });