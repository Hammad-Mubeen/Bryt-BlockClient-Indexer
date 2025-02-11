const whitelist = require("../../utils/whitelist");

module.exports = {
  table: "unconfirmedAndBallotedBlock",
  whitelist: (data) =>
    whitelist(data, [
      id,
      unconfirmed_blocknumber,
      unconfirmed_total_transactions,
      balloted_blocknumber,
      balloted_total_transactions
    ]),
};
