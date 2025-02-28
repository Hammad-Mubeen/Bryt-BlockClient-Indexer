const whitelist = require("../../utils/whitelist");

module.exports = {
  table: "ballotedTransactionsQueue",
  whitelist: (data) =>
    whitelist(data, [
      hash,
      Status,
      timestamp,
      data
    ])
};
