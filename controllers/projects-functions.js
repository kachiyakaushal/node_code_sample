const Projects = require("../models").Projects;
const Users = require("../models").Users;
const UserProjects = require("../models").UserProjects;
const Orders = require("../models").Orders;
const OrderDetails = require("../models").OrderDetails;
const VisitationHistory = require("../models").VisitationHistory;
const ProjectOutlets = require("../models").ProjectOutlets;
const OutletOpenHours = require("../models").OutletOpenHours;
const Outlets = require("../models").Outlets;
const Products = require("../models").Products;
const Stocks = require("../models").Stocks;
const StocksHistory = require("../models").StocksHistory;
const TradeRequest = require("../models").TradeRequest;
const Brands = require("../models").Brands;
const sequelize = require("../models").sequelize;
var Sequelize = require("sequelize");
const Op = Sequelize.Op;
var bcrypt = require("bcryptjs");
const moment = require('moment');
var _ = require('underscore');
var multer = require('multer');
var fs = require('fs');
var controllerFun = require("../routes/v1-api/outlets/index.controller");
var weekorder = { sunday: 1, monday: 2, tuesday: 3, wednesday: 4, thursday: 5, friday: 6, saturday: 7 };

module.exports.getTotalStock = async function (id) {
    var obj = {};

    var open = await StocksHistory.findAll({
        where: {
            stock_id: id,
            status: { [Op.in]: [0, 1] }
        },
        attributes: [[sequelize.fn('sum', sequelize.col('quantity')), 'total_sales']]
    }).then(response => {
        return response[0] ? response[0].dataValues.total_sales : null;
    });
    var whereeq = {
        stock_id: id,
        status: { [Op.in]: [0, 1] },
        quantity: { [Op.like]: '-%' }
    }
    whereeq[Op.and] = [
        sequelize.where(sequelize.fn('date', sequelize.col('createdAt')), '=', moment().format('YYYY-MM-DD'))
    ]

    var close = await StocksHistory.findAll({
        where: whereeq,
        attributes: [[sequelize.fn('sum', sequelize.col('quantity')), 'total_sales']]
    }).then(response => {
        return response[0] ? response[0].dataValues.total_sales : null;
    });

    obj.close = close ? Math.abs(parseInt(close)) : 0

    obj.open = open ? parseInt(open) : 0

    return obj;
}

module.exports.getProductStockList = async function (req, callback) {
    await Brands.findAll({
        where: {
            status: 1,
        },
        attributes: ['id', 'name'],
        order: [['sort_order', 'ASC']],
        include: [{
            model: Products, where: { status: 1 }, order: [['createdAt', 'DESC']], required: true,
            attributes: ['id', 'name', 'image_url', 'amount'], include: [{
                model: Stocks
            }]
        }],
    }).then(async data => {
        var totalData = [];
        var totalD = async function (thisData) {
            for await (let i of thisData.Products) {
                if (i.Stocks.length > 0) {
                    for await (let k of i.Stocks) {
                        if (k.project_id == req.query.project_id && k.isReset == 0) {
                            var order = await exports.getTotalStock(k.id);
                            var open = order.open.toString();
                            i.dataValues['stock_id'] = k.id;
                            i.dataValues['balance'] = open.includes("-") ? 0 : parseInt(order.open);
                            break;
                        } else {
                            i.dataValues['stock_id'] = 0;
                            i.dataValues['balance'] = 0;
                        }
                    }
                } else {
                    i.dataValues['stock_id'] = 0;
                    i.dataValues['balance'] = 0;
                }
                delete i.dataValues.Stocks;
            }

            return thisData;
        };

        await _.each(data, async function (thisData) {
            totalData.push(totalD(thisData));
        });

        Promise.all(totalData).then(results => {
            return callback({ code: 200, data: { results } });
        });
    });
}

module.exports.getProductStockListByProjects = async function (req, callback) {
    var postdata = req.body;
    var projArr = JSON.parse(req.body.projectsArr);
    await Products.findAll({
        where: {
            id: postdata.id,
            status: 1,
        }, include: [{
            model: Stocks,
            required: true,
            where: {
                project_id: { [Op.in]: projArr }, isReset: 0
            },
            include: [{ model: Projects, attributes: ['title'] }]
        }]
    }).then(async data => {
        var totalData = [];
        var projData = [];
        var open = 0;
        var close = 0;
        var totalD = async function (thisData) {
            for await (let k of thisData.Stocks) {
                var order = await exports.getTotalStock(k.id);
                for await (let j of projArr) {
                    if (j == k.project_id && k.Project) {
                        var obj = {
                            project_name: k.Project.title,
                            open: open + order.open,
                            close: close + order.close
                        }
                        projData.push(obj);
                    }
                }

            }
            open = 0;
            close = 0;
            delete thisData.dataValues.Stocks;


            return projData;
        };
        await _.each(data, async function (thisData) {
            totalData.push(totalD(thisData));
        });

        Promise.all(totalData).then(results => {
            return callback({ code: 200, data: results[0] });
        });
    });
}

module.exports.getOutletDetail = async function (postdata, callback) {
    if (postdata.visitation_id) {
        var effectiveCount = await Orders.count({
            where: {
                visitation_id: postdata.visitation_id,
                project_id: postdata.project_id,
                outlet_id: postdata.outlet_id,
                user_id: postdata.user_id,
                isEffective: 1,
                status: { [Op.ne]: 2 }
            }
        });
        var packSold = await Orders.count({
            where: {
                visitation_id: postdata.visitation_id,
                project_id: postdata.project_id,
                outlet_id: postdata.outlet_id,
                user_id: postdata.user_id,
                status: 1
            }
        });
        var visitHis = await VisitationHistory.findOne({
            where: {
                id: postdata.visitation_id,
                project_id: postdata.project_id,
                outlet_id: postdata.outlet_id,
                user_id: postdata.user_id,
            }
        });
        var effectiveData = await Orders.findAll({
            where: {
                visitation_id: postdata.visitation_id,
                project_id: postdata.project_id,
                outlet_id: postdata.outlet_id,
                user_id: postdata.user_id,
                isEffective: 1,
                status: { [Op.ne]: 2 }
            },
            limit: 5,
            order: [['createdAt', 'DESC']],
            include: [{
                model: OrderDetails,
                include: [{
                    model: Products,
                    attributes: ["name"]
                }]
            }]
        });
        var non_effectiveData = await Orders.findAll({
            where: {
                visitation_id: postdata.visitation_id,
                project_id: postdata.project_id,
                outlet_id: postdata.outlet_id,
                user_id: postdata.user_id,
                isEffective: 0,
                status: { [Op.ne]: 2 }
            },
            limit: 5,
            order: [['createdAt', 'DESC']],
            include: [{
                model: OrderDetails,
                include: [{
                    model: Products,
                    attributes: ["name"]
                }]
            }]
        });

        await effectiveData.map(async thisD => {
            var sum = 0;
            await thisD.OrderDetails.map(thisDa => {
                thisDa.dataValues.product_name = thisDa.dataValues.Product.name;
                sum = sum + thisDa.dataValues.total_amount;
                thisD.dataValues.orderTotalAmount = sum;
                delete thisDa.dataValues.Product;
                return thisDa;
            })
        });

        await non_effectiveData.map(async thisD => {
            var sum = 0;
            await thisD.OrderDetails.map(thisDa => {
                thisDa.dataValues.product_name = thisDa.dataValues.Product.name;
                sum = sum + thisDa.dataValues.total_amount;
                thisD.dataValues.orderTotalAmount = sum;
                delete thisDa.dataValues.Product;
                return thisDa;
            })
        });


        return callback({
            code: 200,
            data: {
                total_sold: packSold,
                effectiveCount,
                effectiveData: (effectiveData && visitHis.id) ? visitHis.type == 0 ? effectiveData : [] : [],
                non_effectiveData: (non_effectiveData && visitHis.id) ? visitHis.type == 0 ? non_effectiveData : [] : [],
                visitation_id: parseInt(postdata.visitation_id),
                checkInStatus: visitHis.id ? visitHis.type == 0 ? "Ongoing" : "Visited" : null
            }
        });
    } else {
        var start = moment().set({ hours: 0, minute: 0, second: 0 });
        var end = moment().set({ hours: 23, minute: 59, second: 59 });
        await VisitationHistory.findOne({
            where: {
                project_id: postdata.project_id,
                outlet_id: postdata.outlet_id,
                user_id: postdata.user_id,
                type: { [Op.ne]: 2 },
                check_in: { [Op.between]: [start, end] },
            }
        }).then(result => {
            return callback({
                code: 200,
                data: {
                    total_sold: 0,
                    effectiveCount: 0,
                    effectiveData: [],
                    non_effectiveData: [],
                    visitation_id: result ? parseInt(result.id) : null,
                    checkInStatus: result ? (result.type == 0) ? "Ongoing" : "Visited" : null
                }
            });
        });
    }
}

async function getExecutionUrl(visit) {
    var data = await VisitationHistory.findOne({
        where: {
            id: parseInt(visit.id)
        },
        attributes: ['execution_url']
    });
    return data ? data.execution_url : []
}

module.exports.outletList = async function (id, user_id, callback) {
    await ProjectOutlets.findAll({
        where: {
            project_id: id
        }
    }).then(async results => {
        var mondayArr = [];
        var tuesdayArr = [];
        var weddayArr = [];
        var thursdayArr = [];
        var fridayArr = [];
        var saturdayArr = [];
        var totalData = [];
        var prodArr = [];
        var arr = [];
        var resultD = results.map(el => el.get({ plain: true }));
        var ids = _.pluck(results, 'outlet_id');
        var wheres = {};
        var today = moment().format('dddd');

        var totalD = async function (item) {
            var days = JSON.parse(item.project_days)
            var data = await OutletOpenHours.findAll({
                where: {
                    outlet_id: item.outlet_id,
                    days: { [Op.in]: days }
                },
                include: [{ model: Outlets, where: wheres, required: true }]
            });

            for await (let i of data) {
                var thisData = i;

                thisData.dataValues.Outlet.dataValues.project_id = id;
                if (thisData.days == "monday" && today.toLowerCase() == "monday") {

                    var visit = await controllerFun.getVisit(user_id, thisData.dataValues.Outlet.dataValues.id, id, 'monday');

                    thisData.dataValues.Outlet.dataValues.checkInStatus = visit ? visit.type == 0 ? "Ongoing" : "Visited" : null;
                    thisData.dataValues.Outlet.dataValues.visitation_id = visit ? parseInt(visit.id) : null;
                    thisData.dataValues.Outlet.dataValues.day = 'monday';
                    thisData.dataValues.Outlet.dataValues.execution_url = visit ? await getExecutionUrl(visit) : [];
                    await exports.getOutletDetail({
                        project_id: id,
                        outlet_id: thisData.dataValues.Outlet.dataValues.id,
                        visitation_id: visit ? parseInt(visit.id) : null, user_id
                    }, async function (responseData) {
                        thisData.dataValues.Outlet.dataValues.detail = responseData.code == 200 ? responseData.data : {}
                    });
                    mondayArr.push(thisData.dataValues.Outlet);
                    if (mondayArr.length > 0) {
                        arr.push({
                            day: 'monday',
                            Outlets: mondayArr
                        })
                    }
                }
                if (thisData.days == "tuesday" && today.toLowerCase() == "tuesday") {
                    var visit = await controllerFun.getVisit(user_id, thisData.dataValues.Outlet.dataValues.id, id, 'tuesday');

                    thisData.dataValues.Outlet.dataValues.checkInStatus = visit ? visit.type == 0 ? "Ongoing" : "Visited" : null;
                    thisData.dataValues.Outlet.dataValues.visitation_id = visit ? parseInt(visit.id) : null;
                    thisData.dataValues.Outlet.dataValues.day = 'tuesday';
                    thisData.dataValues.Outlet.dataValues.execution_url = visit ? await getExecutionUrl(visit) : [];
                    await exports.getOutletDetail({
                        project_id: id,
                        outlet_id: thisData.dataValues.Outlet.dataValues.id,
                        visitation_id: visit ? parseInt(visit.id) : null, user_id
                    }, async function (responseData) {
                        thisData.dataValues.Outlet.dataValues.detail = responseData.code == 200 ? responseData.data : {}
                    });
                    tuesdayArr.push(thisData.dataValues.Outlet);
                    if (tuesdayArr.length > 0) {
                        arr.push({
                            day: 'tuesday',
                            Outlets: tuesdayArr
                        })
                    }
                }
                if (thisData.days == "wednesday" && today.toLowerCase() == "wednesday") {
                    var visit = await controllerFun.getVisit(user_id, thisData.dataValues.Outlet.dataValues.id, id, 'wednesday');

                    thisData.dataValues.Outlet.dataValues.checkInStatus = visit ? visit.type == 0 ? "Ongoing" : "Visited" : null;
                    thisData.dataValues.Outlet.dataValues.visitation_id = visit ? parseInt(visit.id) : null;
                    thisData.dataValues.Outlet.dataValues.day = 'wednesday';
                    thisData.dataValues.Outlet.dataValues.execution_url = visit ? await getExecutionUrl(visit) : [];
                    await exports.getOutletDetail({
                        project_id: id,
                        outlet_id: thisData.dataValues.Outlet.dataValues.id,
                        visitation_id: visit ? parseInt(visit.id) : null, user_id
                    }, async function (responseData) {
                        thisData.dataValues.Outlet.dataValues.detail = responseData.code == 200 ? responseData.data : {}
                    });
                    weddayArr.push(thisData.dataValues.Outlet);
                    if (weddayArr.length > 0) {
                        arr.push({
                            day: 'wednesday',
                            Outlets: weddayArr
                        })
                    }
                }
                if (thisData.days == "thursday" && today.toLowerCase() == "thursday") {
                    var visit = await controllerFun.getVisit(user_id, thisData.dataValues.Outlet.dataValues.id, id, 'thursday');

                    thisData.dataValues.Outlet.dataValues.checkInStatus = visit ? visit.type == 0 ? "Ongoing" : "Visited" : null;
                    thisData.dataValues.Outlet.dataValues.visitation_id = visit ? parseInt(visit.id) : null;
                    thisData.dataValues.Outlet.dataValues.day = 'thursday';
                    thisData.dataValues.Outlet.dataValues.execution_url = visit ? await getExecutionUrl(visit) : [];
                    await exports.getOutletDetail({
                        project_id: id,
                        outlet_id: thisData.dataValues.Outlet.dataValues.id,
                        visitation_id: visit ? parseInt(visit.id) : null, user_id
                    }, async function (responseData) {
                        thisData.dataValues.Outlet.dataValues.detail = responseData.code == 200 ? responseData.data : {}
                    });
                    thursdayArr.push(thisData.dataValues.Outlet);
                    if (thursdayArr.length > 0) {
                        arr.push({
                            day: 'thursday',
                            Outlets: thursdayArr
                        })
                    }
                }
                if (thisData.days == "friday" && today.toLowerCase() == "friday") {
                    var visit = await controllerFun.getVisit(user_id, thisData.dataValues.Outlet.dataValues.id, id, 'friday');

                    thisData.dataValues.Outlet.dataValues.checkInStatus = visit ? visit.type == 0 ? "Ongoing" : "Visited" : null;
                    thisData.dataValues.Outlet.dataValues.visitation_id = visit ? parseInt(visit.id) : null;
                    thisData.dataValues.Outlet.dataValues.day = 'friday';
                    thisData.dataValues.Outlet.dataValues.execution_url = visit ? await getExecutionUrl(visit) : [];
                    await exports.getOutletDetail({
                        project_id: id,
                        outlet_id: thisData.dataValues.Outlet.dataValues.id,
                        visitation_id: visit ? parseInt(visit.id) : null, user_id
                    }, async function (responseData) {
                        thisData.dataValues.Outlet.dataValues.detail = responseData.code == 200 ? responseData.data : {}
                    });
                    fridayArr.push(thisData.dataValues.Outlet);
                    if (fridayArr.length > 0) {
                        arr.push({
                            day: 'friday',
                            Outlets: fridayArr
                        })
                    }
                }
                if (thisData.days == "saturday" && today.toLowerCase() == "saturday") {
                    var visit = await controllerFun.getVisit(user_id, thisData.dataValues.Outlet.dataValues.id, id, 'saturday');

                    thisData.dataValues.Outlet.dataValues.checkInStatus = visit ? visit.type == 0 ? "Ongoing" : "Visited" : null;
                    thisData.dataValues.Outlet.dataValues.visitation_id = visit ? parseInt(visit.id) : null;
                    thisData.dataValues.Outlet.dataValues.day = 'saturday';
                    thisData.dataValues.Outlet.dataValues.execution_url = visit ? await getExecutionUrl(visit) : [];
                    await exports.getOutletDetail({
                        project_id: id,
                        outlet_id: thisData.dataValues.Outlet.dataValues.id,
                        visitation_id: visit ? parseInt(visit.id) : null, user_id
                    }, async function (responseData) {
                        thisData.dataValues.Outlet.dataValues.detail = responseData.code == 200 ? responseData.data : {}
                    });
                    saturdayArr.push(thisData.dataValues.Outlet);
                    if (saturdayArr.length > 0) {
                        arr.push({
                            day: 'saturday',
                            Outlets: saturdayArr
                        })
                    }
                }
            }

            return thisData;
        };

        await _.each(results, async function (thisData) {
            totalData.push(totalD(thisData));
        });

        return Promise.all(totalData).then(async function () {
            var result = arr.filter(function (a) {
                var r = a.Outlets.filter(function (b) {
                    return (!this[b.id]) && (this[b.id] = true);
                }, Object.create(null));
                a.Outlets = r;
                return (!this[a.day]) && (this[a.day] = true);
            }, Object.create(null));

            result.sort(function (a, b) {
                return weekorder[a.day] - weekorder[b.day];
            });


            var other = await controllerFun.getVisit(user_id, null, id, 'others', ids, today.toLowerCase());

            if (other && other.length > 0) {
                var promise = [];
                var otherD = async function (othe) {
                    var out = await Outlets.findOne({ where: { id: othe.outlet_id } });
                    out.dataValues.project_id = id;
                    out.dataValues.checkInStatus = othe ? othe.type == 0 ? "Ongoing" : "Visited" : null;
                    out.dataValues.visitation_id = othe ? parseInt(othe.id) : null;
                    out.dataValues.day = 'others';
                    out.dataValues.execution_url = othe ? await getExecutionUrl(othe) : [];

                    await exports.getOutletDetail({
                        project_id: id,
                        outlet_id: othe.outlet_id,
                        visitation_id: othe ? parseInt(othe.id) : null, user_id
                    }, async function (responseData) {
                        out.dataValues.detail = responseData.code == 200 ? responseData.data : {}
                    });

                    var current = new Date(othe.check_in).getDay();

                    var currDay = "";
                    for (key in weekorder) {
                        if (weekorder.hasOwnProperty(key)) {
                            var value = weekorder[key];

                            if (value == (current + 1)) {
                                currDay = key;
                            }
                        }
                    }

                    var foundDay = false;
                    if (result && result.length > 0) {
                        await result.map(item => {
                            if (item.day === currDay && today.toLowerCase() === currDay) {
                                foundDay = true;
                                item.Outlets.push(out);
                            }
                        });
                        if (foundDay == false && today.toLowerCase() === currDay) {
                            var obj = {
                                day: currDay,
                                date: daysArr[current],
                                Outlets: []
                            }
                            obj.Outlets.push(out);
                            result.push(obj);
                        }
                    } else if (result.length == 0 && othe && today.toLowerCase() === currDay) {
                        var obj = {
                            day: currDay,
                            Outlets: []
                        }
                        obj.Outlets.push(out);
                        result.push(obj);
                    }
                    return othe;
                }

                await _.each(other, async function (thisItem) {
                    promise.push(otherD(thisItem));
                });

                return Promise.all(promise).then(async function () {
                    var resultD = Object.values(
                        result.reduce((r, c) => {
                            r[c.day] = r[c.day] || {
                                day: c.day,
                                date: c.date,
                                Outlets: new Set()
                            };

                            c.Outlets.forEach((item) => r[c.day].Outlets.add(item));
                            return r;
                        }, Object.create(null))
                    )
                        .map((x) => ({
                            day: x.day,
                            date: x.date,
                            Outlets: [...x.Outlets]
                        }));

                    resultD.filter(function (a) {
                        var r = a.Outlets && a.Outlets.length > 0 && a.Outlets.filter(function (b) {
                            return (!this[b.id]) && (this[b.id] = true);
                        }, Object.create(null));
                        a.Outlets = r;
                        return (!this[a.day]) && (this[a.day] = true);
                    }, Object.create(null));

                    return callback({
                        code: 200,
                        data: resultD,
                    });
                });
            } else {
                return callback({
                    code: 200,
                    data: result,
                });
            }



        }).catch(function (err) {
            console.log(err)
            return callback({
                code: 400,
                data: null
            });
        });

    })

};

module.exports.getProdStock = async function (project_id, callback) {
    await Brands.findAll({
        where: {
            status: 1,
        },
        attributes: ['id', 'name'],
        order: [['sort_order', 'ASC']],
        include: [{
            model: Products, where: { status: 1 }, order: [['createdAt', 'DESC']], required: true,
            attributes: ['id', 'name', 'image_url', 'amount'], include: [{
                model: Stocks,
            }]
        }],
    }).then(async data => {
        var totalData = [];
        var totalD = async function (thisData) {
            for await (let i of thisData.Products) {
                if (i.Stocks.length > 0) {
                    for await (let k of i.Stocks) {
                        if (k.project_id == project_id && k.isReset == 0) {
                            var order = await exports.getTotalStock(k.id);
                            var open = order.open.toString();
                            i.dataValues['stock_id'] = k.id;
                            i.dataValues['balance'] = open.includes("-") ? 0 : parseInt(order.open);
                            break;
                        } else {
                            i.dataValues['stock_id'] = 0;
                            i.dataValues['balance'] = 0;
                        }
                    }
                } else {
                    i.dataValues['stock_id'] = 0;
                    i.dataValues['balance'] = 0;
                }
                delete i.dataValues.Stocks;
            }

            return thisData;
        };

        await _.each(data, async function (thisData) {
            totalData.push(totalD(thisData));
        });

        Promise.all(totalData).then(results => {
            return callback({ code: 200, data: { results } });
        });
    });
}