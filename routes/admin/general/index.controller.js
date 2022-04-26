const GeneralConfigs = require("../../../models").GeneralConfigs;
const BrandsVariant = require("../../../models").BrandsVariant;
const Orders = require("../../../models").Orders;
const sequelize = require("../../../models").sequelize;
// var notificationEvents = require("../../../events/notificationEvents").notificationEmitter;
var Sequelize = require("sequelize");
const Op = Sequelize.Op;
var _ = require("underscore");

module.exports.general_configs = async function (req, res, next) {
    await GeneralConfigs.findOne({ where: { id: 1 } }).then(result => {
        if (result) {
            result.dataValues.gender = result.dataValues.gender && JSON.parse(result.dataValues.gender);
            result.dataValues.age_group = result.dataValues.age_group && JSON.parse(result.dataValues.age_group);
            result.dataValues.group_segment = result.dataValues.group_segment && JSON.parse(result.dataValues.group_segment);
            // result.dataValues.brands_variant = result.dataValues.brands_variant && JSON.parse(result.dataValues.brands_variant);
            // result.dataValues.company_brand = result.dataValues.company_brand && JSON.parse(result.dataValues.company_brand);
            return ReS(res, "General configs found!", { payload: result });
        } else {
            return ReE(res, "No general configs found!");
        }
    })
};

module.exports.updateConfigs = async function (req, res, next) {
    var postdata = req.body;
    var generalConfigsExist = await GeneralConfigs.findOne({
        where: {
            id: 1,
        }
    }).catch(err => { });
    if (generalConfigsExist) {
        await GeneralConfigs.update(postdata, {
            where: {
                id: 1
            }
        }).then((updated) => {
            return ReS(res, "General Configs updated successfully!");
        }).catch(err => {
            return ReE(res, err, 400);
        });
    }

}

module.exports.brands_variant = async function (req, res, next) {
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
            { brands: { [Op.substring]: query.search } }
        ];
    }

    if (query.status) {
        wheres[Op.or] = [{
            status: query.status
        }]
    }

    await BrandsVariant.findAndCountAll({
        where: wheres,
        limit: limit,
        offset: offset,
        order: [[sortBy, sortOrder]],
    }).then(data => {
        return ReS(res, "Brands variant fetched successfully.", {
            payload: {
                data: { count: data.count, rows: data.rows }
            }
        });
    }).catch(err => {
        return ReE(res, err, 400);
    });
}

module.exports.create_brands_variant = async function (req, res, next) {
    var postdata = req.body;
    var exist = await BrandsVariant.findOne({
        where: {
            brands: postdata.brands,
        }
    }).catch(err => { });
    if (!exist) {
        postdata.status = 1;
        postdata.variants = JSON.stringify(postdata.variants);
        await BrandsVariant.create(postdata).then((updated) => {
            return ReS(res, "General Configs updated successfully!");
        }).catch(err => {
            return ReE(res, err, 400);
        });
    } else {
        return ReE(res, "Brand with same name exist!", 400);
    }
}

module.exports.update_brands_variant = async function (req, res, next) {
    var postdata = req.body;

    if (postdata.type == "updateStatus") {
        wheres = { id: postdata.id }

        await BrandsVariant.update(postdata, {
            where: {
                id: postdata.id
            }
        }).then((updated) => {
            if (updated) {
                return ReS(res, "Brands variant updated successfully!");
            } else {
                return ReE(res, "Failed to update brands status!", 400);
            }
        }).catch(err => {
            return ReE(res, err, 400);
        });
    } else {
        var exist = await BrandsVariant.findOne({
            where: {
                id: { [Op.ne]: postdata.id },
                brands: postdata.brands
            }
        }).catch(err => { });
        if (!exist) {
            postdata.variants = JSON.stringify(postdata.variants);
            await BrandsVariant.update(postdata, {
                where: {
                    id: postdata.id
                }
            }).then((updated) => {
                return ReS(res, "Brands variant updated successfully!");
            }).catch(err => {
                return ReE(res, err, 400);
            });
        } else {
            return ReE(res, "Brand with same name exist!", 400);
        }
    }
}

module.exports.delete_brands_variant = async function (req, res, next) {
    var postdata = req.body;

    await BrandsVariant.findOne({
        where: {
            id: postdata.id
        }
    }).then(async (updated) => {
        if (updated) {
            var found = await Orders.findAll({
                where: {
                    brands_variant: { [Op.notIn]: [null, '[]'] }
                }
            });

            var t = _.pluck(found, 'brands_variant');
            var merged = [].concat.apply([], t);
            var exist = updated.variants.some(item => merged.includes(item));

            if (exist) {
                return ReS(res, "You can't delete brands & variants as it is associated with users, kindly change status!");
            } else {
                await BrandsVariant.update({
                    deletedAt: new Date()
                }, {
                    where: {
                        id: postdata.id
                    }
                }).then((updated) => {
                    return ReS(res, "Brands variant deleted successfully!");
                }).catch(err => {
                    return ReE(res, err, 400);
                });
            }
        } else {
            return ReE(res, "Failed to update brands status!", 400);
        }
    }).catch(err => {
        return ReE(res, err, 400);
    });
}