const whitelist = require("../../utils/whitelist");

module.exports = {
  table: "failedTxs",
  whitelist: (data) =>
    whitelist(data, [
      hash,
      mempoolToBalloted,
      ballotedToFinalized
    ]),
};
