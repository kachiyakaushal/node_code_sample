const sequelize = require("../../../models").sequelize;
var Sequelize = require("sequelize");
const Op = Sequelize.Op;
const fs = require("fs");
var _ = require('underscore');
var moment = require("moment-timezone");
var bcrypt = require("bcryptjs");
var Users = require("../../../models").Users;
var Roles = require("../../../models").Roles;
var UserDeviceToken = require("../../../models").UserDeviceToken;
var LoginHistory = require("../../../models").LoginHistory;
const transporter = require("../../../config/nodemailer").transporter;

module.exports.login = async function (req, res, next) {
    var postdata = req.body;
    req.checkBody({
        'username': {
            notEmpty: true,
            errorMessage: 'username is required'
        },
        'password': {
            notEmpty: true,
            errorMessage: 'Password is required',
            isLength: {
                options: { min: 8, max: 20 },
                errorMessage: 'Password must be at least 8 chars long'
            }
        },
        'device_token': {
            notEmpty: true,
            errorMessage: 'Device token is required'
        },
        'device_type': {
            notEmpty: true,
            errorMessage: 'Device type is required'
        }
    });

    var errors = req.validationErrors();

    if (errors) {
        return ReE(res, errors[0].msg, 400);
    }

    Users.findOne({
        where: {
            [Op.or]: {
                email: postdata.username,
                username: postdata.username
            }
        },
        include: [{
            model: Roles,
            attributes: ['accept_request']
        }]
    }).then(user => {
        if (!user) {
            return ReE(res, "User not found.");
        }

        if (user.status != 1) {
            return ReE(res, "You haven't activate your account.");
        }

        if (user.role_id == 0) {
            return ReE(res, "You are not authorized user.");
        }

        bcrypt
            .compare(postdata.password, user.password)
            .then(async function (result) {
                if (result == true) {
                    var userDeviceToken = await UserDeviceToken.findOrCreate({
                        where: {
                            user_id: user.id,
                            device_type: req.body.device_type,
                            device_token: req.body.device_token
                        },
                        defaults: {
                            user_id: user.id,
                            device_type: req.body.device_type,
                            device_token: req.body.device_token
                        }
                    }).catch(err => {
                        console.log(err)
                    });

                    await LoginHistory.create({ user_id: user.id, type: 'login' });

                    var token = user.getJWT();
                    req.session.sessionexpiretime = CONFIG.jwt_expiration;
                    req.session.user = {
                        ...user.toWeb(), accept_request: user.dataValues.Role.accept_request, token: token, device_type: userDeviceToken[0].device_type,
                        device_token: userDeviceToken[0].device_token
                    };
                    delete user.dataValues.Role;
                    return ReS(res, "", {
                        payload: {
                            ...user.toWeb(),
                            accept_request: req.session.user.accept_request,
                            Notifications: [],
                            LoginHistories: [],
                            token: token,
                            device_type: userDeviceToken[0].device_type,
                            device_token: userDeviceToken[0].device_token
                        }
                    });
                } else {
                    return ReE(res, "You have entered wrong password.");
                }
            })
            .catch(err => {
                return ReE(res, err, 400);
            });
    });
}

module.exports.logout = async function (req, res, next) {
    if (req.user) {
        var userId = req.user.id;
        var deviceType = req.body.device_type;
        var deviceToken = req.body.device_token;

        let whereU = {
            user_id: userId,
            device_type: deviceType,
            device_token: deviceToken
        }

        await UserDeviceToken.destroy({
            where: whereU,
            force: true
        }).then(async result => {
            await LoginHistory.create({ user_id: userId, type: 'logout' });
            req.logout();
            return ReS(res, "Logout Successfull.");
        }).catch(err => {
            return ReE(res, err, 400);
        })
    } else {
        return ReE(res, "No logged in user found.", 400);
    }
}

