const whitelist = require("../../utils/whitelist");

module.exports = {
  table: "alerts",
  whitelist: (data) =>
    whitelist(data, [
      id,
      block_number
    ]),
};
