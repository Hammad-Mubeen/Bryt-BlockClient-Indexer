const whitelist = require("../../utils/whitelist");

module.exports = {
  table: "replayBlocks",
  whitelist: (data) =>
    whitelist(data, [
        id,
        replayBlocks,
        lastBlock,
        latestBlock,
        Status
    ]),
};
