const whitelist = require("../../utils/whitelist");

module.exports = {
  table: "transactions",
  whitelist: (data) =>
    whitelist(data, [
      id,
      hash,
      block,
      from,
      to,
      value,
      transaction_time,
      transaction_status,
      functionType,
      unix_timestamp,
      Status,
      State,
      nonce,
      type,
      node_id,
      gas,
      gas_price,
      input
    ]),
};
