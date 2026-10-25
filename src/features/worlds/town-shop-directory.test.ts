import assert from "node:assert/strict";
import test from "node:test";
import {matchesCreationSearch,townPeopleDirectory} from "./town-shop-directory";
import {emptyShop,type BusinessBundle} from "./world-business";

test("a Town directory lists one person with their separate Town, building and Shop roles",()=>{
 const business:BusinessBundle={canEdit:true,shops:[{id:"shop",revision:1,archived:false,definition:{...emptyShop,name:"Glass Forge"},godNotes:"",sortOrder:0,archiveReason:""}],shopLocations:[{id:"entrance",shopId:"shop",townId:"town",placeId:"forge",note:"",sortOrder:0,revision:1}],places:[{id:"forge",townId:"town",placeKind:"building",name:"North forge",category:"smithy",description:"",locationNotes:"",godNotes:"",sortOrder:0,revision:1,archived:false,archiveReason:""}],residents:[],individuals:[{id:"person",name:"Mara",archived:false}],people:[...[["town","Mayor"],["shop","Proprietor"],["forge","Smith"],["another-town","Visitor"]].map(([geographyId,role],index)=>({id:String(index),geographyId,residentId:"person",role,note:"",primaryContact:false,sortOrder:index,revision:1}))],offerings:[]};
 const directory=townPeopleDirectory(business,"town");assert.equal(directory.length,1);assert.deepEqual(directory[0].associations.map(p=>p.role),["Mayor","Proprietor","Smith"]);
 assert.equal(townPeopleDirectory(business,"town"," GLASS FORGE ")[0].id,"person");
 assert.equal(townPeopleDirectory(business,"town","Proprietor").length,1);assert.equal(townPeopleDirectory(business,"town","Visitor").length,0);
 business.shops[0].archived=true;assert.deepEqual(townPeopleDirectory(business,"town")[0].associations.map(p=>p.role),["Mayor","Smith"]);
 business.places[0].archived=true;assert.deepEqual(townPeopleDirectory(business,"town")[0].associations.map(p=>p.role),["Mayor"]);
 assert.equal(townPeopleDirectory(business,null)[0].associations.length,4,"saved relationships remain readable outside the active Town rollup");
});

test("retained profiles linked to a full Individual never duplicate that person's directory entry",()=>{
 const business:BusinessBundle={canEdit:true,shops:[],shopLocations:[],places:[],offerings:[],residents:[{id:"retained",name:"Earlier name",description:"Retained account",godNotes:"",revision:1,archived:false,loreId:"individual"}],individuals:[{id:"individual",name:"Current name",archived:false}],people:["retained","individual"].map((residentId,index)=>({id:String(index),geographyId:"town",residentId,role:"Contact",note:"",primaryContact:false,sortOrder:index,revision:1}))};
 const directory=townPeopleDirectory(business,"town");assert.equal(directory.length,1);assert.equal(directory[0].name,"Current name");assert.equal(directory[0].associations.length,2);assert.equal(directory[0].individualId,"individual");
});

test("creation search finds description and location text with empty and case-insensitive queries",()=>{
 assert.equal(matchesCreationSearch("  north quay  ",["A shop","Beside the North Quay"]),true);
 assert.equal(matchesCreationSearch("harbour",["A town","A community of harbour makers"]),true);
 assert.equal(matchesCreationSearch("",[undefined,null,0]),true);
 assert.equal(matchesCreationSearch("missing",[undefined,null,"Other details"]),false);
});
