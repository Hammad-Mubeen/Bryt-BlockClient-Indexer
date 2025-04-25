const whitelist = require("../../utils/whitelist");

module.exports = {
  table: "queue",
  whitelist: (data) =>
    whitelist(data, [
      type,
      hash,
      Status,
      timestamp,
      data
    ])
};
