const nodemailer = require('nodemailer');
var sgTransport = require('nodemailer-sendgrid-transport');
const hbs = require('nodemailer-express-handlebars');

var smtpoptions = {
   service: 'gmail',
   auth: {
      user: '',
      pass: ''
   }
}

var transporter = nodemailer.createTransport(smtpoptions);

var options = {
   viewEngine: {
      extname: '.hbs',
      layoutsDir: 'views/layouts/',
      defaultLayout: 'layout-email',
      partialsDir: 'views/email/'
   },
   viewPath: 'views/email/',
   extName: '.hbs'
};

transporter.use('compile', hbs(options));

module.exports.transporter = transporter;