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
  assetType:"Project",
  id:"0",
  location:"Bsn",
  locator:"bsn://Project/1193447",
  name:"PRES-1",  // name of the presentation
  networkId:1193447,  // dbId of bpf file. example in bsContentManager. 
  path:"",
  scope:"migration_gjo",  // networkName
}];
const migrateJob = new BsnContentMigrateJob(migrateConfig);
return migrateJob.start()
  .then(function(result){
    console.log(result);
  })
  .catch(function(error) {
    console.log(error);
  });