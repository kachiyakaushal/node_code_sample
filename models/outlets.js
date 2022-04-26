"use strict";

module.exports = (sequelize, DataTypes) => {
   var Outlets = sequelize.define(
      "Outlets",
      {
         id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true
         },
         outlet_name: DataTypes.STRING,
         outlet_url: DataTypes.STRING,
         address: DataTypes.STRING,
         outlet_email: DataTypes.STRING,
         outlet_contact: DataTypes.STRING,
         postal_code: DataTypes.STRING,
         city: DataTypes.STRING,
         state: DataTypes.STRING,
         owner_name: DataTypes.STRING,
         owner_email: DataTypes.STRING,
         owner_contact: DataTypes.STRING,
         person_name: DataTypes.STRING,
         person_email: DataTypes.STRING,
         person_contact: DataTypes.STRING,
         status: DataTypes.TINYINT, // 0: Inactive, 1: Active
         deletedAt: { type: DataTypes.DATE, defaultValue: null }
      },
      {
         freezeTableName: true,
         tableName: "outlets",
         paranoid: true,
         getterMethods: {
            outlet_url: function () {
               var signatureUrl = this.getDataValue('outlet_url');
               if (signatureUrl) {
                  var baseurl = CONFIG.LIVE_IMAGE_URL_PATH + 'media/thumbnail/';
                  return baseurl + signatureUrl;
               }
               return signatureUrl ? signatureUrl : '';
            },
            address: function () {
               var address = this.getDataValue('address');
               var city = this.getDataValue('city');
               var state = this.getDataValue('state');
               var postal_code = this.getDataValue('postal_code');
               if (address) {
                  var baseurl = address + ", " + city + ", " + postal_code + ", " + state;
                  return baseurl;
               }
               return address;
            },
         }
      }
   );

   Outlets.associate = function (models) {
      this.outlet_id = this.hasMany(models.OutletOpenHours, {
         foreignKey: "outlet_id",
         onDelete: 'cascade',
         hooks: true,
      });
      this.outlet_id = this.hasMany(models.Orders, {
         foreignKey: "outlet_id",
         onDelete: 'cascade',
         hooks: true,
      });
      
      this.outlet_id = this.hasMany(models.VisitationHistory, {
         foreignKey: "outlet_id",
         onDelete: 'cascade',
         hooks: true,
      });
   };

   return Outlets;
};