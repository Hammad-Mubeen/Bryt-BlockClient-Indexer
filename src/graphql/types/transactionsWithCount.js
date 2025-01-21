const {
    GraphQLObjectType,
    GraphQLList,
    GraphQLString
} = require("graphql");

const { transactionsType } = require('./transactions');

const transactionsWithCountType = new GraphQLObjectType({
  
    name: "transactionsWithCount",
    description: "transactions with count type",
    fields: () => ({
        transactions: {type: GraphQLList(transactionsType)},
        count: {type:  GraphQLString}
  })
});
  
module.exports = { transactionsWithCountType };

