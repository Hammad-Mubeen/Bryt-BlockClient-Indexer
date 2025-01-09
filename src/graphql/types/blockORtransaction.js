const {
    GraphQLObjectType,
    GraphQLList
} = require("graphql");

const { blocksType } = require('./block');
const { transactionsType }= require('./transaction');

const blocksORtransactionsType = new GraphQLObjectType({
  
    name: "blocksORtransactions",
    description: "block and transaction type",
    fields: () => ({
        block: {type: blocksType },
        transaction: {type: transactionsType },
        transactions: {type: GraphQLList(transactionsType)}
  })
});
  
module.exports = { blocksORtransactionsType };

