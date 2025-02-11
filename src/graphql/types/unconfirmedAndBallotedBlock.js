const {
    GraphQLObjectType,
    GraphQLID,
    GraphQLString,
    GraphQLList
} = require("graphql");

const unconfirmedAndBallotedBlockType = new GraphQLObjectType({
  
    name: "unconfirmedAndBallotedBlock",
    description: "unconfirmedAndBallotedBlock type",
    fields: () => ({
        type: {type : GraphQLString},
        blockNumber: {type : GraphQLString},
        totalTransactions: {type : GraphQLString}
  })
});
  
module.exports = { unconfirmedAndBallotedBlockType };

