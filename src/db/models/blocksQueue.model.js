const whitelist = require("../../utils/whitelist");

module.exports = {
  table: "blocksQueue",
  whitelist: (data) =>
    whitelist(data, [
      hash,
      Status,
      timestamp,
      data
    ]),
};
