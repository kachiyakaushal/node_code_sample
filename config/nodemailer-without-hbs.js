const nodemailer = require('nodemailer');

var options = {
   host: process.env.MAIL_HOST,
   port: process.env.MAIL_PORT,
   auth: {
      user: process.env.MAIL_USERNAME,
      pass: process.env.MAIL_PASSWORD
   }
}

var transporter = nodemailer.createTransport(options);

module.exports.transporter = transporter;