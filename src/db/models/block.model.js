const whitelist = require("../../utils/whitelist");

module.exports = {
  table: "blocks",
  whitelist: (data) =>
    whitelist(data, [
      id,
      version,
      merkle_root,
      block_number,
      previous_hash,
      state_root,
      transaction_root,
      reciept_root,
      timestamp,
      logs_bloom,
      transactions,
      block_reward,
      value,
      data,
      to,
      block_hash
    ]),
};
