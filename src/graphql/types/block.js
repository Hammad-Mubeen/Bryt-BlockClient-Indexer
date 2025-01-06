const {
    GraphQLObjectType,
    GraphQLID,
    GraphQLString,
    GraphQLList
} = require("graphql");

const blocksType = new GraphQLObjectType({
  
    name: "blocks",
    description: "blocks type",
    fields: () => ({
        id: {type: GraphQLID },
        version: {type: GraphQLString },
        merkle_root: {type: GraphQLString },
        block_number: {type: GraphQLString },
        previous_hash: {type: GraphQLString },
        state_root: {type: GraphQLString },
        transaction_root: {type: GraphQLString },
        reciept_root: {type: GraphQLString },
        timestamp: {type: GraphQLString },
        logs_bloom: {type: GraphQLString },
        transactions: {type: GraphQLList(GraphQLString)},
        block_reward: {type: GraphQLString },
        value: {type: GraphQLString },
        data: {type: GraphQLString },
        to: {type: GraphQLString },
        block_hash: {type: GraphQLString }
  })
});
  
module.exports = { blocksType };

