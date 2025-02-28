const {
    GraphQLObjectType,
    GraphQLID,
    GraphQLString,
    GraphQLList
} = require("graphql");

const { transactionsType } = require('./transactions');
const { queueType } = require('./queue');

const transactionHistoryType = new GraphQLObjectType({
  
    name: "transactionHistory",
    description: "transactionHistory type",
    fields: () => ({
        unconfirmedTransactionHistory: {type : queueType},
        ballotedTransactionHistory: {type : queueType},
        confirmedTransactionHistory: {type : transactionsType}
  })
});
  
module.exports = { transactionHistoryType };

