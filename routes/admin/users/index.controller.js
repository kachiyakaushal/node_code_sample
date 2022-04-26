const Users = require("../../../models").Users;
const UserProjects = require("../../../models").UserProjects;
const LoginHistory = require("../../../models").LoginHistory;
const Projects = require("../../../models").Projects;
const Orders = require("../../../models").Orders;
const OrderDetails = require("../../../models").OrderDetails;
const Products = require("../../../models").Products;
const Outlets = require("../../../models").Outlets;
const Roles = require("../../../models").Roles;
const sequelize = require("../../../models").sequelize;
var Sequelize = require("sequelize");
const Op = Sequelize.Op;
var bcrypt = require("bcryptjs");
const moment = require('moment');
var _ = require('underscore');
const transporter = require("../../../config/nodemailer").transporter;
var md5 = require('md5');
var multer = require("multer");
var fs = require("fs");
var path = require('path');
const Json2csvParser = require("json2csv").Parser;
var controller = require("../../v1-api/projects/index.controller.js");

module.exports.usersList = async function (req, res, next) {
    var id = req.user && req.user.id;
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

    var wheres = {
        role_id: { [Op.ne]: 0 }
    };

    if (query.status) {
        wheres[Op.or] = [{
            status: query.status
        }]
    }
    if (query.region_id) {
        wheres[Op.or] = [{
            region_id: query.region_id
        }]
    }
    if (query.role_id) {
        wheres[Op.or] = [{
            role_id: query.role_id
        }]
    }
    if (query.startDate && query.endDate) {
        var startD = new Date(query.startDate).setHours(0, 0, 0);
        var endD = new Date(query.endDate).setHours(23, 59, 59);
        wheres[Op.or] = [
            {
                createdAt: { [Op.between]: [startD, endD] },
            }
        ]
    }

    if (query.search) {
        wheres[Op.or] = [
            { email: { [Op.substring]: query.search } },
            { username: { [Op.substring]: query.search } },
            { contact_number: { [Op.substring]: query.search } },
            { system_id: { [Op.substring]: query.search } },
        ];
    }

    await Users.findAndCountAll({
        where: wheres,
        limit: limit,
        offset: offset,
        include: [{
            model: UserProjects,
            attributes: ['project_id'],
            include: { model: Projects, attributes: ['title', 'description'] }
        }, {
            model: Roles,
            attributes: ['name']
        }],
        order: [[sortBy, sortOrder]],
    }).then(async data => {
        var count = await Users.count({ where: wheres });
        return ReS(res, "Users fetched successfully.", {
            payload: {
                data: { count: count, rows: data.rows }
            }
        });
    }).catch(err => {
        return ReE(res, err, 400);
    });


};

module.exports.allUsers = async function (req, res, next) {

    var sortBy = "createdAt";
    var sortOrder = "DESC";

    var wheres = {
        role_id: { [Op.ne]: 0 },
        status: 1
    };

    await Users.findAndCountAll({
        where: wheres,
        order: [[sortBy, sortOrder]],
    }).then(async data => {
        return ReS(res, "Users fetched successfully.", {
            payload: {
                data: { count: data.count, rows: data.rows }
            }
        });
    }).catch(err => {
        return ReE(res, err, 400);
    });


};

module.exports.addUser = async function (req, res, next) {

    var postdata = req.body && JSON.parse(req.body.data);


    if (postdata) {
        postdata.profile_picture = req.file ? req.file.filename : null;
        postdata.password = bcrypt.hashSync(postdata.password, 10);
        postdata.status = 1;
        postdata.system_id = "#" + randomNum(8);

        var userExist = await Users.findOne({
            where: {
                email: postdata.email,
                username: postdata.username
            }
        }).catch(err => { });
        if (!userExist) {
            await Users.create(postdata).then((result) => {
                return ReS(res, "User added successfully", { payload: { user_id: result.id } });
            }).catch(err => {
                return ReE(res, err, 400);
            });
        } else {
            return ReE(res, "User already exist with same email address or username!", 400);
        }
    }

}

module.exports.addUserImg = async function (req, res, next) {
    var storage = multer.diskStorage({
        destination: function (req, file, cb) {
            cb(null, 'public/media/thumbnail')
        },
        filename: function (req, file, cb) {
            cb(null, "US_" + req.query.postdata + "_" + randomStr(10) + "." +
                file.originalname.split(".").pop())
        }
    })
    var upload = multer({ storage: storage }).single('file');
    upload(req, res, async function (err) {
        if (err instanceof multer.MulterError) {
            console.log("ERRR", err)
            // return res.status(500).json(err)
        } else if (err) {
            console.log("ERRR", err)
            // return res.status(500).json(err)
        }
        var postdata = {
            profile_picture: req.file.filename
        };
        await Users.update(postdata, {
            where: {
                id: req.query.postdata
            }
        }).then(() => {
            return ReS(res, "User image uploaded successfully!");
        }).catch(err => {
            return ReE(res, err, 400);
        });
    });
}

module.exports.editUserImg = async function (req, res, next) {
    if (req.file && req.file.filename) {

        var postdata = req.body && JSON.parse(req.body.data);
        var pdata = {}
        if (req.file) {
            var filename = req.file.filename;

            pdata["profile_picture"] = filename;
            var tfilename = await Users.findOne({
                where: {
                    id: postdata.id
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
        }
        await Users.update(pdata, {
            where: {
                id: postdata.id
            }
        }).then((updated) => {
            return ReS(res, "User Image updated successfully!");
        }).catch(err => {
            return ReE(res, err, 400);
        });
    } else {
        return ReE(res, "User Image not updated!");
    }
}

module.exports.addQRCode = async function (req, res, next) {
    var postdata = req.body && JSON.parse(req.body.data);
    var user = await Users.findOne({
        where: {
            id: postdata.user_id
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

        var pdata = {
            qr_code: JSON.stringify(allQR)
        };

        await Users.update(pdata, {
            where: {
                id: postdata.user_id
            }
        }).then(async () => {
            return ReS(res, "User payment QR uploaded successfully!");

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
                                return ReS(res, "User payment QR deleted successfully!");
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

module.exports.editUser = async function (req, res, next) {
    var postdata = req.body;

    var userExist = await Users.findOne({
        where: {
            id: { [Op.ne]: postdata.id },
            email: postdata.email,
            username: postdata.username
        }
    }).catch(err => { });

    if (!userExist) {
        if (postdata.password) {
            postdata.password = bcrypt.hashSync(postdata.password, 10);
        }

        await Users.update(postdata, {
            where: {
                id: postdata.id
            }
        }).then((updated) => {
            if (updated) {
                return ReS(res, "User updated successfully!");
            } else {
                return ReE(res, "Failed to update user!", 400);
            }
        }).catch(err => {
            return ReE(res, err, 400);
        });
    } else {
        return ReE(res, "Failed to update user as user already exist with same email address or username!", 400);
    }
}

module.exports.handleUserStatus = async function (req, res, next) {
    var postdata = req.body;

    await Users.update(postdata, {
        where: {
            id: postdata.id
        }
    }).then((updated) => {
        if (updated) {
            return ReS(res, "User status updated successfully!");
        } else {
            return ReE(res, "Failed to update user status!", 400);
        }
    }).catch(err => {
        return ReE(res, err, 400);
    });

}

module.exports.deleteUser = async function (req, res, next) {
    var postdata = req.body;

    await Users.update({
        deletedAt: new Date()
    }, {
        where: {
            id: postdata.id
        }
    }).then((updated) => {
        if (updated) {
            return ReS(res, "User deleted successfully!");
        } else {
            return ReE(res, "Failed to delete user!", 400);
        }
    }).catch(err => {
        return ReE(res, err, 400);
    });

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
        where: { user_id: req.query.user_id },
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

module.exports.effectiveUsers = async function (req, res, next) {
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

    var wheres = {};
    if (query.isEffective) {
        wheres[Op.and] = { isEffective: parseInt(query.isEffective) }
    }
    if (query.project_id) {
        wheres[Op.or] = {
            project_id: query.project_id
        }
    }
    if (query.outlet_id) {
        wheres[Op.or] = {
            outlet_id: query.outlet_id
        }
    }

    if (query.search) {
        wheres[Op.or] = [
            { '$Project.title$': { [Op.substring]: query.search } },
            { '$User.username$': { [Op.substring]: query.search } },
            { '$Outlet.outlet_name$': { [Op.substring]: query.search } },
            { effective_name: { [Op.substring]: query.search } },
            { effective_email: { [Op.substring]: query.search } },
        ];
    }

    var effectiveData = await Orders.findAndCountAll({
        where: wheres,
        limit: limit,
        offset: offset,
        order: [[sortBy, sortOrder]],
        include: [{
            model: Projects, required: true,
            right: true, attributes: ["title"]
        },
        {
            model: Users, required: true,
            right: true, attributes: ["username", "system_id"]
        },
        {
            model: OrderDetails, attributes: ['quantity', 'total_amount'],
            include: [{ model: Products, attributes: ['id', 'name'] }]
        },
        {
            model: Outlets, required: true,
            right: true, attributes: ["outlet_name", "address", "city", "state", "postal_code"]
        }]
    });

    var General = await controller.getConfig();
    var SOBBrand = General[0];
    var FCBrand = General[1];

    _.map(effectiveData.rows, async function (item) {
        var prod = []
        _.map(item.dataValues.OrderDetails, async function (thisD) {
            prod.push(thisD.dataValues.Product.name);
        })
        var brand = item.dataValues.brands_variant && isJSON(item.dataValues.brands_variant) ? JSON.parse(item.dataValues.brands_variant) : item.dataValues.brands_variant;
        const FCfound = prod && FCBrand.some(r => prod.includes(r));
        const SOBfound = brand && SOBBrand.some(r => brand.includes(r));
        var arr = [];
        if (item.isEffective == 1) {
            if (FCfound) {
                arr.push("Effective FC");
            }
            if (SOBfound) {
                arr.push("Effective SOB");
            }
        } else {
            if (FCfound) {
                arr.push("Smoker FC");
            }
            if (SOBfound) {
                arr.push("Smoker SOB");
            }
        }
        item.dataValues["contact_tags"] = arr;
    })

    return ReS(res, "Effective Users fetched!", {
        payload: {
            effectiveCount: effectiveData.count,
            effectiveData: effectiveData.rows,
        }
    });
}

module.exports.exportEffectiveUsersCSV = async function (req, res, next) {
    var query = req.body;

    var wheres = [{
        isEffective: 1
    }];

    wheres.push({
        createdAt: { [Op.between]: [query.start_date, query.end_date] }
    });

    await Orders.findAll({
        where: wheres,
        include: [{ model: Projects, attributes: ["title"] },
        { model: Users, attributes: ["username", "system_id"] },
        { model: Outlets, attributes: ["outlet_name", "address", "city", "state", "postal_code"] }]
    }).then(async (result) => {

        if (result.length > 0) {
            var arrayOfData = [];

            _.map(result, async function (thisDa) {
                var thisD = thisDa.dataValues;
                var arr = thisD.brands_variant && JSON.parse(thisD.brands_variant);
                var txt = ''
                arr?.map((item, index) => {
                    if (index == (arr.length - 1)) {
                        txt = txt + item
                    } else {
                        txt = txt + item + ", "
                    }
                })
                var innerBulkData = {
                    "Project Name": thisD.Project ? thisD.Project.title : '-',
                    "User Name": thisD.User ? thisD.User.dataValues.username : '-',
                    "Outlet Name": thisD.Outlet ? thisD.Outlet.outlet_name : '-',
                    "Description": thisD.description ? thisD.description : '-',
                    "Status": thisD.status == 0 ? 'Pending' : thisD.status == 1 ? 'Completed' : 'Rejected',
                    "Effective": thisD.isEffective == 0 ? 'No' : 'Yes',
                    "Free": thisD.isFree == 0 ? 'No' : 'Yes',
                    "Effective Name": thisD.effective_name ? thisD.effective_name : '-',
                    "Effective Email": thisD.effective_email ? thisD.effective_email : '-',
                    "Effective Contact": thisD.effective_contact ? thisD.effective_contact : '-',
                    "Verified": thisD.isVerified == 0 ? 'No' : 'Yes',
                    "Gender": thisD.gender ? thisD.gender : '-',
                    "Age Group": thisD.age_group ? thisD.age_group : '-',
                    "Group Segment": thisD.group_segment ? thisD.group_segment : '-',
                    "Brands & Variant": thisD.brands_variant ? txt : '-',
                    "Date": moment(thisD.createdAt).format("MM-DD-YYYY hh:mm:ss")
                }
                arrayOfData.push(innerBulkData);
            });

            Promise.all(arrayOfData).then((responseD) => {
                if (responseD.length > 0) {
                    var csvfilename = "media/download/EXPORT_EFFECTIVE_USERS.csv";
                    var url = CONFIG.LIVE_IMAGE_URL_PATH + csvfilename;

                    const json2csvParser = new Json2csvParser({ header: true });

                    const jsonData1 = JSON.parse(JSON.stringify(arrayOfData) + '\r\n');

                    const csv = json2csvParser.parse(jsonData1);
                    fs.writeFile(path.join(__dirname, '../../..' + "/public/" + csvfilename), csv, function (error) {
                        if (error) {
                            return ReE(res, "Failed to create CSV!", 400);
                        } else {
                            return ReS(res, "CSV file exported successfully.", {
                                payload: {
                                    url: url
                                }
                            });
                        }
                    });
                }
            });
        } else {
            return ReE(res, "Failed to create CSV!", 400);
        }
    })
}