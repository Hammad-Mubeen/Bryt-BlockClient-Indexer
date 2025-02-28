const whitelist = require("../../utils/whitelist");

module.exports = {
  table: "unconfirmedTransactionsQueue",
  whitelist: (data) =>
    whitelist(data, [
      hash,
      Status,
      timestamp,
      data
    ]),
};
