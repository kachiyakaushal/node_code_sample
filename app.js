require("./config/config");
require("./config/cache");
require("./helpers");

var createError = require('http-errors');
var express = require('express');
var path = require('path');
const fs = require('fs');
var cookieParser = require('cookie-parser');
var logger = require("morgan");
var validator = require("express-validator");
var passport = require("passport");
var bodyParser = require("body-parser");
var helmet = require("helmet");
var cors = require("cors");
var useragent = require('express-useragent');
var flash = require('connect-flash');
var cron = require('node-cron');

const paginate = require('express-paginate');
var moment = require('moment');
var hbs = require('express-hbs');
var helpers = require('handlebars-helpers')({
	handlebars: hbs.handlebars
});
var indexRouter = require('./routes/index');

var app = express();

app.engine('hbs', hbs.express4({
	layoutsDir: path.join(__dirname, "views/layouts"),
	// partialsDir: __dirname + '/views/partials',
	extname: '.hbs',
	helpers: helpers,
	defaultLayout: path.join(__dirname, "views/layouts/layout"),
	templateOptions: {
		allowProtoPropertiesByDefault: true,
		allowProtoMethodsByDefault: true
	}
}));

app.use(function (req, res, next) {
	res.header("Access-Control-Allow-Origin", "*");
	res.header(
		"Access-Control-Allow-Headers",
		"Origin, X-Requested-With, Content-Type, Accept, Authorization"
	);
	res.setHeader(
		"Access-Control-Allow-Methods",
		"GET, POST, OPTIONS, PUT, PATCH, DELETE"
	);
	next();
});

app.set('view engine', 'hbs');
app.set('views', __dirname + '/views');

app.use(helmet());
app.use(helmet.frameguard());
app.use(helmet.noCache());
app.use(cors());
app.use(useragent.express());
app.use(bodyParser.json({ defaultCharset: "utf-8", limit: "50mb" }));
app.use(bodyParser.urlencoded({ extended: false, limit: "50mb" }));
app.use(validator());
app.use(passport.initialize());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "public")));
app.use(paginate.middleware(20, 100));
app.use(flash());
// app.use(fileUpload());

var session = require('express-session');
var FileStore = require('session-file-store')(session);
var development = process.env.NODE_ENV === 'development' ? path.join(__dirname, "../") + 'sessions' : './sessions';

app.use(session({
	store: new FileStore({
		path: development
	}),
	// cookie: { maxAge: process.env.JWT_EXPIRATION },
	secret: process.env.APP_PASSWORD,
	resave: false,
	saveUninitialized: true,
}));

app.use(function (req, res, next) {
	res.locals.url = req.url;
	res.locals.surl = path.basename(req.url);
	res.locals.currentpage = req.query.page || null;
	res.locals.session = req.session;
	res.locals.user = req.session.user || null;
	next();
});

app.use('/', indexRouter);

// catch 404 and forward to error handler
app.use(function (req, res, next) {
	next(createError(404));
});
// error handler
app.use(function (err, req, res, next) {
	// set locals, only providing error in development
	res.locals.message = err.message;
	res.locals.error = err;

	// render the error page
	res.status(err.status || 500);
	//res.render('error');
	res.render('error', {
		title: 'Code Sample - Error',
		layout: ''
	});
});

var cronRouter = require('./crons/crons');

cron.schedule('0 0 10 * * *', function () {
	console.log("*****Cron runs daily at 10 am");
	cronRouter.updateProjectStatus();
});

module.exports = app;