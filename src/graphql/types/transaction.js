const {
    GraphQLObjectType,
    GraphQLID,
    GraphQLString,
    GraphQLBoolean
} = require("graphql");


const transactionsType = new GraphQLObjectType({
  
    name: "transactions",
    description: "transactions type",
    fields: () => ({
        id: {type: GraphQLID },
        order: {type: GraphQLString },
        hash: {type: GraphQLString },
        block: {type: GraphQLString },
        from: {type: GraphQLString },
        to: {type: GraphQLString },
        value: {type: GraphQLString },
        transaction_time: {type: GraphQLString },
        transaction_status: {type: GraphQLBoolean },
        functionType: {type: GraphQLString },
        unix_timestamp: {type: GraphQLString },
        Status: {type: GraphQLBoolean},
        State: {type: GraphQLBoolean},
        nonce: {type: GraphQLString },
        type: {type: GraphQLString },
        node_id: {type: GraphQLString },
        gas: {type: GraphQLString },
        gas_price: {type: GraphQLString },
        input: {type: GraphQLString }
  })
});
  
module.exports = { transactionsType };

