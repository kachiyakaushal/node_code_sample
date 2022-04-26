var bcrypt = require("bcryptjs");
// const Nexmo = require('nexmo');
var fs = require("fs");
var md5 = require('md5');
var path = require('path');
// var moment = require("moment");
const _ = require('underscore');

var moment = require("moment-timezone");
var multer = require("multer");
const sequelize = require("../../../models").sequelize;
const Users = require('../../../models').Users;
const Notifications = require("../../../models").Notifications;
const LoginHistory = require("../../../models").LoginHistory;
const UserProjects = require("../../../models").UserProjects;
const Projects = require("../../../models").Projects;
const controller = require("../../../controllers/users-functions");

var Sequelize = require("sequelize");
const Op = Sequelize.Op;

var getUser = async function (req, res, next) {
    const user_id = parseInt(req.user.id);

    var whereq = {
        id: user_id,
    };

    Users.findOne({
        where: whereq,
        include: [
            {
                model: UserProjects,
                required: false,
                where: {
                    user_id: req.user.id
                },
                include: { model: Projects, where: { isCompleted: 0 }, attributes: ['title', 'description'] }
            },
            {
                model: LoginHistory,
                attributes: ['type', 'createdAt'],
                limit: 5,
                order: [["createdAt", "DESC"]],
            }, {
                model: Notifications,
                limit: 5,
                order: [["createdAt", "DESC"]],
            }],
    }).then(async user => {
        if (user == null) {
            var err = {
                code: 500,
                message: "Opps! User does not exist."
            };

            return ReE(res, err, err.code);
        } else {
            await Notifications.update({ isRead: 1 }, {
                where: {
                    user_id: req.user.id,
                    isRead: 0
                }
            });
            var userreturn = user.toWeb();
            userreturn.projectsCount = userreturn.UserProjects && userreturn.UserProjects.length;
            userreturn.token = user.getJWT();
            delete userreturn.UserProjects;
            return ReS(res, "User Profile", {
                payload: {
                    ...userreturn
                }
            });
        }
    });
};
module.exports.getUser = getUser;

/**
 * Update User Profile
 * @param {*} req
 * @param {*} res
 * @param {*} next
 */
module.exports.updateUser = async function (req, res, next) {
    req.checkBody({
        'username': {
            notEmpty: true,
            errorMessage: 'Username is required'
        },
        'email': {
            notEmpty: true,
            isEmail: true,
            errorMessage: 'Email is required'
        },
    });

    var errors = req.validationErrors();

    if (errors) {
        return ReE(res, errors[0].msg, 400); // return first error
    }

    const user_id = parseInt(req.user.id);

    let alreadyuser = await Users.findOne({
        where: {
            email: req.body.email,
            username: req.body.username,
            id: {
                [Op.ne]: user_id
            }
        }
    });
    if (alreadyuser) {
        return ReE(res, "User already registered with same email address or username");
    }

    var whereq = {
        id: user_id
    };

    Users.findOne({
        where: whereq
    }).then(async user => {
        if (user == null) {
            var err = {
                code: 500,
                message: "Opps! User does not exist"
            };

            return ReE(res, err, err.code);
        } else {

            var requestData = req.body;

            if (req.file) {
                var filename = req.file.filename;

                requestData.profile_picture = filename;
                var tfilename = await Users.findOne({
                    where: {
                        id: user_id
                    },
                    attributes: ["profile_picture"]
                });
                if (tfilename && tfilename.profile_picture) {
                    var url = tfilename.profile_picture
                    var filename = url.substring(url.lastIndexOf('/') + 1);

                    const pathToFile = "public/media/thumbnail/" + filename;

                    fs.unlink(pathToFile, function (err) {
                        if (err) {
                            console.log(err)
                        } else {
                            console.log("Successfully deleted thumbnail file.")
                        }
                    });
                }

                await Users.update(requestData, {
                    where: {
                        id: user_id
                    }
                }).then(async () => {
                    await controller.getUserData(req, async function (responseData) {
                        return ReS(res, "User details updated successfully!", {
                            payload: {
                                ...responseData.data
                            }
                        });
                    })
                }).catch(err => {
                    return ReE(res, err, 400);
                });

            } else {
                user
                    .update(requestData)
                    .then(async result => {
                        await controller.getUserData(req, async function (responseData) {
                            return ReS(res, "User details updated successfully!", {
                                payload: {
                                    ...responseData.data
                                }
                            });
                        })
                    })
                    .catch(err => {
                        return ReE(res, err, 400);
                    });
            }
        }
    });
};

/**
 * Change User Profile Password
 * @param {*} req
 * @param {*} res
 * @param {*} next
 */
module.exports.changeUserPassword = async function (req, res, next) {

    req.checkBody({
        'oldPassword': {
            notEmpty: true,
            errorMessage: 'Old Password is required',
        },
        'password': {
            notEmpty: true,
            errorMessage: 'Password is required',
        }
    });

    var errors = req.validationErrors();

    if (errors) {
        return ReE(res, errors[0].msg, 400);
    }

    const user_id = parseInt(req.user.id);
    var whereq = {
        id: user_id,
    };

    Users.findOne({
        where: whereq
    }).then(async user => {
        if (user == null) {
            var err = {
                code: 500,
                message: "Opps! User does not exist"
            };

            return ReE(res, err, err.code);
        }

        const match = await bcrypt.compare(req.body.oldPassword, user.password);
        if (!match) {
            var err = {
                code: 500,
                message: "Opps! Old password is incorrect"
            };

            return ReE(res, err.message, err.code);
        }

        let password = bcrypt.hashSync(req.body.password, 10);

        user
            .update({ password: password })
            .then(async user => {

                return ReS(res, "Password Update Successful", {
                    data: user
                });
            })
            .catch(err => {
                return ReE(res, err, 400);
            });
    });
};

module.exports.addQRCode = async function (req, res, next) {

    var user = await Users.findOne({
        where: {
            id: req.body.user_id
        }
    });

    if (req.file) {
        var user_qr = user.qr_code;
        var allQR = [];

        for (let i = 0; i < user_qr.length; i++) {
            var u = (user_qr[i].url).substring(
                (user_qr[i].url).lastIndexOf("/") + 1, (user_qr[i].url).length);
            allQR.push(u);
        }

        allQR.push(req.file.filename)

        var postdata = {
            qr_code: JSON.stringify(allQR)
        };

        await Users.update(postdata, {
            where: {
                id: req.body.user_id
            }
        }).then(async () => {
            await controller.getUserData(req, async function (responseData) {
                return ReS(res, "User payment QR uploaded successfully!", {
                    payload: {
                        ...responseData.data
                    }
                });
            });
        }).catch(err => {
            return ReE(res, err, 400);
        });

    } else {
        return ReE(res, "User payment QR failed to upload!");
    }

}

module.exports.deleteQRCode = async function (req, res, next) {
    var postdata = req.body;
    if (postdata.user_id) {
        await Users.findOne({
            where: {
                id: postdata.user_id
            },
            attributes: ['qr_code']
        }).then(result => {
            if (result.qr_code.length > 0) {
                var found = false;
                var allQR = [];
                var user_qr = result.qr_code;
                for (let i = 0; i < user_qr.length; i++) {
                    var u = (user_qr[i].url).substring(
                        (user_qr[i].url).lastIndexOf("/") + 1, (user_qr[i].url).length);
                    allQR.push(u);
                }
                var qr_array = allQR;

                for (let j = 0; j < qr_array.length; j++) {
                    if (postdata.url.includes(qr_array[j])) {
                        const pathToFile = "public/media/thumbnail/" + qr_array[j];
                        found = true;
                        fs.unlink(pathToFile, async function (err) {
                            if (err) {
                                console.log(err)
                                return ReS(res, "Failed to delete user QR code!");
                            } else {
                                qr_array.splice(j, 1);
                                await Users.update({
                                    qr_code: qr_array.length > 0
                                        ? JSON.stringify(qr_array) : null
                                }, {
                                    where: {
                                        id: postdata.user_id
                                    }
                                });
                                await controller.getUserData(req, async function (responseData) {
                                    return ReS(res, "User payment QR deleted successfully!", {
                                        payload: {
                                            ...responseData.data
                                        }
                                    });
                                });
                            }
                        });
                        break;
                    }
                }
                if (!found) {
                    return ReE(res, "QR code image not found for url provided!");
                }
            } else {
                return ReE(res, "QR code images not found for user Id provided!")
            }
        });
    }
}

module.exports.loginLogs = async function (req, res, next) {
    var query = req.query;


    var sortBy = query.sortBy ? query.sortBy : "createdAt";
    req.query.sortBy = sortBy;
    var sortOrder = query.sortOrder ? query.sortOrder : "DESC";
    req.query.sortOrder = sortOrder;

    let limit = 10;
    let offset = 0;

    if (
        query.limit &&
        parseInt(query.limit) > 0 &&
        parseInt(query.limit) <= 100
    ) {
        limit = parseInt(query.limit);
    }

    if (query.page && parseInt(query.page) > 0 &&
        parseInt(query.page) <= 100) {
        offset = limit * (parseInt(query.page) - 1);
    }

    await LoginHistory.findAndCountAll({
        where: { user_id: req.user.id },
        limit: limit,
        offset: offset,
        order: [[sortBy, sortOrder]],
    }).then(async data => {
        return ReS(res, "Login logs fetched successfully.", {
            payload: {
                data: { count: data.count, rows: data.rows }
            }
        })
    }).catch(err => {
        return ReE(res, err, 400);
    });
}

module.exports.notificationLogs = async function (req, res, next) {
    var query = req.query;

    var sortBy = query.sortBy ? query.sortBy : "createdAt";
    req.query.sortBy = sortBy;
    var sortOrder = query.sortOrder ? query.sortOrder : "DESC";
    req.query.sortOrder = sortOrder;

    let limit = 10;
    let offset = 0;

    if (
        query.limit &&
        parseInt(query.limit) > 0 &&
        parseInt(query.limit) <= 100
    ) {
        limit = parseInt(query.limit);
    }

    if (query.page && parseInt(query.page) > 0 &&
        parseInt(query.page) <= 100) {
        offset = limit * (parseInt(query.page) - 1);
    }

    await Notifications.findAndCountAll({
        where: { user_id: req.user.id },
        limit: limit,
        offset: offset,
        order: [[sortBy, sortOrder]],
    }).then(async data => {
        await Notifications.update({ isRead: 1 }, {
            where: {
                user_id: parseInt(req.user.id),
                isRead: 0
            }
        }).then(updated => console.log(updated)).catch(err => console.log(err));
        return ReS(res, "Notification logs fetched successfully.", {
            payload: {
                data: { count: data.count, rows: data.rows }
            }
        })
    }).catch(err => {
        return ReE(res, err, 400);
    });
}
// Worklife is not a sprint. It’s a marathon that one needs to keep on running and achieve one milestone after the other. And believe me,
//  you’re one hell of a runner.
//  Conveying my best work anniversary wishes to you, I hope to see you together with us for many more years to come. Good Luck!