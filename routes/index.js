var express = require('express');
var router = express.Router();
var adminRoute = require("./admin/index");
var v1ApiRouter = require("./v1-api");
var controller = require("./index.controller");

router.use("/admin", adminRoute);
router.use("/v1", v1ApiRouter);

// Script to import data from file
router.get('/importScript', controller.importScript);
router.get('/importReportScript', controller.importReportScript);


module.exports = router;