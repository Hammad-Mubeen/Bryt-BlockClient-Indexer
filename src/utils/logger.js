const cloneDeep = require("lodash.clonedeep");
const winston = require("winston");
const config = process.env;

/*
  error
  warn
  info
  verbose
  debug
  silly
*/

const logger = winston.createLogger({
  level: config.LOG_LEVEL || "info",
  format: winston.format.combine(
    winston.format.json(),
    winston.format.timestamp({
      format: "YYYY-MM-DD hh:mm:ss.SSS A ZZ",
    })
  ),
  // disable in aws lambda
  transports: [
    //
    // - Write to all logs with level `info` and below to `combined.log`
    // - Write all logs error (and below) to `error.log`.
    //
    new winston.transports.File({
      filename: "/tmp/error.log",
      level: "error",
      format: winston.format.combine(
        winston.format.timestamp({
          format: "YYYY-MM-DD hh:mm:ss.SSS A ZZ",
        }),
        winston.format.json()
      ),
    }),
    new winston.transports.File({
      filename: "/tmp/combined.log",
      format: winston.format.combine(
        winston.format.timestamp({
          format: "YYYY-MM-DD hh:mm:ss.SSS A ZZ",
        }),
        winston.format.json()
      ),
    }),
  ],
});

const masks = {
  email: "HIDDEN_EMAIL",
  first_name: "HIDDEN_FIRST_NAME",
  last_name: "HIDDEN_LAST_NAME",
  name: "HIDDEN_NAME",
  password: "HIDDEN_PASSWORD",
  newPassword: "HIDDEN_NEW_PASSWORD",
  address1: "HIDDEN_ADDRESS1",
  address2: "HIDDEN_ADDRESS2",
  zip_code: "HIDDEN_ZIP_CODE",
  avatar_url: "HIDDEN_AVATAR_URL",
  public_url: "HIDDEN_PUBLIC_URL",
  cell_phone: "HIDDEN_CELL_PHONE",
  home_phone: "HIDDEN_HOME_PHONE",
  work_phone: "HIDDEN_WORK_PHONE",
  emergency_contact_first_name: "HIDDEN_EMERGENCY_CONTACT_FIRST_NAME",
  emergency_contact_last_name: "HIDDEN_EMERGENCY_CONTACT_LAST_NAME",
  emergency_contact_email: "HIDDEN_EMERGENCY_CONTACT_EMAIL",
  emergency_contact_cell_phone: "HIDDEN_EMERGENCY_CONTACT_CELL_PHONE",
  emergency_contact_home_phone: "HIDDEN_EMERGENCY_CONTACT_HOME_PHONE",
  emergency_contact_work_phone: "HIDDEN_EMERGENCY_CONTACT_WORK_PHONE",
  physician_first_name: "HIDDEN_PHYSICIAN_FIRST_NAME",
  physician_last_name: "HIDDEN_PHYSICIAN_LAST_NAME",
  physician_phone: "HIDDEN_PHYSICIAN_CELL_PHONE",
  primary_contact_name: "HIDDEN_PRIMARY_CONTACT_NAME",
  primary_contact_email: "HIDDEN_PRIMARY_CONTACT_EMAIL",
  tax_id: "HIDDEN_TAX_ID",
  billing_account_number: "HIDDEN_BILLING_ACCOUNT_NUMBER",
  funding_account_number: "HIDDEN_FUNDING_ACCOUNT_NUMBER",
  billing_routing_number: "HIDDEN_BILLING_ROUTING_NUMBER",
  funding_routing_number: "HIDDEN_FUNDING_ROUTING_NUMBER",
  card: "HIDDEN_CREDIT_CARD",
  exp_month: "HIDDEN_EXP_MONTH",
  exp_year: "HIDDEN_EXP_YEAR",
  cvc: "HIDDEN_CVC",
  address_city: "HIDDEN_ADDRESS_CITY",
  address_country: "HIDDEN_ADDRESS_COUNTRY",
  address_line: "HIDDEN_ADDRESS_LINE",
  address_state: "HIDDEN_ADDRESS_STATE",
  address_zip: "HIDDEN_ADDRESS_ZIP",
  phone_number: "HIDDEN_PHONE_NUMBER",
};

const recursiveHide = (obj, current) => {
  for (const key in obj) {
    const value = obj[key];
    if (value !== undefined) {
      if (value && typeof value === "object") {
        recursiveHide(value, key);
      } else if (masks[key]) {
        // Do your stuff here to var value
        obj[key] = masks[key];
      }
    }
  }
};

if (config.APP_ENV !== "test") {
  logger.add(
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple(),
        // to show in cloudwatch
        winston.format((info) => {
          if (config.APP_ENV !== "local") {
            const cloneInfo = cloneDeep(info);
            recursiveHide(cloneInfo);
            console.log(cloneInfo);
          }
        })()
      ),
    })
  );
}

module.exports = logger;
module.exports.stream = {
  write: function (message, encoding) {
    logger.info(message.trim());
  },
};
