const Projects = require("../../../models").Projects;
const Products = require("../../../models").Products;
const Users = require("../../../models").Users;
const UserProjects = require("../../../models").UserProjects;
const Orders = require("../../../models").Orders;
const OrderDetails = require("../../../models").OrderDetails;
const Brands = require("../../../models").Brands;
const Stocks = require("../../../models").Stocks;
const StocksHistory = require("../../../models").StocksHistory;
const ProjectOutlets = require("../../../models").ProjectOutlets;
const Outlets = require("../../../models").Outlets;
const VisitationHistory = require("../../../models").VisitationHistory;
const TradeProducts = require("../../../models").TradeProducts;
const TradeRequest = require("../../../models").TradeRequest;
const BrandsVariant = require("../../../models").BrandsVariant;
const sequelize = require("../../../models").sequelize;
var Sequelize = require("sequelize");
const Op = Sequelize.Op;
var bcrypt = require("bcryptjs");
const moment = require('moment');
var _ = require('underscore');
var multer = require('multer');
var fs = require('fs');
var path = require('path');
const controller = require('../../../controllers/projects-functions');
const Json2csvParser = require("json2csv").Parser;
var helperController = require("../../../helpers/index");
var common = require("../../v1-api/projects/index.controller.js");
const XLSX = require('xlsx')

async function getOrderData(id) {
    var order = await Orders.findAll({
        where: { project_id: id, status: 1 },
        include: [{
            model: OrderDetails
        }],
        attributes: ['project_id', 'id', [sequelize.fn('count', sequelize.col('OrderDetails.quantity')), 'total_sales'],
            [sequelize.fn('sum', sequelize.col('OrderDetails.quantity')), 'total_quantity'],
            [sequelize.fn('sum', sequelize.col('OrderDetails.total_amount')), 'amount']],
        group: ['project_id']
    });
    return order;
}

async function getTotalStock(id) {
    var order = await Stocks.findAll({
        where: { project_id: id },
        include: [{
            model: StocksHistory,
            where: { status: { [Op.in]: [0, 1] } },
            attributes: []
        }],
        attributes: ['project_id', 'id', [sequelize.fn('count', sequelize.col('StocksHistories.quantity')), 'total_stocks'],
            [sequelize.fn('sum', sequelize.col('StocksHistories.quantity')), 'total_quantity']],
        group: ['project_id']
    });
    return order;
}

async function getOpenCloseStock(id) {
    var obj = {};

    var open = await StocksHistory.findAll({
        where: {
            stock_id: { [Op.in]: id },
            status: { [Op.in]: [0, 1] }
        },
        attributes: [[sequelize.fn('sum', sequelize.col('quantity')), 'total_sales']]
    }).then(response => {
        return response[0] ? response[0].dataValues.total_sales : null;
    });

    var close = await StocksHistory.findAll({
        where: {
            stock_id: { [Op.in]: id },
            status: { [Op.in]: [0, 1] },
            quantity: { [Op.like]: '-%' }
        },
        attributes: [[sequelize.fn('sum', sequelize.col('quantity')), 'total_sales']]
    }).then(response => {
        return response[0] ? response[0].dataValues.total_sales : null;
    });

    obj.close = close ? Math.abs(parseInt(close)) : 0

    obj.open = open ? parseInt(open) : 0;

    return obj;
}

module.exports.projectList = async function (req, res, next) {
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

    if (query.search) {
        wheres[Op.or] = [
            { title: { [Op.substring]: query.search } },
            // { '$UserProjects.Users.username$': { [Op.substring]: query.search } },
            // { '$UserProjects.Users.email$': { [Op.substring]: query.search } },
        ];
    }

    if (query.status) {
        wheres[Op.or] = [{
            status: query.status
        }]
    }

    if (query.category_id) {
        wheres[Op.or] = [{
            category_id: query.category_id
        }]
    }

    var whereOne = {}
    if (query.user_id) {
        whereOne[Op.or] = [{
            user_id: query.user_id
        }]
    }

    await Projects.findAndCountAll({
        where: wheres,
        distinct: true,
        limit: limit,
        offset: offset,
        include: [{
            model: UserProjects,
            where: whereOne,
            required: query.user_id ? true : false,
            attributes: ['user_id'],
            include: [{
                model: Users,
                attributes: ['id', 'username', 'email']
            }]
        }],
        order: [[sortBy, sortOrder]],
    }).then(async data => {
        var totalData = [];
        var totalD = async function (thisData) {
            var arr = [];
            var order = await getOrderData(thisData.dataValues.id);
            await thisData.UserProjects.map(item => {
                arr.push(item.User);
            });
            var outletCount = await ProjectOutlets.count({
                where: { project_id: thisData.dataValues.id },
            });
            thisData.dataValues.Users = arr;
            thisData.dataValues.total_sales = order && order.length > 0 ? order[0].dataValues.total_sales : 0;
            thisData.dataValues.total_quantity = order && order.length > 0 ? order[0].dataValues.total_quantity : 0;
            thisData.dataValues.total_amount = order && order.length > 0 ? order[0].dataValues.amount : 0;
            thisData.dataValues.outletCount = outletCount;
            var totalSt = await getTotalStock(thisData.dataValues.id);
            thisData.dataValues.total_stock = totalSt && totalSt.length > 0 ? totalSt[0].dataValues.total_quantity : 0;
            return thisData;
        };
        await _.each(data.rows, async function (thisData) {
            totalData.push(totalD(thisData));
        });
        Promise.all(totalData).then(results => {
            return ReS(res, "Projects fetched successfully.", {
                payload: {
                    data: { count: data.count, rows: results }
                }
            });
        })
    }).catch(err => {
        return ReE(res, err, 400);
    });

};

module.exports.addProject = async function (req, res, next) {
    var postdata = req.body;
    postdata.status = 1;
    postdata.campaign_id = "#" + randomNum(8);

    await Projects.findOne({
        where: {
            title: postdata.title
        }
    }).then(async (found) => {
        if (found) {
            return ReE(res, "Project already exist with same name!");
        } else {
            await Projects.create(postdata).then(async result => {
                if (result) {
                    if (postdata.users && postdata.users.length > 0) {
                        req.body.project_id = result.id;
                        await exports.assignToUser(req, res, next);
                    } else {
                        return ReS(res, "Project created successfully!");
                    }
                } else {
                    return ReE(res, "Failed to create project!");
                }
            });
        }
    }).catch(err => {
        return ReE(res, err, 400);
    });
}

module.exports.assignToUser = async function (req, res, next) {
    var postdata = req.body;
    var userarr = postdata.users;
    var arrayOfData = [];

    for (let i = 0; i < userarr.length; i++) {
        var obj = {
            user_id: userarr[i],
            project_id: postdata.project_id
        }
        arrayOfData.push(obj);
    }

    var promises = [];

    Object.entries(arrayOfData).forEach(async ([keyi, valuei]) => {
        var newPromise = await UserProjects.create(valuei);
        promises.push(newPromise);

        return newPromise;
    });

    return Promise.all(promises).then(function () {
        return ReS(res, "Project added successfully!");
    }).catch(function (err) {
        return ReE(res, err, 400);
    });
}

module.exports.editProject = async function (req, res, next) {
    var postdata = req.body;

    await Projects.findOne({
        where: {
            id: { [Op.ne]: postdata.id },
            title: postdata.title
        }
    }).then(async (found) => {
        if (found) {
            return ReE(res, "Failed to update project as project already exist with same name!");
        } else {

            await Projects.update(postdata, {
                where: {
                    id: postdata.id
                }
            }).then(async (updated) => {
                if (updated) {
                    if (postdata.users && postdata.users.length > 0) {
                        await exports.updateUserProjects(req, res, next);
                    } else {
                        return ReS(res, "Project updated successfully!");
                    }
                } else {
                    return ReE(res, "Failed to update project!", 400);
                }
            }).catch(err => {
                return ReE(res, err, 400);
            });
        }
    }).catch(err => {
        return ReE(res, err, 400);
    });
}

module.exports.updateUserProjects = async function (req, res, next) {
    var postdata = req.body;
    var userarr = postdata.users;
    var arrayOfData = [];

    var projectStatus = await Projects.findOne({ where: { id: postdata.id } });

    if (projectStatus && (projectStatus.isCompleted == 0 && projectStatus.status == 1)) {

        var exUser = await UserProjects.findAll({
            where: { project_id: postdata.id },
            attributes: ['user_id', 'project_id']
        });

        var existingUsers = _.map(exUser, function (domain) {
            return domain.user_id
        });

        var diff = _.difference(userarr, existingUsers);

        for (let i = 0; i < diff.length; i++) {
            var obj = {
                user_id: diff[i],
                project_id: postdata.id
            }
            arrayOfData.push(obj);
        }

        var promises = [];

        Object.entries(arrayOfData).forEach(async ([keyi, valuei]) => {
            var newPromise = await UserProjects.create(valuei);
            promises.push(newPromise);

            return newPromise;
        });

        return Promise.all(promises).then(async function () {
            var exUser = await UserProjects.update({ deletedAt: new Date() }, {
                where: { user_id: { [Op.notIn]: userarr }, project_id: postdata.id },
            });

            return ReS(res, "Project assignment updated successfully!");
        }).catch(function (err) {
            return ReE(res, err, 400);
        });
    } else {
        return ReE(res, "You cannot assign users to this project as this project might be inactivated or project is completed!");
    }
}

module.exports.deleteProject = async function (req, res, next) {
    var postdata = req.body;

    await Projects.update({
        deletedAt: new Date()
    }, {
        where: {
            id: postdata.id
        }
    }).then(async (updated) => {
        if (updated) {
            await UserProjects.update({ deletedAt: new Date() }, { where: { project_id: postdata.id } });
            return ReS(res, "Project deleted successfully!");
        } else {
            return ReE(res, "Failed to delete project!", 400);
        }
    }).catch(err => {
        return ReE(res, err, 400);
    });
}

module.exports.getStockDetail = async function (req, res, next) {

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
        offset = parseInt(query.page)
    }

    var wheres = { status: 1, };

    if (query.search) {
        wheres[Op.or] = [
            { name: { [Op.substring]: query.search } },
            { '$Products.name$': { [Op.substring]: query.search } },
        ];
    }
    await Brands.findAll({
        where: wheres,
        order: [['sort_order', 'ASC']],
        attributes: ['id', 'name', 'sort_order'],
        include: [{
            model: Products, where: { status: 1 }, required: true, right: true,
            order: [['createdAt', 'DESC']],
            attributes: ['id', 'name', 'image_url', 'amount'], include: [{
                model: Stocks,
                attributes: ['id', 'project_id', 'isReset'],
                required: true,
                right: true,
                where: {
                    isReset: 0
                },
            }]
        }],
    }).then(async data => {

        var totalData = [];
        var open = 0;
        var close = 0;
        var arr = []

        var totalD = async function (thisData) {
            for await (let i of thisData.Products) {
                var proj = _.pluck(i.Stocks, 'project_id');
                var stocks = _.pluck(i.Stocks, 'id');
                var order = await getOpenCloseStock(stocks);
                open = open + order.open;
                close = close + order.close;

                delete i.dataValues.Stocks;
                i.dataValues['brand_name'] = thisData.name;
                i.dataValues['brand_id'] = thisData.id;
                i.dataValues['balance'] = open;
                i.dataValues['close'] = close;
                i.dataValues['projectsArr'] = proj;
                open = 0;
                close = 0;
            }

            arr.push(thisData.Products);
            return thisData;
        };

        await _.each(data, async function (thisData) {
            totalData.push(totalD(thisData));
        });

        Promise.all(totalData).then(async results => {
            var result = await helperController.paginate([].concat.apply([], arr), limit, offset);

            return ReS(res, "Stocks fetched successfully.", {
                payload: {
                    data: {
                        count: [].concat.apply([], arr).length,
                        rows: result
                    }
                }
            });
        });
    });
}

module.exports.addStock = async function (req, res, next) {
    var postdata = req.body;
    req.checkBody({
        'project_id': {
            notEmpty: true,
            errorMessage: 'Project id is required'
        },
    });

    var errors = req.validationErrors();

    if (errors) {
        return ReE(res, errors[0].msg, 400);
    }

    if (postdata.products.length > 0) {
        var promises = [];
        Object.entries(postdata.products).forEach(async ([keyi, valuei]) => {
            if (valuei.stock_id) {
                var found = await Stocks.findOne({ where: { id: valuei.stock_id, project_id: postdata.project_id } });
                if (found) {
                    var created = await StocksHistory.create({
                        stock_id: valuei.stock_id,
                        quantity: valuei.quantity,
                    });
                    promises.push(created);
                    return created;
                } else {
                    return;
                }
            } else {
                var productFound = await Products.findOne({
                    where: {
                        id: valuei.product_id, status: 1
                    }
                });
                if (productFound) {
                    var found = await Stocks.findOne({
                        where: {
                            product_id: valuei.product_id, project_id: postdata.project_id
                        }
                    });
                    if (found) {
                        var created = await StocksHistory.create({
                            stock_id: found.id,
                            quantity: valuei.quantity,
                        });
                        promises.push(created);
                        return created;
                    } else {
                        await Stocks.create({
                            project_id: postdata.project_id,
                            product_id: valuei.product_id
                        }).then(async result => {
                            var created = await StocksHistory.create({
                                stock_id: result.id,
                                quantity: valuei.quantity,
                            });
                            promises.push(created);
                            return created;
                        })
                    }

                }
            }
        });

        return Promise.all(promises).then(function () {
            return ReS(res, "Stocks updated successfully!");
        }).catch(function (err) {
            return ReE(res, err, 400);
        });
    } else {
        return ReE(res, "Please provide products to update their stock");
    }
}

module.exports.getProductStockList = async function (req, res, next) {
    if (req.query.project_id) {

        var p1 = new Promise(async (resolve, reject) => {
            await controller.getProductStockList(req, function (responseData) {
                resolve(responseData);
            })
        })

        Promise.all([p1]).then(results => {
            var rows = results[0].data.results;
            return ReS(res, "Stocks fetched successfully.", {
                payload: {
                    data: rows,
                }
            });
        });
    } else {
        return ReE(res, "Project id required");
    }
}

module.exports.getProductStockListByProjects = async function (req, res, next) {
    if (req.body.projectsArr) {

        var p1 = new Promise(async (resolve, reject) => {
            await controller.getProductStockListByProjects(req, function (responseData) {
                resolve(responseData);
            })
        })

        Promise.all([p1]).then(results => {
            var rows = results[0].data;
            return ReS(res, "Stocks fetched successfully.", {
                payload: {
                    data: rows,
                }
            });
        });
    } else {
        return ReE(res, "Projects required");
    }
}

module.exports.getAllOrders = async function (req, res, next) {
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

    if (query.search) {
        wheres[Op.or] = [
            { '$Project.title$': { [Op.substring]: query.search } },
            { '$User.username$': { [Op.substring]: query.search } },
            { '$Outlet.outlet_name$': { [Op.substring]: query.search } },
        ];
    }

    if (query.status) {
        wheres[Op.or] = [{
            status: query.status
        }]
    }

    if (query.project_id) {
        wheres[Op.or] = [{
            project_id: query.project_id
        }]
    }

    if (query.user_id) {
        wheres[Op.or] = [{
            user_id: query.user_id
        }]
    }

    if (query.outlet_id) {
        wheres[Op.or] = [{
            outlet_id: query.outlet_id
        }]
    }

    await Orders.findAndCountAll(
        {
            where: wheres,
            limit: limit,
            offset: offset,
            order: [[sortBy, sortOrder]],
            include: [{
                model: Projects, attributes: ['title'],
                required: true,
            },
            {
                model: Users, attributes: ['username', 'system_id'],
                required: true,
            },
            {
                model: Outlets, attributes: ['outlet_name', 'address', 'city', 'state', 'postal_code'],
                required: true,
            },
            {
                model: OrderDetails,
                required: true,
                include: [{
                    model: Products, attributes: ['id', 'name', 'image_url'],
                }]
            }, {
                model: VisitationHistory,
                required: true,
            }],
        }).then(async result => {
            var totalData = [];
            var General = await common.getConfig();
            var SOBBrand = General[0];
            var FCBrand = General[1];

            await _.map(result.rows, async function (thisData) {
                var total_quantity = 0;
                var total_amount = 0;
                thisData.dataValues.project_name = thisData.dataValues.Project.dataValues.title;
                thisData.dataValues.user_name = thisData.dataValues.User.dataValues.username;
                thisData.dataValues.outlet_name = thisData.dataValues.Outlet.dataValues.outlet_name;
                thisData.dataValues.outlet_address = thisData.dataValues.Outlet.dataValues.address;
                var brand = thisData.dataValues.brands_variant && isJSON(thisData.dataValues.brands_variant) ? JSON.parse(thisData.dataValues.brands_variant) : thisData.dataValues.brands_variant;
                const FCfound = brand && FCBrand.some(r => brand.includes(r));
                const SOBfound = brand && SOBBrand.some(r => brand.includes(r));
                if (thisData.isEffective == 1) {
                    thisData.dataValues['effectiveFC'] = FCfound ? 1 : 0;
                    thisData.dataValues['effectiveSOB'] = SOBfound ? 1 : 0;
                } else {
                    thisData.dataValues['smokerFC'] = FCfound ? 1 : 0;
                    thisData.dataValues['smokerSOB'] = SOBfound ? 1 : 0;
                }
                await _.map(thisData.dataValues.OrderDetails, async function (thisD) {
                    thisD.dataValues.product_name = thisD.dataValues.Product.dataValues.name;
                    thisD.dataValues.product_url = thisD.dataValues.Product.dataValues.image_url;
                    total_quantity = total_quantity + thisD.dataValues.quantity;
                    total_amount = total_amount + thisD.dataValues.total_amount;

                    thisData.dataValues.total_quantity = total_quantity;
                    thisData.dataValues.total_amount = total_amount;
                    return thisData;
                });
                total_quantity = 0;
                delete thisData.dataValues.Project;
                delete thisData.dataValues.User;
                return thisData;
            });

            return ReS(res, "Projects fetched successfully.", {
                payload: {
                    data: { count: result.count, rows: result.rows }
                }
            });
        });
}

module.exports.updateOrderStatus = async function (req, res, next) {
    var postdata = req.body;

    await Orders.update(
        {
            status: postdata.status
        },
        {
            where: { id: postdata.id },

        }).then(async result => {
            if (result) {
                return ReS(res, "Order updated successfully.");
            } else {
                return ReE(res, "Order failed to update!");
            }
        }).catch(err => {
            return ReE(res, "Order failed to update!");
        });
}



module.exports.exportOrdersCSVOldVersion = async function (req, res, next) {
    await Orders.findAll(
        {
            include: [{
                model: Projects, attributes: ['title'],
                required: true,
            },
            {
                model: Users, attributes: ['username', 'system_id'],
                required: true,
            },
            {
                model: Outlets, attributes: ['outlet_name', 'address', 'city', 'state', 'postal_code'],
                required: true,
            },
            {
                model: OrderDetails,
                // required: true,
                include: [{
                    model: Products, attributes: ['name', 'image_url'],
                }]
            },
            {
                model: VisitationHistory,
                required: true,
            }],
            order: [['createdAt', 'DESC']]
        }).then(async (result) => {

            if (result.length > 0) {
                var innerBulkData =
                    ["Outlet",
                        "Username",
                        "Team",
                        "City",
                        "Zone",
                        "Visited Date",
                        "Check-in",
                        "Check-out",
                        "Duration",
                        "Gender",
                        "Age Group",
                        "Group Segment",
                        "Effective Contact",
                        "Name",
                        "Email",
                        "Contact Number",
                        "Verified",
                        "Free",
                        "Status",
                    ]
                var arr1 = ["", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", ""];

                var prods = await Products.findAll({
                    where: { status: 1 }, include: [{
                        model: Brands,
                        where: { status: 1 }
                    }]
                })
                var brandsV = await BrandsVariant.findAll({
                    where: { isCompany: 0 }
                })
                var arrayOfData = [];

                for (let i = 0; i < prods.length; i++) {
                    innerBulkData.push("SC FCH");
                    arr1.push(prods[i].name);
                    if (prods.length - 1 == i) {
                        innerBulkData.push("SC FCH");
                        arr1.push("TOTAL");
                    }
                }

                await brandsV.map(async (item, i) => {
                    var variants = item.variants;

                    await variants.map((v) => {
                        innerBulkData.push("SC SOB");
                        arr1.push(v);
                    });
                    if (brandsV.length - 1 == i) {
                        innerBulkData.push("SC SOB");
                        arr1.push("TOTAL");
                    }

                });
                for (let i = 0; i < prods.length; i++) {
                    innerBulkData.push("EFF SC FCH");
                    arr1.push(prods[i].name);
                    if (prods.length - 1 == i) {
                        innerBulkData.push("EFF SC FCH");
                        arr1.push("TOTAL");
                    }
                }

                await brandsV.map(async (item, i) => {
                    var variants = item.variants;

                    await variants.map((v) => {
                        innerBulkData.push("EFF SC SOB");
                        arr1.push(v);
                    })
                    if (brandsV.length - 1 == i) {
                        innerBulkData.push("EFF SC SOB");
                        arr1.push("TOTAL");
                    }
                })
                innerBulkData.push("TOTAL MEVIUS");
                innerBulkData.push("TOTAL MEVIUS");
                innerBulkData.push("TOTAL WINSTON");
                innerBulkData.push("TOTAL WINSTON");
                innerBulkData.push("TOTAL LD");
                innerBulkData.push("TOTAL LD");

                arr1.push("VP STOCK");
                arr1.push("OUTLET STOCK");
                arr1.push("VP STOCK");
                arr1.push("OUTLET STOCK");
                arr1.push("VP STOCK");
                arr1.push("OUTLET STOCK");
                arr1.push("");

                arrayOfData.push(innerBulkData);
                arrayOfData.push(arr1);
                for (let k = 0; k < result.length; k++) {
                    var arrin = [];
                    var thisDa = result[k];

                    var thisD = thisDa.dataValues;
                    var duration = "-"
                    if (thisD.VisitationHistory && thisD.VisitationHistory.dataValues.check_out) {
                        var m1 = moment(thisD.VisitationHistory.dataValues.check_in, 'DD-MM-YYYY HH:mm:ss');
                        var m2 = moment(thisD.VisitationHistory.dataValues.check_out, 'DD-MM-YYYY HH:mm:ss');
                        var m3 = m2.diff(m1);
                        duration = convertMinsToHrsMinsSecs(m3);
                    }
                    arrin = [
                        thisD.Outlet ? thisD.Outlet.dataValues.outlet_name : '-',
                        thisD.User ? thisD.User.dataValues.username : '',
                        thisD.Project ? thisD.Project.dataValues.title : '-',
                        thisD.Outlet ? thisD.Outlet.dataValues.city : '-',
                        thisD.Outlet ? thisD.Outlet.dataValues.state : '-',
                        thisD.VisitationHistory ? moment(thisD.VisitationHistory.dataValues.createdAt).format("DD-MMM-YY") : '-',
                        thisD.VisitationHistory ? thisD.VisitationHistory.dataValues.check_in ?
                            moment(thisD.VisitationHistory.dataValues.check_in).format("HH:mm") : '-' : '-',
                        thisD.VisitationHistory ? thisD.VisitationHistory.dataValues.check_out ?
                            moment(thisD.VisitationHistory.dataValues.check_out).format("HH:mm") : '-' : '-',
                        duration ? duration : '-',
                        thisD.gender ? thisD.gender : '-',
                        thisD.age_group ? thisD.age_group : '-',
                        thisD.group_segment ? thisD.group_segment : '-',
                        thisD.isEffective == 0 ? 'No' : 'Yes',
                        thisD.effective_name ? thisD.effective_name : '-',
                        thisD.effective_email ? thisD.effective_email : '-',
                        thisD.effective_contact ? thisD.effective_contact : '-',
                        thisD.isVerified == 0 ? 'No' : 'Yes',
                        thisD.isFree == 0 ? 'No' : 'Yes',
                        thisD.status == 0 ? 'Pending' : thisD.status == 1 ? 'Completed' : 'Void',
                    ];
                    var scFCHfirst = arrayOfData[0].indexOf("SC FCH");
                    var scFCHlast = arrayOfData[0].lastIndexOf("SC FCH");
                    var effscFCHfirst = arrayOfData[0].indexOf("EFF SC FCH");
                    var effscFCHlast = arrayOfData[0].lastIndexOf("EFF SC FCH");
                    var scSOBfirst = arrayOfData[0].indexOf("SC SOB");
                    var scSOBlast = arrayOfData[0].lastIndexOf("SC SOB");
                    var effscSOBfirst = arrayOfData[0].indexOf("EFF SC SOB");
                    var effscSOBlast = arrayOfData[0].lastIndexOf("EFF SC SOB");
                    for (let l = scFCHfirst; l < arrayOfData[0].length; l++) {
                        arrin.push(0);
                    }

                    var c = 0;
                    var ec = 0;

                    _.map(thisD.OrderDetails, async function (innerD) {
                        var inner = innerD.dataValues;

                        await arr1.map((item, i) => {
                            if (i >= scFCHfirst && i <= scFCHlast && thisD.isEffective == 0) {
                                if (item == inner.Product.name) {
                                    arrin[i] = arrin[i] + inner.quantity;
                                    c = c + inner.quantity;
                                }

                            } else if (i >= effscFCHfirst && i <= effscFCHlast && thisD.isEffective == 1) {
                                if (item == inner.Product.name) {
                                    arrin[i] = arrin[i] + inner.quantity;
                                    ec = ec + inner.quantity;
                                }
                            }
                        });


                        if (inner.Product.name.toLowerCase().includes("mevius")) {
                            var mFIndex = arrayOfData[0].indexOf("TOTAL MEVIUS");
                            var mFlast = arrayOfData[0].lastIndexOf("TOTAL MEVIUS");
                            await arr1.map((item, i) => {
                                if (i >= mFIndex && i <= mFlast) {
                                    if (item == "VP STOCK" && inner.isOutletStock == 0) {
                                        arrin[i] = arrin[i] + inner.quantity;
                                    } else if (item == "OUTLET STOCK" && inner.isOutletStock == 1) {
                                        arrin[i] = arrin[i] + inner.quantity;
                                    }
                                }

                            });
                        }
                        if (inner.Product.name.toLowerCase().includes("winston")) {
                            var wFIndex = arrayOfData[0].indexOf("TOTAL WINSTON");
                            var wFlast = arrayOfData[0].lastIndexOf("TOTAL WINSTON");
                            await arr1.map((item, i) => {
                                if (i >= wFIndex && i <= wFlast) {
                                    if (item == "VP STOCK" && inner.isOutletStock == 0) {
                                        arrin[i] = arrin[i] + inner.quantity;
                                    } else if (item == "OUTLET STOCK" && inner.isOutletStock == 1) {
                                        arrin[i] = arrin[i] + inner.quantity;
                                    }
                                }
                            });
                        }
                        if (inner.Product.name.toLowerCase().includes("ld")) {
                            var wFIndex = arrayOfData[0].indexOf("TOTAL LD");
                            var wFlast = arrayOfData[0].lastIndexOf("TOTAL LD");
                            await arr1.map((item, i) => {
                                if (i >= wFIndex && i <= wFlast) {
                                    if (item == "VP STOCK" && inner.isOutletStock == 0) {
                                        arrin[i] = arrin[i] + inner.quantity;
                                    } else if (item == "OUTLET STOCK" && inner.isOutletStock == 1) {
                                        arrin[i] = arrin[i] + inner.quantity;
                                    }
                                }
                            });
                        }
                    });

                    var arr = thisD.brands_variant ? await helperController.checkJSON(thisD.brands_variant) ?
                        JSON.parse(thisD.brands_variant) : thisD.brands_variant : [];

                    var c1 = 0;
                    var ec1 = 0;
                    if (arr.length > 0) {
                        await arr.map(async (item, index) => {
                            await arr1.map((iteminner, i) => {
                                if (i >= scSOBfirst && i <= scSOBlast && thisD.isEffective == 0) {
                                    if (item === iteminner) {
                                        arrin[i] = arrin[i] + 1;
                                    }
                                    c1 = c1 + arrin[i];
                                } else if (i >= effscSOBfirst && i <= effscSOBlast && thisD.isEffective == 1) {
                                    if (item === iteminner) {
                                        arrin[i] = arrin[i] + 1;
                                    }
                                    ec1 = ec1 + arrin[i];
                                }
                            });
                        })
                    }


                    await arr1.map((item, i) => {
                        var mFIndex = arrayOfData[0].indexOf("TOTAL MEVIUS");
                        var wFlast = arrayOfData[0].lastIndexOf("TOTAL LD");
                        if (i >= scFCHfirst && i < scSOBfirst) {
                            if (item == "TOTAL") {
                                arrin[scFCHlast] = c;
                            }
                        } else if (i >= effscFCHfirst && i < effscSOBfirst) {
                            if (item == "TOTAL") {
                                arrin[effscFCHlast] = ec;
                            }
                        } else if (i >= scSOBfirst && i < effscFCHfirst) {
                            if (item == "TOTAL") {
                                arrin[scSOBlast] = c1;
                            }
                        } else if (i >= effscSOBfirst && i <= effscSOBlast) {
                            if (item == "TOTAL") {
                                arrin[effscSOBlast] = ec1;
                            }
                        }
                    });
                    arrayOfData.push(arrin);
                }

                Promise.all(arrayOfData).then((responseD) => {
                    if (responseD.length > 0) {
                        var csvfilename = "media/download/EXPORT_ORDERS_LOG.csv"
                        var url = CONFIG.LIVE_IMAGE_URL_PATH + csvfilename;

                        const ws = XLSX.utils.aoa_to_sheet(arrayOfData)
                        const wb = XLSX.utils.book_new();
                        XLSX.utils.book_append_sheet(wb, ws, 'Responses')
                        var pathf = path.join(__dirname, '../../..' + "/public/" + csvfilename)
                        XLSX.writeFile(wb, pathf, { bookType: 'csv' });
                        return ReS(res, "CSV file exported successfully.", {
                            payload: {
                                url: url
                            }
                        });
                    }
                });
            }
        })
}


async function getBrand(data, BrandsVarray) {
    var brand = [];
    if (BrandsVarray && BrandsVarray.length > 0) {
        await BrandsVarray.map(async (item) => {
            await item.variants.map((it) => {
                if (it == data) {
                    brand.push(item);
                }
            })
        });
    }
    return brand;
}

module.exports.exportOrdersCSV = async function (req, res, next) {
    var query = req.body;
    var wheres = [];

    wheres.push({
        createdAt: { [Op.between]: [query.start_date, query.end_date] }
    });

    if (query.search != "") {
        wheres.push(
            { '$Project.title$': { [Op.substring]: query.search } },
            { '$User.username$': { [Op.substring]: query.search } },
            { '$Outlet.outlet_name$': { [Op.substring]: query.search } },
        );
    }

    if (query.statusF != "") {
        wheres.push({
            status: query.statusF
        })
    }

    if (query.project_id != "") {
        wheres.push({
            project_id: query.project_id
        })
    }

    if (query.user_id != "") {
        wheres.push({
            user_id: query.user_id
        })
    }

    if (query.outlet_id != "") {
        wheres.push({
            outlet_id: query.outlet_id
        })
    }

    var prods = await Products.findAll({
        where: { status: 1 }, include: [{
            model: Brands,
            where: { status: 1 }
        }]
    })

    var BrandsVarray = await BrandsVariant.findAll();

    var innerBulkData =
        ["Outlet",
            "Username",
            "Team",
            "City",
            "Zone",
            "Visited Date",
            "week",
            "Check-in",
            "Check-out",
            "Duration",
            "Gender",
            "Age Group",
            "Group Segment",
            "Brand",
            "Variant",
            "Effective Contact",
            "Consumer Profile",
            "Name",
            "Email",
            "Contact Number",
            "Verified",
            "Free",
            "Status",
        ]

    var arrayOfData = [];

    var mFFirst = 0;
    var wfFirst = 0;
    var ldFirst = 0;

    for (let i = 0; i < prods.length; i++) {
        if (prods[i].name.toLowerCase().startsWith("mevius") && mFFirst == 0) {
            mFFirst = prods[i].name;
        }

        if (prods[i].name.toLowerCase().startsWith("winston") && wfFirst == 0) {
            wfFirst = prods[i].name;
        }
        if (prods[i].name.toLowerCase().startsWith("ld") && ldFirst == 0) {
            ldFirst = prods[i].name;
        }
        innerBulkData.push(prods[i].name);
        if (prods.length - 1 == i) {
            innerBulkData.push("TOTAL");
        }
    }

    innerBulkData.push("MEVIUS VP STOCK");
    innerBulkData.push("MEVIUS OUTLET STOCK");
    innerBulkData.push("WINSTON VP STOCK");
    innerBulkData.push("WINSTON OUTLET STOCK");
    innerBulkData.push("LD VP STOCK");
    innerBulkData.push("LD OUTLET STOCK");
    var headerData = [];
    headerData.push(innerBulkData);

    arrayOfData.push(innerBulkData);

    var limit = 3000;
    var offset = 0;
    var page = 1;
    var totalRecords = 3000;
    var token = randomNum(5);

    var fetchData = async function (offsetD) {
        await Orders.findAll(
            {
                include: [{
                    model: Projects, attributes: ['title'],
                    required: true,
                },
                {
                    model: Users, attributes: ['username', 'system_id'],
                    required: true,
                },
                {
                    model: Outlets, attributes: ['outlet_name', 'address', 'city', 'state', 'postal_code'],
                    required: true,
                },
                {
                    model: OrderDetails,
                    include: [{
                        model: Products, attributes: ['name', 'image_url'],
                    }]
                },
                {
                    model: VisitationHistory,
                    required: true,
                }],
                limit: limit,
                offset: offsetD,
                where: wheres,
                order: [['createdAt', 'DESC']]
            }).then(async (result) => {
                totalRecords = result.length;
                page++;
                console.log(totalRecords);
                if (result.length > 0) {

                    for (let k = 0; k < result.length; k++) {
                        var arrin = [];
                        var thisDa = result[k];
                        var thisD = thisDa.dataValues;
                        var arr = thisD.brands_variant ? await helperController.checkJSON(thisD.brands_variant) ?
                            JSON.parse(thisD.brands_variant) : thisD.brands_variant : [];
                        var brandsArr = [];
                        var isSOB = null;

                        for (let j = 0; j < arr.length; j++) {
                            var a = await getBrand(arr[j], BrandsVarray);
                            if (a && a.length > 0) {
                                brandsArr.push(a[0].brands);
                            }
                            if (a && a.length > 0 && a[0].isCompany == 0) {
                                isSOB = true;
                            } else if (a && a.length > 0 && a[0].isCompany == 1) {
                                isSOB = false;
                            }
                        }

                        var duration = "-";
                        var week = "-";
                        if (thisD.VisitationHistory && thisD.VisitationHistory.dataValues.check_out) {
                            var m1 = moment(thisD.VisitationHistory.dataValues.check_in, 'DD-MM-YYYY HH:mm:ss');
                            var m2 = moment(thisD.VisitationHistory.dataValues.check_out, 'DD-MM-YYYY HH:mm:ss');
                            var m3 = m2.diff(m1);
                            duration = convertMinsToHrsMinsSecs(m3);
                        }

                        if (thisD.VisitationHistory && thisD.VisitationHistory.dataValues.check_in) {
                            var m1 = new Date(thisD.VisitationHistory.dataValues.check_in);
                            var m2 = await getWeekNumberNonISO(m1);
                            week = m2;
                        }

                        arrin = [
                            thisD.Outlet ? thisD.Outlet.dataValues.outlet_name : '-',
                            thisD.User ? thisD.User.dataValues.username : '',
                            thisD.Project ? thisD.Project.dataValues.title : '-',
                            thisD.Outlet ? thisD.Outlet.dataValues.city : '-',
                            thisD.Outlet ? thisD.Outlet.dataValues.state : '-',
                            thisD.VisitationHistory ? moment(thisD.VisitationHistory.dataValues.createdAt).format("DD-MMM-YY") : '-',
                            week,
                            thisD.VisitationHistory ? thisD.VisitationHistory.dataValues.check_in ?
                                moment(thisD.VisitationHistory.dataValues.check_in).format("HH:mm") : '-' : '-',
                            thisD.VisitationHistory ? thisD.VisitationHistory.dataValues.check_out ?
                                moment(thisD.VisitationHistory.dataValues.check_out).format("HH:mm") : '-' : '-',
                            duration ? duration : '-',
                            thisD.gender ? thisD.gender : '-',
                            thisD.age_group ? thisD.age_group : '-',
                            thisD.group_segment ? thisD.group_segment : '-',
                            brandsArr.length > 0 ? brandsArr[0] : "-",
                            arr.length > 0 ? arr[0] : "-",
                            thisD.isEffective,
                            isSOB ? "SOB" : isSOB == false ? "FCH" : "-",
                            thisD.effective_name ? thisD.effective_name : '-',
                            thisD.effective_email ? thisD.effective_email : '-',
                            thisD.effective_contact ? thisD.effective_contact : '-',
                            thisD.isVerified == 0 ? 'No' : 'Yes',
                            thisD.isFree == 0 ? 'No' : 'Yes',
                            thisD.status == 0 ? 'Pending' : thisD.status == 1 ? 'Completed' : 'Void',
                        ];

                        var scFCHfirst = headerData[0].indexOf(prods[0].name);
                        var scFCHlast = headerData[0].lastIndexOf(prods[prods.length - 1].name);
                        for (let l = scFCHfirst; l < headerData[0].length; l++) {
                            arrin.push(0);
                        }

                        var c = 0;

                        _.map(thisD.OrderDetails, async function (innerD) {
                            var inner = innerD.dataValues;

                            await headerData[0].map(async (item, i) => {
                                if (i >= scFCHfirst && i <= scFCHlast && thisD.isEffective == 1) {
                                    if (item == inner.Product.name) {
                                        arrin[i] = arrin[i] + inner.quantity;
                                        c = c + inner.quantity;
                                    }
                                }

                                if (inner.Product.name.toLowerCase().includes("mevius")) {
                                    if (item == "MEVIUS VP STOCK" && inner.isOutletStock == 0) {
                                        arrin[i] = arrin[i] + inner.quantity;
                                    } else if (item == "MEVIUS OUTLET STOCK" && inner.isOutletStock == 1) {
                                        arrin[i] = arrin[i] + inner.quantity;
                                    }
                                }

                                if (inner.Product.name.toLowerCase().includes("winston")) {
                                    if (item == "WINSTON VP STOCK" && inner.isOutletStock == 0) {
                                        arrin[i] = arrin[i] + inner.quantity;
                                    } else if (item == "WINSTON OUTLET STOCK" && inner.isOutletStock == 1) {
                                        arrin[i] = arrin[i] + inner.quantity;
                                    }
                                }
                                if (inner.Product.name.toLowerCase().includes("ld")) {
                                    if (item == "LD VP STOCK" && inner.isOutletStock == 0) {
                                        arrin[i] = arrin[i] + inner.quantity;
                                    } else if (item == "LD OUTLET STOCK" && inner.isOutletStock == 1) {
                                        arrin[i] = arrin[i] + inner.quantity;
                                    }
                                }
                            });

                        });

                        await headerData[0].map(async (item, i) => {
                            if (item == "TOTAL") {
                                arrin[i] = c;
                            }
                        });
                        arrayOfData.push(arrin);

                    }
                    var csvfilename = "media/download/EXPORT_ORDERS_LOG.csv"

                    const ws = XLSX.utils.aoa_to_sheet(arrayOfData)
                    const wb = XLSX.utils.book_new();
                    XLSX.utils.book_append_sheet(wb, ws, 'Responses')
                    var pathf = path.join(__dirname, '../../..' + "/public/" + csvfilename)
                    XLSX.writeFile(wb, pathf, { bookType: 'csv' });
                    var offsetD = limit * (parseInt(page) - 1);
                    if (totalRecords < limit) {
                        setRadisByKey("EXPORT_ORDER", token);
                    } else {
                        await fetchData(offsetD);
                    }

                } else {
                    setRadisByKey("EXPORT_ORDER", token);
                }
            });
    }

    if (totalRecords != 0) {
        console.log("**************Call API");
        offset = limit * (parseInt(page) - 1);
        fetchData(offset);
        return ReS(res, "CSV file exporting is in progress, it might take sometime in downloading.", {
            payload: {
                url: ""
            }
        });
    } else {
        return ReE(res, "CSV file not exported.");
    }
}

module.exports.downloadcsv = async function (req, res, next) {
    const csvFile = "media/download/EXPORT_ORDERS_LOG.csv";
    var localFilePath = "./public/" + csvFile;
    var url = CONFIG.LIVE_IMAGE_URL_PATH + csvFile;
    await getRadisByKey("EXPORT_ORDER", async function (result) {
        console.log("*****************", result)
        if (result != undefined && fs.existsSync(localFilePath)) {
            delRadisByKey("EXPORT_ORDER");
            return ReS(res, "CSV file exported successfully.", {
                payload: {
                    url: url
                }
            });
        }
        else {
            return ReE(res, "Failed to export CSV file!");
        }
    });
}

module.exports.deletecsvfile = async function (req, res, next) {

    const csvFile = "media/download/EXPORT_ORDERS_LOG.csv";
    var localFilePath = "./public/" + csvFile;

    if (fs.existsSync(localFilePath)) {
        fs.unlink(localFilePath, function (err) {
            if (err) {
                console.log('Error!', err)
            }
            return ReS(res, "File deleted successfully!");
        })
    } else {
        return ReS(res, "File not exist!");
    }

}

module.exports.visitationLogs = async function (req, res, next) {
    var project_id = req.query.project_id;
    var user_id = req.query.user_id;
    var outlet_id = req.query.outlet_id;
    var type = req.query.type;

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
    if (query.search) {
        wheres[Op.or] = [
            { '$Project.title$': { [Op.substring]: query.search } },
            { '$User.username$': { [Op.substring]: query.search } },
            { '$Outlet.outlet_name$': { [Op.substring]: query.search } },
        ];
    }

    if (query.range) {
        var start_date = moment().startOf('day');
        var end_date = moment().endOf('day');
        if (query.range == 1) {
            start_date = moment().startOf('week');
            end_date = moment().endOf('week');
            wheres[Op.or] = {
                check_in: { [Op.between]: [start_date, end_date] }
            }
        } else if (query.range == 2) {
            start_date = moment().day(-7).startOf('week');
            end_date = moment().day(-7).endOf('week');
            wheres[Op.or] = {
                check_in: { [Op.between]: [start_date, end_date] }
            }
        } else if (query.range == 3) {
            start_date = moment().month(-1).startOf('month');
            end_date = moment().month(-1).endOf('month');
            wheres[Op.or] = {
                check_in: { [Op.between]: [start_date, end_date] }
            }
        } else {
            wheres[Op.or] = {
                check_in: { [Op.between]: [start_date, end_date] }
            }
        }
    }
    var arr = [];
    if (project_id) {
        wheres[Op.or] = [
            {
                project_id
            }
        ];
    }
    if (user_id) {
        wheres[Op.or] = [
            {
                user_id
            }
        ];
    }
    if (outlet_id) {
        wheres[Op.or] = [
            {
                outlet_id
            }
        ];
    }
    if (type) {
        wheres[Op.or] = [
            {
                type
            }
        ];
    }

    await VisitationHistory.findAndCountAll({
        where: wheres,
        include: [{
            model: Outlets,
            attributes: ['outlet_name', 'outlet_url', 'address', 'city', 'state', 'postal_code'],
        }, {
            model: Users,
            attributes: ['username']
        }, {
            model: Projects,
            attributes: ['title', 'campaign_id']
        }],
        limit: limit,
        offset: offset,
        order: [[sortBy, sortOrder]],
    }).then(async data => {
        var totalData = [];

        var totalD = async function (item) {
            item.dataValues.outlet_name = item.dataValues.Outlet.outlet_name;
            item.dataValues.outlet_url = item.dataValues.Outlet.outlet_url;
            item.dataValues.address = item.dataValues.Outlet.address;
            delete item.dataValues.Outlet;
            arr.push(item);
        }

        _.map(data.rows, async function (thisData) {
            totalData.push(totalD(thisData));
        });
        Promise.all(totalData).then(() => {
            return ReS(res, "Visitation detail fetched successfully.", {
                payload: {
                    count: data.count, rows: arr
                }
            });
        })

    }).catch(err => {
        return ReE(res, err, 400);
    });
}

module.exports.allProjects = async function (req, res, next) {

    var sortBy = "createdAt";
    var sortOrder = "DESC";

    var wheres = { status: 1, isCompleted: 0 };

    await Projects.findAndCountAll({
        where: wheres,
        order: [[sortBy, sortOrder]],
    }).then(async data => {
        return ReS(res, "Projects fetched successfully.", {
            payload: {
                data: { count: data.count, rows: data.rows }
            }
        });
    }).catch(err => {
        return ReE(res, err, 400);
    });


};

module.exports.getTradeList = async function (req, res, next) {

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
    if (query.status != 3) {
        wheres = {
            status: parseInt(query.status)
        }
    }
    var whereq = {}
    if (query.user_id) {
        whereq[Op.or] = {
            user_id: parseInt(query.user_id)
        }
    }

    if (query.project_id) {
        whereq[Op.or] = {
            project_id: parseInt(query.project_id)
        }
    }

    if (query.search) {
        whereq[Op.or] = [
            { '$Project.title$': { [Op.substring]: query.search } },
            { '$Project.campaign_id$': { [Op.substring]: query.search } },
            { '$User.username$': { [Op.substring]: query.search } },
            { '$User.system_id$': { [Op.substring]: query.search } },
        ];
    }

    var pending = null;

    pending = await TradeRequest.findAll({
        where: whereq,
        include: [{
            model: TradeProducts,
            where: wheres,
            required: true,
            right: true,
        }, {
            model: Projects,
            required: true,
            right: true,
            attributes: ['id', 'title', 'campaign_id'],
        }, {
            model: Users,
            required: true,
            right: true,
            attributes: ['id', 'username', 'system_id']
        }],
        limit: limit,
        offset: offset,
        order: [[sortBy, sortOrder]],
    });

    var count = await TradeRequest.findAll({
        where: whereq,
        raw: true,
        include: [{
            model: TradeProducts,
            where: wheres,
            required: true,
            right: true,
        }, {
            model: Projects,
            required: true,
            right: true,
            attributes: ['id', 'title', 'campaign_id'],
        }, {
            model: Users,
            required: true,
            right: true,
            attributes: ['id', 'username', 'system_id']
        }],
        attributes: ['TradeRequest.*', 'TradeProducts.*', [sequelize.fn('COUNT', 'TradeRequest.id'), 'PostCount']],
        group: ['TradeProducts.trade_id']
    });

    var pendingData = [];

    var totalD = async function (thisData) {
        var user = await Users.findOne({ where: { id: thisData.user_id }, attributes: ['username', 'system_id'] });
        var sum = 0;
        thisData.dataValues.username = user.username;
        thisData.dataValues.system_id = user.system_id;

        for await (let i of thisData.dataValues.TradeProducts) {
            var product = await Products.findOne({ where: { id: i.product_id }, attributes: ['name', 'amount'] });
            i.dataValues.project_id = thisData.dataValues.project_id;
            i.dataValues.product_name = product.name;
            i.dataValues.product_amount = product.amount;
            sum = sum + i.dataValues.quantity;
            thisData.dataValues.totalQuantity = sum;
            thisData.dataValues.status = i.dataValues.status;
        }
        return thisData;
    };
    await _.each(pending, async function (thisData) {
        pendingData.push(totalD(thisData));
    });
    Promise.all(pendingData).then(results => {
        return ReS(res, "Projects fetched successfully.", {
            payload: {
                data: {
                    count: count.length,
                    rows: results
                }
            }
        });
    });
}

module.exports.updateStock = async function (req, res, next) {
    var postdata = req.body;
    req.checkBody({
        'project_id': {
            notEmpty: true,
            errorMessage: 'Project id is required'
        },
    });

    var errors = req.validationErrors();

    if (errors) {
        return ReE(res, errors[0].msg, 400);
    }

    var products = await isJSON(postdata.products) ? JSON.parse(postdata.products) : postdata.products;
    if (products.length > 0) {
        var promises = [];
        Object.entries(products).forEach(async ([keyi, valuei]) => {
            if (valuei.stock_id) {
                var found = await Stocks.findOne({ where: { id: valuei.stock_id, project_id: postdata.project_id } });
                valuei.quantity = valuei.quantity.toString();
                if (found) {
                    if (valuei.quantity && valuei.quantity.startsWith("-")) {
                        var quantity = valuei.originalQuantity - (Math.abs(valuei.quantity));
                        var created = await StocksHistory.update({
                            deletedAt: new Date()
                        }, {
                            where: {
                                stock_id: valuei.stock_id
                            }
                        });
                        var created = await StocksHistory.create({
                            stock_id: valuei.stock_id,
                            quantity: quantity
                        });
                        promises.push(created);
                        return created;
                    } else {
                        var created = await StocksHistory.create({
                            stock_id: valuei.stock_id,
                            quantity: valuei.quantity,
                        });
                        promises.push(created);
                        return created;
                    }

                } else {
                    return;
                }
            } else {
                var productFound = await Products.findOne({
                    where: {
                        id: valuei.product_id, status: 1
                    }
                });
                if (productFound) {
                    var found = await Stocks.findOne({
                        where: {
                            product_id: valuei.product_id, project_id: postdata.project_id
                        }
                    });
                    if (found) {
                        var created = await StocksHistory.create({
                            stock_id: found.id,
                            quantity: valuei.quantity,
                        });
                        promises.push(created);
                        return created;
                    } else {
                        await Stocks.create({
                            project_id: postdata.project_id,
                            product_id: valuei.product_id
                        }).then(async result => {
                            var created = await StocksHistory.create({
                                stock_id: result.id,
                                quantity: valuei.quantity,
                            });
                            promises.push(created);
                            return created;
                        })
                    }

                }
            }
        });

        return Promise.all(promises).then(function () {
            return ReS(res, "Stocks updated successfully!");
        }).catch(function (err) {
            return ReE(res, err, 400);
        });
    } else {
        return ReE(res, "Please provide products to update their stock");
    }
}