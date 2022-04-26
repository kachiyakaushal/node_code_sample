var express = require('express');
var router = express.Router();
var authRoute = require("./auth/index");
var userRoute = require("./users/index");
var projectRoute = require("./projects/index");
var categoryRoute = require("./category/index");
var rolesRoute = require("./roles/index");
var productRoute = require("./products/index");
var adminProfileRoute = require("./my-profile/index");
var regionsRoute = require("./regions/index");
var outletsRoute = require("./outlets/index");
var generalRoute = require("./general/index");
var AuthMiddleware = require("../../middleware/auth").AuthMiddleware;

router.use("/auth", authRoute);
router.use("/users", AuthMiddleware, userRoute);
router.use("/projects", AuthMiddleware, projectRoute);
router.use("/products", AuthMiddleware, productRoute);
router.use("/category", AuthMiddleware, categoryRoute);
router.use("/roles", AuthMiddleware, rolesRoute);
router.use("/regions", AuthMiddleware, regionsRoute);
router.use("/outlets", AuthMiddleware, outletsRoute);
router.use("/general", AuthMiddleware, generalRoute);
router.use("/", AuthMiddleware, adminProfileRoute);


module.exports = router;