const sequelize = require("../../../models").sequelize;
var Sequelize = require("sequelize");
const Op = Sequelize.Op;
const fs = require("fs");
var _ = require('underscore');
var moment = require("moment-timezone");
var bcrypt = require("bcryptjs");
var Users = require("../../../models").Users;
var UpdateLog = require("../../../models").UpdateLog;

module.exports.getUser = async function (req, res, next) {
    var id = req.user && req.user.id;

    var user = await Users.findOne({
        where: { id: id },
    }).catch(err => {
        return ReE(res, err, 400);
    });

    if (user) {
        var token = user.getJWT();
        return ReS(res, "", {
            payload: {
                ...user.toWeb(),
                token: token
            }
        });
    } else {
        return ReE(res, "User not found.", 400);
    }
}

module.exports.updatePassword = async function (req, res, next) {
    var postdata = req.body;

    var password = bcrypt.hashSync(postdata.password, 10);
    await Users.update({
        password,
    }, {
        where: {
            id: req.user.id, email: postdata.email
        }
    }).then(updated => {
        if (updated == 1) {
            return ReS(res, "Password updated successfully!");
        } else {
            return ReE(res, "Failed to update password!", 400);
        }
    }).catch(err => {
        return ReE(res, err, 400);
    })
}

module.exports.editUser = async function (req, res, next) {
    var postdata = req.body;

    var userExist = await Users.findOne({
        where: {
            id: { [Op.ne]: req.user.id },
            email: postdata.email,
            username: postdata.username
        }
    }).catch(err => { });

    if (!userExist) {

        await Users.update(postdata, {
            where: { id: req.user.id, email: postdata.email, },
        }).then((updated) => {
            return ReS(res, "Profile updated successfully.");
        }).catch(err => {
            return ReE(res, err, 400);
        });
    } else {
        return ReE(res, "Failed to update user as user already exist with same email address or username!", 400);
    }

}