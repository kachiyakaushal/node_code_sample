var express = require('express');
var router = express.Router();
var AuthMiddleware = require('../../middleware/api-auth').AuthMiddleware;

var authRouter = require("./auth");
var userRouter = require("./user-profile");
var projectsRouter = require("./projects");
var notificationRouter = require("./notifications");
var outletRouter = require("./outlets");

// /* GET home page. */
router.get('/', function (req, res, next) {
  res.render('index', { title: 'Apppp' });
});

router.use("/auth", authRouter);
router.use("/user-profile", AuthMiddleware, userRouter);
router.use("/notifications", AuthMiddleware, notificationRouter);
router.use("/outlets", AuthMiddleware, outletRouter);

module.exports = router;